import { and, asc, count, desc, eq, gte, lt, ne, sql, inArray } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { getDefaultRestSeconds } from './rest-settings';
import { isUserExercise } from '@/lib/exercise-sources';
import { resolveSetSeed, seedForNewSet, type LastPerformance } from '@/lib/set-prefill';
import { repeatPlan } from '@/lib/repeat-workout';
import { distanceRecord, trackFor, type TrackMode } from '@/lib/track-mode';
import { getTrackPrefs, rememberTrack } from './track-prefs';
import { mirrorWorkout, mirrorWorkoutRemoved } from '@/lib/health/mirror';
import {
  livePr,
  prFor,
  recordFrom,
  type ExerciseRecord,
  type PrKind,
  type PrResult,
  type RecordSet,
} from '@/lib/personal-records';
import {
  exercises,
  routineExercises,
  routines,
  sessionExercises,
  sets,
  workoutSessions,
  type Exercise,
  type Routine,
  type RoutineExercise,
  type SessionExercise,
  type SessionStatus,
  type WorkoutSession,
  type WorkoutSet,
} from './schema';
import { moveInOrder } from '@/lib/reorder';
import { groupForLink } from '@/lib/superset';

export type SessionExerciseWithMeta = SessionExercise & {
  exerciseName: string;
  primaryMuscles: string[];
  equipment: string | null;
  /** First picture: a library image path, or a photo you took. Null when there is none. */
  image: string | null;
  /** 'custom' / 'imported' for one you made, which can be given a photo. */
  category: string | null;
  /** Heaviest completed working set in a finished session, with its unit. */
  best: { weight: number; unit: string } | null;
  sets: WorkoutSet[];
  /** What was lifted the last time this exercise was completed, for the UI hint. */
  lastPerformance: LastPerformance | null;
};

export type ActiveWorkout = {
  session: WorkoutSession;
  exercises: SessionExerciseWithMeta[];
};

export type WorkoutSummary = {
  session: WorkoutSession;
  exerciseCount: number;
  totalSets: number;
  completedSets: number;
  durationMs: number;
  exercises: { name: string; setCount: number }[];
};

export async function listRoutines(): Promise<Routine[]> {
  return db.select().from(routines).orderBy(asc(routines.name));
}

export type RoutineListItem = Routine & {
  exerciseCount: number;
  /** The first few exercise names, so a row says what the routine actually is. */
  names: string[];
};

/**
 * Routines with enough detail to tell them apart.
 *
 * "Day 1", "Day 2", "NEW DAY ONE" — an imported list is full of names that say
 * nothing, so the row has to show what is in it before anyone can decide which
 * one to delete.
 */
export async function listRoutinesWithDetail(): Promise<RoutineListItem[]> {
  const list = await listRoutines();
  if (list.length === 0) return [];

  const rows = await db
    .select({
      routineId: routineExercises.routineId,
      position: routineExercises.position,
      name: exercises.name,
    })
    .from(routineExercises)
    .leftJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(
      inArray(
        routineExercises.routineId,
        list.map((r) => r.id)
      )
    )
    .orderBy(asc(routineExercises.position));

  const byRoutine = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.routineId, (counts.get(r.routineId) ?? 0) + 1);
    if (!r.name) continue;
    const names = byRoutine.get(r.routineId) ?? [];
    if (names.length < 3) names.push(r.name);
    byRoutine.set(r.routineId, names);
  }

  return list.map((r) => ({
    ...r,
    exerciseCount: counts.get(r.id) ?? 0,
    names: byRoutine.get(r.id) ?? [],
  }));
}

