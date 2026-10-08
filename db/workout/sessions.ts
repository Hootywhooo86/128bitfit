import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lt,
  ne,
  sql,
  inArray,
} from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../id';
import { getDefaultRestSeconds } from '../rest-settings';
import { resolveSetSeed, type LastPerformance } from '@/lib/set-prefill';
import { repeatPlan } from '@/lib/repeat-workout';
import { trackFor } from '@/lib/track-mode';
import { getTrackPrefs } from '../track-prefs';
import { familyStrength, familyWorkoutRemoved } from '@/lib/family';
import { mirrorWorkout, mirrorWorkoutRemoved } from '@/lib/health/mirror';
import {
  exercises,
  sessionExercises,
  sets,
  workoutSessions,
  type SessionExercise,
  type SessionStatus,
  type WorkoutSession,
  type WorkoutSet,
} from '../schema';
import { widgetsChanged } from '@/lib/widget-refresh';
import { getRoutineExercises } from './routines';
import { getLastPerformance, forTrack } from './session-exercises';

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

  if (seRows.length === 0) return { session, exercises: [] };

  // A fixed handful of queries for the whole workout, not several per
  // exercise: this screen is opened mid-set, and a twelve-exercise session
  // used to cost dozens of round trips before the first row drew.
  const seIds = seRows.map((r) => r.id);
  const exerciseIds = [...new Set(seRows.map((r) => r.exerciseId))];
  const [setRows, bests, lasts] = await Promise.all([
    db.select().from(sets).where(inArray(sets.sessionExerciseId, seIds)).orderBy(asc(sets.setIndex)),
    bestWorkingWeights(exerciseIds, sessionId),
    lastPerformances(exerciseIds, sessionId),
  ]);

  const setsBySe = new Map<string, WorkoutSet[]>();
  for (const row of setRows) {
    const list = setsBySe.get(row.sessionExerciseId) ?? [];
    list.push(row);
    setsBySe.set(row.sessionExerciseId, list);
  }

  const exerciseList: SessionExerciseWithMeta[] = seRows.map((se) => {
    const images = (() => {
      try {
        const v = JSON.parse(se.images ?? '[]');
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })();
    return {
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
      best: bests.get(se.exerciseId) ?? null,
      sets: setsBySe.get(se.id) ?? [],
      lastPerformance: lasts.get(se.exerciseId) ?? null,
    };
  });

  return { session, exercises: exerciseList };
}

/**
 * Heaviest completed working set of each exercise in a finished session other
 * than this one, with its unit. An abandoned session is full of pre-filled
 * numbers nobody lifted, and a drop set is not a best.
 */
async function bestWorkingWeights(
  exerciseIds: string[],
  excludeSessionId: string
): Promise<Map<string, { weight: number; unit: string }>> {
  const ranked = db
    .select({
      exerciseId: sessionExercises.exerciseId,
      weight: sets.weight,
      unit: sets.weightUnit,
      rn: sql<number>`row_number() over (partition by ${sessionExercises.exerciseId} order by ${sets.weight} desc)`.as(
        'rn'
      ),
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        inArray(sessionExercises.exerciseId, exerciseIds),
        ne(workoutSessions.id, excludeSessionId),
        eq(workoutSessions.status, 'completed'),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal'),
        sql`${sets.weight} > 0`
      )
    )
    .as('ranked');
  const rows = await db
    .select({ exerciseId: ranked.exerciseId, weight: ranked.weight, unit: ranked.unit })
    .from(ranked)
    .where(eq(ranked.rn, 1));
  const out = new Map<string, { weight: number; unit: string }>();
  for (const r of rows) if (r.weight != null) out.set(r.exerciseId, { weight: r.weight, unit: r.unit ?? 'lb' });
  return out;
}

/**
 * getLastPerformance for many exercises at once: the most recent completed
 * block of each, then that block's working sets, in two queries.
 */
async function lastPerformances(
  exerciseIds: string[],
  excludeSessionId: string
): Promise<Map<string, LastPerformance>> {
  const ranked = db
    .select({
      exerciseId: sessionExercises.exerciseId,
      sessionExerciseId: sessionExercises.id,
      startedAt: workoutSessions.startedAt,
      rn: sql<number>`row_number() over (partition by ${sessionExercises.exerciseId} order by ${workoutSessions.startedAt} desc, ${sessionExercises.position} desc)`.as(
        'rn'
      ),
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        inArray(sessionExercises.exerciseId, exerciseIds),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal'),
        eq(workoutSessions.status, 'completed'),
        ne(workoutSessions.id, excludeSessionId)
      )
    )
    .as('ranked');
  const blocks = await db
    .select({ exerciseId: ranked.exerciseId, sessionExerciseId: ranked.sessionExerciseId, startedAt: ranked.startedAt })
    .from(ranked)
    .where(eq(ranked.rn, 1));
  if (blocks.length === 0) return new Map();

  const setRows = await db
    .select({
      sessionExerciseId: sets.sessionExerciseId,
      reps: sets.reps,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      distanceM: sets.distanceM,
    })
    .from(sets)
    .where(
      and(
        inArray(
          sets.sessionExerciseId,
          blocks.map((b) => b.sessionExerciseId)
        ),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal')
      )
    )
    .orderBy(asc(sets.setIndex));

  const bySe = new Map<string, LastPerformance['sets']>();
  for (const { sessionExerciseId, ...set } of setRows) {
    const list = bySe.get(sessionExerciseId) ?? [];
    list.push(set);
    bySe.set(sessionExerciseId, list);
  }
  const out = new Map<string, LastPerformance>();
  for (const b of blocks) {
    const list = bySe.get(b.sessionExerciseId);
    if (list && list.length > 0) {
      // Stored as unix seconds (mode: timestamp); decoded to a Date when the driver passes it through.
      const performedAt = b.startedAt instanceof Date ? b.startedAt : new Date(Number(b.startedAt) * 1000);
      out.set(b.exerciseId, { performedAt, sets: list });
    }
  }
  return out;
}

export async function startFreestyleWorkout(): Promise<string> {
  widgetsChanged();
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
  widgetsChanged();
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
  widgetsChanged();
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

export async function setSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
  widgetsChanged();
  const endedAt = status === 'in_progress' ? null : new Date();
  await db
    .update(workoutSessions)
    .set({ status, endedAt })
    .where(eq(workoutSessions.id, sessionId));
}

export async function completeSession(sessionId: string): Promise<void> {
  widgetsChanged();
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
      const startedAt = new Date(summary.session.startedAt).getTime();
      const endedAt = new Date(summary.session.endedAt).getTime();
      const title = names.length > 0 ? names.slice(0, 3).join(', ') : 'Strength training';
      mirrorWorkout({ id: sessionId, startedAt, endedAt, title });
      familyStrength({
        id: sessionId,
        startedAt,
        endedAt,
        title,
        exercises: summary.exerciseCount,
        sets: summary.completedSets,
      });
    } catch {
      // Already recorded locally; a failed mirror is not a failed workout.
    }
  })();
}

export async function discardSession(sessionId: string): Promise<void> {
  widgetsChanged();
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
  widgetsChanged();
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
  familyWorkoutRemoved(sessionId);
}
