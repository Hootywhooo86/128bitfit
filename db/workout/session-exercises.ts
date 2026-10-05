import {
  and,
  asc,
  count,
  desc,
  eq,
  ne,
} from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../id';
import { getDefaultRestSeconds } from '../rest-settings';
import { resolveSetSeed, seedForNewSet, type LastPerformance } from '@/lib/set-prefill';
import { trackFor, type TrackMode } from '@/lib/track-mode';
import { getTrackPrefs, rememberTrack } from '../track-prefs';
import {
  exercises,
  sessionExercises,
  sets,
  workoutSessions,
  type WorkoutSet,
} from '../schema';
import { moveInOrder } from '@/lib/reorder';
import { groupForLink } from '@/lib/superset';
import { widgetsChanged } from '@/lib/widget-refresh';

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

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  opts?: { restSeconds?: number; targetSets?: number; targetReps?: number; track?: TrackMode }
): Promise<string> {
  widgetsChanged();
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
  // Home-screen widgets show this; they redraw shortly after (lib/widget-refresh).
  widgetsChanged();
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
  widgetsChanged();
  await db.update(sets).set(patch).where(eq(sets.id, setId));
}

export async function completeSet(
  setId: string,
  values?: { reps?: number | null; weight?: number | null; distanceM?: number | null }
): Promise<WorkoutSet | null> {
  widgetsChanged();
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
  widgetsChanged();
  await db.delete(sets).where(eq(sets.id, setId));
}

/** Takes an exercise, and its sets, out of today's session. */
export async function removeSessionExercise(sessionExerciseId: string): Promise<void> {
  widgetsChanged();
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
export function forTrack(
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