export async function getRoutineExercises(routineId: string): Promise<(RoutineExercise & { exerciseName: string })[]> {
  const rows = await db
    .select({
      id: routineExercises.id,
      routineId: routineExercises.routineId,
      exerciseId: routineExercises.exerciseId,
      position: routineExercises.position,
      targetSets: routineExercises.targetSets,
      targetReps: routineExercises.targetReps,
      restSeconds: routineExercises.restSeconds,
      notes: routineExercises.notes,
      track: routineExercises.track,
      exerciseName: exercises.name,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(asc(routineExercises.position));
  return rows;
}

export async function getInProgressSession(): Promise<WorkoutSession | null> {
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.status, 'in_progress'))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionById(id: string): Promise<WorkoutSession | null> {
  const rows = await db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function loadActiveWorkout(sessionId: string): Promise<ActiveWorkout | null> {
  const session = await getSessionById(sessionId);
  if (!session) return null;

  const seRows = await db
    .select({
      id: sessionExercises.id,
      sessionId: sessionExercises.sessionId,
      exerciseId: sessionExercises.exerciseId,
      position: sessionExercises.position,
      restSeconds: sessionExercises.restSeconds,
      notes: sessionExercises.notes,
      supersetGroup: sessionExercises.supersetGroup,
      track: sessionExercises.track,
      exerciseName: exercises.name,
      primaryMuscles: exercises.primaryMuscles,
      equipment: exercises.equipment,
      images: exercises.images,
      category: exercises.category,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position));

  const exerciseList: SessionExerciseWithMeta[] = [];
  for (const se of seRows) {
    const setRows = await db
      .select()
      .from(sets)
      .where(eq(sets.sessionExerciseId, se.id))
      .orderBy(asc(sets.setIndex));

    // Best = heaviest working set actually finished. An abandoned session is
    // full of pre-filled numbers nobody lifted, and a drop set is not a best.
    const bestRow = await db
      .select({ weight: sets.weight, unit: sets.weightUnit })
      .from(sets)
      .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(sessionExercises.exerciseId, se.exerciseId),
          ne(workoutSessions.id, sessionId),
          eq(workoutSessions.status, 'completed'),
          eq(sets.completed, true),
          eq(sets.isWarmup, false),
          eq(sets.setType, 'normal'),
          sql`${sets.weight} > 0`
        )
      )
      .orderBy(desc(sets.weight))
      .limit(1);
    const best = bestRow[0]?.weight != null
      ? { weight: bestRow[0].weight, unit: bestRow[0].unit ?? 'lb' }
      : null;
    const images = (() => {
      try {
        const v = JSON.parse(se.images ?? '[]');
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })();

    exerciseList.push({
      id: se.id,
      sessionId: se.sessionId,
      exerciseId: se.exerciseId,
      position: se.position,
      restSeconds: se.restSeconds,
      notes: se.notes,
      supersetGroup: se.supersetGroup,
      track: se.track,
      exerciseName: se.exerciseName,
      primaryMuscles: JSON.parse(se.primaryMuscles ?? '[]'),
      equipment: se.equipment,
      image: typeof images[0] === 'string' ? images[0] : null,
      category: se.category,
      best,
      sets: setRows,
      lastPerformance: await getLastPerformance(se.exerciseId, sessionId),
    });
  }

  return { session, exercises: exerciseList };
}

/**
 * The most recent completed performance of an exercise, for pre-filling.
 *
 * Keyed by exercise, deliberately — not by routine, and not by routine plus
 * exercise. Your bench is your bench whether today's is in Push Day A, a
 * freestyle session, or a routine built last night and never run; scoping it
 * per routine would hand you an empty box on exactly the session where you are
 * least sure what to load, and fragment one lift's history across every
 * routine that contains it. Where routines legitimately differ is the rep
 * target, and resolveSetSeed already takes reps from the routine's plan while
 * taking weight from what was actually lifted.
 *
 * Only completed sets of completed sessions count: an abandoned workout is full
 * of pre-filled values nobody lifted, and seeding from those would compound a
 * guess into a record.
 *
 * `excludeSessionId` keeps the session being built now out of its own history.
 *
 * Warm-ups, drop sets and rest-pause sets are excluded outright: the list is
 * what working set N starts from, and an empty bar or a drop set's lighter
 * weight in position 1 would pre-fill the wrong number. Warm-ups seed from the
 * warm-up before them instead — see seedForNewSet.
 */
export async function getLastPerformance(
  exerciseId: string,
  excludeSessionId?: string
): Promise<LastPerformance | null> {
  // Working sets only. A warm-up is the empty bar and a drop set is the
  // lighter tail of a set; neither is what set 1 should start from next week.
  const where = [
    eq(sessionExercises.exerciseId, exerciseId),
    eq(sets.completed, true),
    eq(sets.isWarmup, false),
    eq(sets.setType, 'normal'),
    eq(workoutSessions.status, 'completed'),
  ];
  if (excludeSessionId) where.push(ne(workoutSessions.id, excludeSessionId));

  // Identify the exact block, not just the session: an exercise may appear more
  // than once in one workout, and matching on session + exercise would merge
  // both blocks into one interleaved list of set indices.
  const recent = await db
    .select({
      sessionExerciseId: sessionExercises.id,
      startedAt: workoutSessions.startedAt,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(and(...where))
    .orderBy(desc(workoutSessions.startedAt), desc(sessionExercises.position))
    .limit(1);

  const found = recent[0];
  if (!found) return null;

  const setRows = await db
    .select({
      reps: sets.reps,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      distanceM: sets.distanceM,
    })
    .from(sets)
    .where(
      and(
        eq(sets.sessionExerciseId, found.sessionExerciseId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal')
      )
    )
    .orderBy(asc(sets.setIndex));

  if (setRows.length === 0) return null;
  return { performedAt: found.startedAt, sets: setRows };
}

export async function startFreestyleWorkout(): Promise<string> {
  const id = newId('ws');
  await db.insert(workoutSessions).values({
    id,
    routineId: null,
    startedAt: new Date(),
    endedAt: null,
    status: 'in_progress',
    notes: null,
  });
  return id;
}

export async function startRoutineWorkout(routineId: string): Promise<string> {
  const id = newId('ws');
  await db.insert(workoutSessions).values({
    id,
    routineId,
    startedAt: new Date(),
    endedAt: null,
    status: 'in_progress',
    notes: null,
  });

  const rex = await getRoutineExercises(routineId);
  const fallbackRest = await getDefaultRestSeconds();
  const prefs = await getTrackPrefs();
  for (const [i, re] of rex.entries()) {
    const seId = newId('se');
    const rest = re.restSeconds ?? fallbackRest;
    const track = re.track ?? trackFor(re.exerciseId, re.exerciseName, prefs);
    await db.insert(sessionExercises).values({
      id: seId,
      sessionId: id,
      exerciseId: re.exerciseId,
      position: i,
      restSeconds: rest,
      notes: re.notes,
      track,
    });
    // Non-negotiable #1: start from what was lifted last time, so the first
    // action of the session is confirming a number rather than typing one.
    const last = await getLastPerformance(re.exerciseId, id);
    const targetSets = re.targetSets ?? 3;
    for (let s = 0; s < targetSets; s++) {
      const seed = resolveSetSeed({ last, index: s, targetReps: re.targetReps ?? null });
      await db.insert(sets).values({
        id: newId('set'),
        sessionExerciseId: seId,
        setIndex: s,
        ...forTrack(track, { reps: seed.reps ?? 10, distanceM: seed.distanceM }),
        weight: seed.weight,
        weightUnit: seed.weightUnit,
        completed: false,
        isWarmup: false,
        rpe: null,
      });
    }
  }

  return id;
}

/**
 * A new session with the same exercises, order and supersets as an old one.
 * Weights pre-fill from each lift's last completed performance, as always.
 */
export async function repeatWorkout(sourceSessionId: string): Promise<string> {
  const source = await loadActiveWorkout(sourceSessionId);
  if (!source || source.exercises.length === 0) {
    throw new Error('That workout has no exercises to repeat.');
  }
  const plan = repeatPlan(source.exercises, () => newId('ss'));

  const id = newId('ws');
  await db.insert(workoutSessions).values({
    id,
    routineId: source.session.routineId,
    startedAt: new Date(),
    endedAt: null,
    status: 'in_progress',
    notes: null,
  });
  const fallbackRest = await getDefaultRestSeconds();
  for (const [i, item] of plan.entries()) {
    const seId = newId('se');
    await db.insert(sessionExercises).values({
      id: seId,
      sessionId: id,
      exerciseId: item.exerciseId,
      position: i,
      restSeconds: item.restSeconds ?? fallbackRest,
      notes: item.notes,
      supersetGroup: item.supersetGroup,
      track: item.track,
    });
    const last = await getLastPerformance(item.exerciseId, id);
    for (let s = 0; s < item.workingSets; s++) {
      const seed = resolveSetSeed({ last, index: s });
      await db.insert(sets).values({
        id: newId('set'),
        sessionExerciseId: seId,
        setIndex: s,
        ...forTrack(item.track, seed),
        weight: seed.weight,
        weightUnit: seed.weightUnit,
        completed: false,
        isWarmup: false,
        rpe: null,
      });
    }
  }
  return id;
}

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  opts?: { restSeconds?: number; targetSets?: number; targetReps?: number; track?: TrackMode }
): Promise<string> {
  const existing = await db
    .select({ n: count() })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));
  const position = existing[0]?.n ?? 0;
  const seId = newId('se');
  const rest = opts?.restSeconds ?? (await getDefaultRestSeconds());
  const [ex] = await db.select({ name: exercises.name }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  const track = opts?.track ?? trackFor(exerciseId, ex?.name ?? '', await getTrackPrefs());
  await db.insert(sessionExercises).values({
    id: seId,
    sessionId,
    exerciseId,
    position,
    restSeconds: rest,
    notes: null,
    track,
  });

  const last = await getLastPerformance(exerciseId, sessionId);
  const targetSets = opts?.targetSets ?? 1;
  for (let s = 0; s < targetSets; s++) {
    const seed = resolveSetSeed({ last, index: s, targetReps: opts?.targetReps ?? null });
    await db.insert(sets).values({
      id: newId('set'),
      sessionExerciseId: seId,
      setIndex: s,
      ...forTrack(track, seed),
      weight: seed.weight,
      weightUnit: seed.weightUnit,
      completed: false,
      isWarmup: false,
      rpe: null,
    });
  }
  return seId;
}

export async function addSet(
  sessionExerciseId: string,
  defaults?: {
    reps?: number | null
    weight?: number | null
    weightUnit?: string
    distanceM?: number | null
    isWarmup?: boolean
    setType?: 'normal' | 'drop' | 'rp'
  }
): Promise<WorkoutSet> {
  const block = await db
    .select()
    .from(sets)
    .where(eq(sets.sessionExerciseId, sessionExerciseId))
    .orderBy(asc(sets.setIndex));
  const previous = block[block.length - 1];
  const setIndex = previous ? previous.setIndex + 1 : 0;

  // Carrying from this session wins; otherwise reach back to the last one,
  // which is what makes the first set of an exercise pre-filled too.
  const owner = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      sessionId: sessionExercises.sessionId,
      track: sessionExercises.track,
    })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, sessionExerciseId))
    .limit(1);
  const lastPerformance = owner[0]
    ? await getLastPerformance(owner[0].exerciseId, owner[0].sessionId)
    : null;

  const setType = defaults?.setType ?? 'normal';
  const isWarmup = defaults?.isWarmup ?? false;
  const seed = seedForNewSet({
    kind: isWarmup ? 'warmup' : setType === 'normal' ? 'working' : setType,
    block,
    last: lastPerformance,
  });

  const row: WorkoutSet = {
    id: newId('set'),
    sessionExerciseId,
    setIndex,
    ...forTrack(owner[0]?.track ?? 'reps', {
      reps: defaults?.reps ?? seed.reps,
      distanceM: defaults?.distanceM ?? seed.distanceM,
    }),
    weight: defaults?.weight ?? seed.weight,
    weightUnit: defaults?.weightUnit ?? seed.weightUnit,
    completed: false,
    isWarmup,
    setType,
    rpe: null,
  };
  await db.insert(sets).values(row);
  return row;
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit' | 'completed' | 'isWarmup' | 'setType' | 'rpe' | 'distanceM'>>
): Promise<void> {
  await db.update(sets).set(patch).where(eq(sets.id, setId));
}

export async function completeSet(
  setId: string,
  values?: { reps?: number | null; weight?: number | null; distanceM?: number | null }
): Promise<WorkoutSet | null> {
  const rows = await db.select().from(sets).where(eq(sets.id, setId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const patch = {
    completed: true as const,
    ...(values?.reps !== undefined ? { reps: values.reps } : {}),
    ...(values?.weight !== undefined ? { weight: values.weight } : {}),
    ...(values?.distanceM !== undefined ? { distanceM: values.distanceM } : {}),
  };
  await db.update(sets).set(patch).where(eq(sets.id, setId));
  return { ...row, ...patch };
}

export async function deleteSet(setId: string): Promise<void> {
  await db.delete(sets).where(eq(sets.id, setId));
}

/** Takes an exercise, and its sets, out of today's session. */
export async function removeSessionExercise(sessionExerciseId: string): Promise<void> {
  await db.delete(sets).where(eq(sets.sessionExerciseId, sessionExerciseId));
  await db.delete(sessionExercises).where(eq(sessionExercises.id, sessionExerciseId));
}

/**
 * Moves an exercise up or down the workout, for when the machine you wanted
 * is taken. Renumbers the whole session from the new order (see moveInOrder).
 */
export async function moveSessionExercise(sessionExerciseId: string, by: -1 | 1): Promise<void> {
  const [owner] = await db
    .select({ sessionId: sessionExercises.sessionId })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, sessionExerciseId))
    .limit(1);
  if (!owner) throw new Error('That exercise is no longer in the workout.');
  const rows = await db
    .select({ id: sessionExercises.id })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, owner.sessionId))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.id));
  const order = moveInOrder(
    rows.map((r) => r.id),
    sessionExerciseId,
    by
  );
  if (!order) return;
  for (let i = 0; i < order.length; i++) {
    await db.update(sessionExercises).set({ position: i }).where(eq(sessionExercises.id, order[i]));
  }
}

/**
 * Links an exercise with the next one in the workout as a superset, or takes
 * it out of its superset. A group left with one member is dissolved, so no
 * exercise is ever "a superset of one".
 */
export async function toggleSupersetWithNext(sessionExerciseId: string): Promise<void> {
  const [owner] = await db
    .select({ sessionId: sessionExercises.sessionId, group: sessionExercises.supersetGroup })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, sessionExerciseId))
    .limit(1);
  if (!owner) throw new Error('That exercise is no longer in the workout.');
  const rows = await db
    .select({ id: sessionExercises.id, supersetGroup: sessionExercises.supersetGroup })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, owner.sessionId))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.id));

  if (owner.group) {
    await db.update(sessionExercises).set({ supersetGroup: null }).where(eq(sessionExercises.id, sessionExerciseId));
    const left = rows.filter((r) => r.supersetGroup === owner.group && r.id !== sessionExerciseId);
    if (left.length === 1) {
      await db.update(sessionExercises).set({ supersetGroup: null }).where(eq(sessionExercises.id, left[0].id));
    }
    return;
  }
  const i = rows.findIndex((r) => r.id === sessionExerciseId);
  const next = rows[i + 1];
  if (!next) throw new Error('This is the last exercise — there is nothing after it to pair with.');
  const group = groupForLink(rows[i], next, newId('ss'));
  await db.update(sessionExercises).set({ supersetGroup: group }).where(eq(sessionExercises.id, sessionExerciseId));
  await db.update(sessionExercises).set({ supersetGroup: group }).where(eq(sessionExercises.id, next.id));
}

export async function setSessionExerciseNote(sessionExerciseId: string, note: string): Promise<void> {
  await db
    .update(sessionExercises)
    .set({ notes: note.trim() || null })
    .where(eq(sessionExercises.id, sessionExerciseId));
}

/**
 * Swaps an exercise in today's session for another — bench taken, shoulder
 * complaining.
 *
 * Sets already ticked stay as they were logged. The rest are re-seeded from
 * the new exercise's own history: the old lift's weights say nothing about
 * the new one, and pre-filling them would put a number on the bar nobody
 * chose.
 */
export async function swapSessionExercise(sessionExerciseId: string, exerciseId: string): Promise<void> {
  const owner = await db
    .select({ sessionId: sessionExercises.sessionId })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, sessionExerciseId))
    .limit(1);
  if (!owner[0]) throw new Error('That exercise is no longer in the workout.');
  const [ex] = await db.select({ name: exercises.name }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  const track = trackFor(exerciseId, ex?.name ?? '', await getTrackPrefs());
  await db.update(sessionExercises).set({ exerciseId, track }).where(eq(sessionExercises.id, sessionExerciseId));

  const last = await getLastPerformance(exerciseId, owner[0].sessionId);
  const block = await db
    .select()
    .from(sets)
    .where(eq(sets.sessionExerciseId, sessionExerciseId))
    .orderBy(asc(sets.setIndex));
  let working = 0;
  for (const set of block) {
    const isWorking = !set.isWarmup && set.setType === 'normal';
    if (set.completed) {
      if (isWorking) working++;
      continue;
    }
    const seed = isWorking
      ? resolveSetSeed({ last, index: working })
      : { reps: null, weight: null, weightUnit: set.weightUnit ?? 'lb', distanceM: null };
    if (isWorking) working++;
    await db
      .update(sets)
      .set({
        ...forTrack(track, { reps: seed.reps ?? set.reps, distanceM: seed.distanceM }),
        weight: seed.weight,
        weightUnit: seed.weightUnit,
      })
      .where(eq(sets.id, set.id));
  }
}

/**
 * A set's reps or metres, whichever its exercise is logged by — the other is
 * null, so a distance set never counts as reps (or towards lb volume).
 */
function forTrack(
  track: TrackMode,
  v: { reps?: number | null; distanceM?: number | null }
): { reps: number | null; distanceM: number | null } {
  return track === 'distance'
    ? { reps: null, distanceM: v.distanceM ?? null }
    : { reps: v.reps ?? null, distanceM: null };
}

/**
 * Switches an exercise in a live workout between weight x reps and weight x
 * distance, and remembers the choice for next time. Sets already ticked keep
 * what was logged; the rest are re-seeded from last time in the new mode.
 */
export async function setSessionExerciseTrack(sessionExerciseId: string, track: TrackMode): Promise<void> {
  const [se] = await db
    .select({ exerciseId: sessionExercises.exerciseId, sessionId: sessionExercises.sessionId })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, sessionExerciseId))
    .limit(1);
  if (!se) throw new Error('That exercise is no longer in the workout.');
  await db.update(sessionExercises).set({ track }).where(eq(sessionExercises.id, sessionExerciseId));
  await rememberTrack(se.exerciseId, track);

  const last = await getLastPerformance(se.exerciseId, se.sessionId);
  const block = await db
    .select()
    .from(sets)
    .where(eq(sets.sessionExerciseId, sessionExerciseId))
    .orderBy(asc(sets.setIndex));
  let working = 0;
  for (const set of block) {
    const isWorking = !set.isWarmup && set.setType === 'normal';
    if (set.completed) {
      if (isWorking) working++;
      continue;
    }
    const seed = isWorking ? resolveSetSeed({ last, index: working }) : null;
    if (isWorking) working++;
    await db
      .update(sets)
      .set(forTrack(track, { reps: seed?.reps ?? null, distanceM: seed?.distanceM ?? null }))
      .where(eq(sets.id, set.id));
  }
}

export async function setSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
  const endedAt = status === 'in_progress' ? null : new Date();
  await db
    .update(workoutSessions)
    .set({ status, endedAt })
    .where(eq(workoutSessions.id, sessionId));
}

export async function completeSession(sessionId: string): Promise<void> {
  await setSessionStatus(sessionId, 'completed');

  // The phone's health store gets the session once it is actually finished —
  // duration and what was trained, not what it burned. See the note on
  // HealthWorkoutEntry for why no energy figure goes with it.
  //
  // Reading the summary back costs a dozen queries, so it happens after the
  // status is already saved and off the path of the Finish tap. Nothing here
  // can throw at the caller: the session is stored either way.
  void (async () => {
    try {
      const summary = await getWorkoutSummary(sessionId);
      if (!summary?.session.startedAt || !summary.session.endedAt) return;
      const names = summary.exercises.map((e) => e.name).filter(Boolean);
      mirrorWorkout({
        id: sessionId,
        startedAt: new Date(summary.session.startedAt).getTime(),
        endedAt: new Date(summary.session.endedAt).getTime(),
        title: names.length > 0 ? names.slice(0, 3).join(', ') : 'Strength training',
      });
    } catch {
      // Already recorded locally; a failed mirror is not a failed workout.
    }
  })();
}

export async function discardSession(sessionId: string): Promise<void> {
  await setSessionStatus(sessionId, 'discarded');
}

export async function getWorkoutSummary(sessionId: string): Promise<WorkoutSummary | null> {
  const workout = await loadActiveWorkout(sessionId);
  if (!workout) return null;
  const { session, exercises: exList } = workout;
  const started = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const ended = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  let totalSets = 0;
  let completedSets = 0;
  const exerciseSummaries = exList.map((ex) => {
    totalSets += ex.sets.length;
    const done = ex.sets.filter((s) => s.completed).length;
    completedSets += done;
    return { name: ex.exerciseName, setCount: done || ex.sets.length };
  });
  return {
    session,
    exerciseCount: exList.length,
    totalSets,
    completedSets,
    durationMs: Math.max(0, ended - started),
    exercises: exerciseSummaries,
  };
}

/** Completed sessions only — what the coach actually has to work from. */
export async function countCompletedSessions(): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(workoutSessions)
    .where(eq(workoutSessions.status, 'completed'));
  return rows[0]?.n ?? 0;
}

export async function countRoutines(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(routines);
  return row?.n ?? 0;
}

export async function findExerciseByExactName(name: string): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.name, name)).limit(1);
  return rows[0] ?? null;
}

export async function findExerciseByNameLike(fragment: string): Promise<Exercise | null> {
  const rows = await db
    .select()
    .from(exercises)
    .where(sql`lower(${exercises.name}) like ${`%${fragment.toLowerCase()}%`}`)
    .orderBy(asc(exercises.name))
    .limit(1);
  return rows[0] ?? null;
}



export async function getLastCompletedWorkoutSummary(): Promise<WorkoutSummary | null> {
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.status, 'completed'))
    .orderBy(desc(workoutSessions.endedAt), desc(workoutSessions.startedAt))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  return getWorkoutSummary(session.id);
}

export type TrainingDayDot = {
  /** Local YYYY-MM-DD */
  dayKey: string;
  /** Short weekday label e.g. M */
  label: string;
  hasWorkout: boolean;
};

/** Last 7 local calendar days (oldest → newest), workout yes/no. */
export async function getTrainingWeekStrip(now: Date = new Date()): Promise<TrainingDayDot[]> {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const days: { start: Date; end: Date; dayKey: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ start, end, dayKey, label: labels[d.getDay()] });
  }

  const rangeStart = days[0].start;
  const rangeEnd = days[days.length - 1].end;
  const sessions = await db
    .select({
      startedAt: workoutSessions.startedAt,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.status, 'completed'),
        gte(workoutSessions.startedAt, rangeStart),
        lt(workoutSessions.startedAt, rangeEnd)
      )
    );

  const hit = new Set<string>();
  for (const s of sessions) {
    if (!s.startedAt) continue;
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    hit.add(key);
  }

  return days.map((d) => ({
    dayKey: d.dayKey,
    label: d.label,
    hasWorkout: hit.has(d.dayKey),
  }));
}

export { and, asc, desc, eq };

export type SessionListItem = {
  id: string;
  startedAt: Date | null;
  endedAt: Date | null;
  status: SessionStatus;
  exerciseCount: number;
  completedSets: number;
  /** Up to three exercise names, for the row's subtitle. */
  names: string[];
};

/**
 * Sessions for the history screen, newest first.
 *
 * Includes discarded ones: a workout the user abandoned is still theirs to see
 * and delete. Only `completed` feeds the muscle map and the coach.
 */
export async function listSessions(limit = 100): Promise<SessionListItem[]> {
  const sessions = await db
    .select()
    .from(workoutSessions)
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit);
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const rows = await db
    .select({
      sessionId: sessionExercises.sessionId,
      exerciseName: exercises.name,
      completed: sets.completed,
      setId: sets.id,
    })
    .from(sessionExercises)
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .leftJoin(sets, eq(sets.sessionExerciseId, sessionExercises.id))
    .where(inArray(sessionExercises.sessionId, ids));

  const byId = new Map<string, { names: Set<string>; done: number }>();
  for (const r of rows) {
    const agg = byId.get(r.sessionId) ?? { names: new Set<string>(), done: 0 };
    if (r.exerciseName) agg.names.add(r.exerciseName);
    if (r.setId && r.completed) agg.done += 1;
    byId.set(r.sessionId, agg);
  }

  return sessions.map((s) => {
    const agg = byId.get(s.id);
    const names = agg ? [...agg.names] : [];
    return {
      id: s.id,
      startedAt: s.startedAt ?? null,
      endedAt: s.endedAt ?? null,
      status: s.status as SessionStatus,
      exerciseCount: names.length,
      completedSets: agg?.done ?? 0,
      names: names.slice(0, 3),
    };
  });
}

/**
 * Deletes a workout and everything under it.
 *
 * Done by hand rather than by foreign key: the schema declares no cascades, so
 * deleting only the session would leave its exercises and sets behind as rows
 * nothing points at, still counted by anything that queries sets directly.
 * Sets go first so a failure part-way never orphans them.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const links = await db
    .select({ id: sessionExercises.id })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));

  if (links.length > 0) {
    await db.delete(sets).where(
      inArray(
        sets.sessionExerciseId,
        links.map((l) => l.id)
      )
    );
  }
  await db.delete(sessionExercises).where(eq(sessionExercises.sessionId, sessionId));
  await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
  mirrorWorkoutRemoved(sessionId);
}

export type RoutineDraftExercise = {
  exerciseId: string;
  targetSets: number | null;
  targetReps: number | null;
  restSeconds: number | null;
  notes?: string | null;
  /** Weight x reps or weight x distance; null leaves it to the exercise. */
  track?: TrackMode | null;
};

/**
 * Creates a routine from scratch.
 *
 * There was no way to make one: routines could only arrive from an import or
 * the seeded starters, so "build a workout" meant starting a freestyle session
 * and picking as you went, every time, with nothing kept at the end of it.
 *
 * Position comes from the order given, not from a field on each item, so the
 * caller reorders by reordering the array and cannot produce two exercises
 * claiming the same slot.
 */
export async function createRoutine(input: {
  name: string;
  notes?: string | null;
  exercises: RoutineDraftExercise[];
}): Promise<string> {
  const routineId = newId('rt');
  await db.insert(routines).values({
    id: routineId,
    name: input.name.trim(),
    notes: input.notes?.trim() || null,
    createdAt: new Date(),
  });

  let position = 0;
  for (const ex of input.exercises) {
    await db.insert(routineExercises).values({
      id: newId('re'),
      routineId,
      exerciseId: ex.exerciseId,
      position: position++,
      targetSets: ex.targetSets,
      targetReps: ex.targetReps,
      restSeconds: ex.restSeconds,
      notes: ex.notes ?? null,
      track: ex.track ?? null,
    });
  }
  return routineId;
}

/**
 * Replaces a routine's exercise list, keeping the routine itself.
 *
 * Editing rather than delete-and-recreate, so sessions that reference the
 * routine keep pointing at something real.
 */
export async function updateRoutine(
  routineId: string,
  input: { name?: string; notes?: string | null; exercises?: RoutineDraftExercise[] }
): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (input.name != null) patch.name = input.name.trim();
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (Object.keys(patch).length > 0) {
    await db.update(routines).set(patch).where(eq(routines.id, routineId));
  }

  if (input.exercises) {
    await db.delete(routineExercises).where(eq(routineExercises.routineId, routineId));
    let position = 0;
    for (const ex of input.exercises) {
      await db.insert(routineExercises).values({
        id: newId('re'),
        routineId,
        exerciseId: ex.exerciseId,
        position: position++,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        restSeconds: ex.restSeconds,
        notes: ex.notes ?? null,
        track: ex.track ?? null,
      });
    }
  }
}

/** Deletes a routine and its exercise list. Logged sessions are untouched. */
export async function deleteRoutine(routineId: string): Promise<void> {
  await db.delete(routineExercises).where(eq(routineExercises.routineId, routineId));
  await db.delete(routines).where(eq(routines.id, routineId));
}

/** An exercise with sets logged against it but no idea what it works. */
export type UntaggedExercise = {
  id: string;
  name: string;
  /** Completed sets logged against it — the cost of leaving it untagged. */
  setCount: number;
};

/**
 * Exercises that colour nothing on the muscle map.
 *
 * openGym's backup references its built-in exercises by number and does not
 * include their names or muscles, so they import as "openGym 0577" with an
 * empty muscle list. The map then has nothing to colour and looks broken when
 * it is merely honest — on a real backup that was 101 exercises and 93% of the
 * sets.
 *
 * Ordered by set count, heaviest first, because matching a handful of these
 * fixes most of the map: the top twelve alone covered 1,558 sets.
 */
export async function listUntaggedExercises(): Promise<UntaggedExercise[]> {
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      setCount: sql<number>`count(${sets.id})`,
    })
    .from(exercises)
    .innerJoin(sessionExercises, eq(sessionExercises.exerciseId, exercises.id))
    .leftJoin(
      sets,
      and(eq(sets.sessionExerciseId, sessionExercises.id), eq(sets.completed, true))
    )
    .groupBy(exercises.id);

  const isEmpty = (json: string | null) => {
    if (!json) return true;
    try {
      const v = JSON.parse(json);
      return !Array.isArray(v) || v.length === 0;
    } catch {
      return true;
    }
  };

  return rows
    .filter((r) => isEmpty(r.primaryMuscles) && isEmpty(r.secondaryMuscles))
    .map((r) => ({ id: r.id, name: r.name, setCount: Number(r.setCount ?? 0) }))
    .sort((a, b) => b.setCount - a.setCount || a.name.localeCompare(b.name));
}

/**
 * Points everything logged against one exercise at another, then removes the
 * first.
 *
 * Used to say "openGym 0577 was actually the leg press": the sets keep their
 * weights, reps and dates and simply belong to an exercise the app knows the
 * muscles for, so the map fills in retroactively. Routines that referenced it
 * follow too, or they would point at a row that no longer exists.
 *
 * Nothing is merged into itself, and nothing is invented — this only ever
 * re-points existing rows.
 */
export async function mergeExerciseInto(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return;
  await db
    .update(sessionExercises)
    .set({ exerciseId: toId })
    .where(eq(sessionExercises.exerciseId, fromId));
  await db
    .update(routineExercises)
    .set({ exerciseId: toId })
    .where(eq(routineExercises.exerciseId, fromId));
  await db.delete(exercises).where(eq(exercises.id, fromId));
}

/**
 * The record an exercise held before a given moment.
 *
 * `before` excludes the set being judged and everything after it, or a set
 * would beat itself and every lift would be a trophy. Warm-ups are left out:
 * they are not attempts at anything.
 */
/**
 * The working sets a record is built from. Drop and rest-pause sets are out:
 * a rest-pause mini-set's reps would inflate the estimated 1RM, and neither is
 * a lift anyone would call their best.
 */
async function recordSetsBefore(exerciseId: string, before: Date | null): Promise<RecordSet[]> {
  const rows = await db
    .select({
      weight: sets.weight,
      reps: sets.reps,
      unit: sets.weightUnit,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal'),
        eq(workoutSessions.status, 'completed'),
        ...(before ? [lt(workoutSessions.startedAt, before)] : [])
      )
    );
  return rows.map(toRecordSet);
}

const toRecordSet = (r: { weight: number | null; reps: number | null; unit: string | null }): RecordSet => ({
  weight: r.weight,
  reps: r.reps,
  unit: r.unit === 'kg' ? 'kg' : 'lb',
});

export async function recordBefore(
  exerciseId: string,
  before: Date | null
): Promise<ExerciseRecord> {
  return recordFrom(await recordSetsBefore(exerciseId, before));
}

/**
 * Whether the set just ticked is a record — for the trophy during the workout.
 * Read after the tick has saved, so it never slows logging. See livePr.
 */
export async function liveRecordFor(setId: string): Promise<PrResult> {
  const [row] = await db
    .select({
      weight: sets.weight,
      reps: sets.reps,
      distanceM: sets.distanceM,
      unit: sets.weightUnit,
      isWarmup: sets.isWarmup,
      setType: sets.setType,
      exerciseId: sessionExercises.exerciseId,
      sessionId: sessionExercises.sessionId,
      startedAt: workoutSessions.startedAt,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(eq(sets.id, setId))
    .limit(1);
  if (!row || row.isWarmup || row.setType !== 'normal') return { kinds: [], note: null };

  // A carry or sled: heaviest load moved, or furthest at that load.
  if (row.distanceM != null) {
    const before = await db
      .select({ weight: sets.weight, distanceM: sets.distanceM, completed: sets.completed, isWarmup: sets.isWarmup })
      .from(sets)
      .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(sessionExercises.exerciseId, row.exerciseId),
          eq(sets.completed, true),
          eq(sets.setType, 'normal'),
          ne(sets.id, setId),
          ne(workoutSessions.status, 'discarded')
        )
      );
    const note = distanceRecord(row, before, row.unit ?? 'lb');
    return note ? { kinds: ['weight'], note } : { kinds: [], note: null };
  }

  const today = await db
    .select({ weight: sets.weight, reps: sets.reps, unit: sets.weightUnit })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .where(
      and(
        eq(sessionExercises.sessionId, row.sessionId),
        eq(sessionExercises.exerciseId, row.exerciseId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal'),
        ne(sets.id, setId)
      )
    );

  return livePr(
    toRecordSet(row),
    await recordSetsBefore(row.exerciseId, row.startedAt ?? null),
    today.map(toRecordSet)
  );
}

export type SessionPr = {
  exerciseId: string;
  exerciseName: string;
  set: { weight: number | null; reps: number | null; unit: 'kg' | 'lb' };
  kinds: PrKind[];
  note: string;
};

/**
 * Which sets in a finished session were records.
 *
 * Judged against everything logged before that session started, so a session's
 * own later sets cannot make its earlier ones look worse and re-running the
 * same session gives the same answer every time.
 *
 * One record per exercise: three sets of a new best is one achievement, and
 * three trophies for it would make the word meaningless.
 */
export async function personalRecordsIn(sessionId: string): Promise<SessionPr[]> {
  const [session] = await db
    .select({ startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  if (!session) return [];

  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      exerciseName: exercises.name,
      weight: sets.weight,
      reps: sets.reps,
      unit: sets.weightUnit,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(
        eq(sessionExercises.sessionId, sessionId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal')
      )
    );

  const byExercise = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push(r);
    byExercise.set(r.exerciseId, list);
  }

  const out: SessionPr[] = [];
  for (const [exerciseId, list] of byExercise) {
    const previous = await recordBefore(exerciseId, session.startedAt ?? null);
    let best: SessionPr | null = null;
    for (const r of list) {
      const set = {
        weight: r.weight,
        reps: r.reps,
        unit: r.unit === 'kg' ? ('kg' as const) : ('lb' as const),
      };
      const pr = prFor(set, previous);
      if (pr.kinds.length === 0 || !pr.note) continue;
      // Keep the heaviest of the session's records for this exercise.
      if (best == null || (set.weight ?? 0) > (best.set.weight ?? 0)) {
        best = {
          exerciseId,
          exerciseName: r.exerciseName ?? 'Exercise',
          set,
          kinds: pr.kinds,
          note: pr.note,
        };
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

export type ExerciseBest = {
  exerciseId: string;
  name: string;
  record: ExerciseRecord;
};

/** Every exercise's best, heaviest first, for the Personal records screen. */
export async function listPersonalRecords(): Promise<ExerciseBest[]> {
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      name: exercises.name,
      weight: sets.weight,
      reps: sets.reps,
      unit: sets.weightUnit,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(workoutSessions.status, 'completed')
      )
    );

  const grouped = new Map<string, { name: string; sets: RecordSet[] }>();
  for (const r of rows) {
    const g = grouped.get(r.exerciseId) ?? { name: r.name ?? 'Exercise', sets: [] };
    g.sets.push({
      weight: r.weight,
      reps: r.reps,
      unit: r.unit === 'kg' ? 'kg' : 'lb',
    });
    grouped.set(r.exerciseId, g);
  }

  return [...grouped.entries()]
    .map(([exerciseId, g]) => ({ exerciseId, name: g.name, record: recordFrom(g.sets) }))
    .filter((e) => e.record.heaviest != null)
    .sort(
      (a, b) =>
        (b.record.bestEstimate?.oneRepMax ?? 0) - (a.record.bestEstimate?.oneRepMax ?? 0) ||
        (b.record.heaviest?.weight ?? 0) - (a.record.heaviest?.weight ?? 0) ||
        a.name.localeCompare(b.name)
    );
}

export type CustomExerciseInput = {
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** Picture file URIs, first shown. Left out on an edit, the pictures stay as they are. */
  images?: string[];
};

/**
 * Saves a user-made exercise into the library.
 *
 * Muscles are stored as the app's own group names, already mapped — the muscle
 * map's coverage is closed and a free-text muscle would simply never light up.
 */
/**
 * Thrown when an edit is refused. Carries a sentence the UI can show as-is.
 */
export class ExerciseNotEditableError extends Error {}

/**
 * Corrects an exercise you own.
 *
 * Only the ones you own: a bundled exercise can be edited in the UI all day
 * and the next catalogue re-import silently reverts it, because the import
 * deletes and rewrites every bundled row. Offering an edit that quietly
 * un-does itself is worse than not offering one, so this refuses with a
 * sentence rather than pretending.
 *
 * 'custom' (made here) and 'imported' (created by importing a backup) are the
 * two the re-import preserves — the same list isUserExercise guards.
 */
export async function updateCustomExercise(
  id: string,
  input: CustomExerciseInput
): Promise<void> {
  const [row] = await db
    .select({ category: exercises.category })
    .from(exercises)
    .where(eq(exercises.id, id))
    .limit(1);

  if (!row) throw new ExerciseNotEditableError('That exercise no longer exists.');
  if (!isUserExercise(row.category)) {
    throw new ExerciseNotEditableError(
      'This one ships with the app, so an edit would be undone the next time the exercise database refreshes. Make your own copy instead.'
    );
  }

  await db
    .update(exercises)
    .set({
      name: input.name.trim(),
      equipment: input.equipment?.trim() || null,
      primaryMuscles: JSON.stringify(input.primaryMuscles),
      secondaryMuscles: JSON.stringify(input.secondaryMuscles),
      instructions: JSON.stringify(input.instructions),
      ...(input.images ? { images: JSON.stringify(input.images) } : {}),
    })
    .where(eq(exercises.id, id));
}

/** Sets the pictures of an exercise you own, and nothing else. */
export async function setCustomExerciseImages(id: string, images: string[]): Promise<void> {
  await db.update(exercises).set({ images: JSON.stringify(images) }).where(eq(exercises.id, id));
}

export async function createCustomExercise(input: CustomExerciseInput): Promise<string> {
  const id = newId('ex');
  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    equipment: input.equipment?.trim() || null,
    category: 'custom',
    primaryMuscles: JSON.stringify(input.primaryMuscles),
    secondaryMuscles: JSON.stringify(input.secondaryMuscles),
    instructions: JSON.stringify(input.instructions),
    images: JSON.stringify(input.images ?? []),
  });
  return id;
}
