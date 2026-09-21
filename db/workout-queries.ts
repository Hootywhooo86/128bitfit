import { and, asc, count, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { resolveSetSeed, type LastPerformance } from '@/lib/set-prefill';
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

export type SessionExerciseWithMeta = SessionExercise & {
  exerciseName: string;
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
      exerciseName: exercises.name,
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
    exerciseList.push({
      id: se.id,
      sessionId: se.sessionId,
      exerciseId: se.exerciseId,
      position: se.position,
      restSeconds: se.restSeconds,
      notes: se.notes,
      exerciseName: se.exerciseName,
      sets: setRows,
      lastPerformance: await getLastPerformance(se.exerciseId, sessionId),
    });
  }

  return { session, exercises: exerciseList };
}

/**
 * The most recent completed performance of an exercise, for pre-filling.
 *
 * Only completed sets of completed sessions count: an abandoned workout is full
 * of pre-filled values nobody lifted, and seeding from those would compound a
 * guess into a record.
 *
 * `excludeSessionId` keeps the session being built now out of its own history.
 */
export async function getLastPerformance(
  exerciseId: string,
  excludeSessionId?: string
): Promise<LastPerformance | null> {
  const where = [
    eq(sessionExercises.exerciseId, exerciseId),
    eq(sets.completed, true),
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
    })
    .from(sets)
    .where(
      and(eq(sets.sessionExerciseId, found.sessionExerciseId), eq(sets.completed, true))
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
  for (const [i, re] of rex.entries()) {
    const seId = newId('se');
    const rest = re.restSeconds ?? 60;
    await db.insert(sessionExercises).values({
      id: seId,
      sessionId: id,
      exerciseId: re.exerciseId,
      position: i,
      restSeconds: rest,
      notes: re.notes,
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
        reps: seed.reps ?? 10,
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
  opts?: { restSeconds?: number; targetSets?: number; targetReps?: number }
): Promise<string> {
  const existing = await db
    .select({ n: count() })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));
  const position = existing[0]?.n ?? 0;
  const seId = newId('se');
  const rest = opts?.restSeconds ?? 60;
  await db.insert(sessionExercises).values({
    id: seId,
    sessionId,
    exerciseId,
    position,
    restSeconds: rest,
    notes: null,
  });

  const last = await getLastPerformance(exerciseId, sessionId);
  const targetSets = opts?.targetSets ?? 1;
  for (let s = 0; s < targetSets; s++) {
    const seed = resolveSetSeed({ last, index: s, targetReps: opts?.targetReps ?? null });
    await db.insert(sets).values({
      id: newId('set'),
      sessionExerciseId: seId,
      setIndex: s,
      reps: seed.reps,
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
  defaults?: { reps?: number | null; weight?: number | null; weightUnit?: string }
): Promise<WorkoutSet> {
  const existing = await db
    .select()
    .from(sets)
    .where(eq(sets.sessionExerciseId, sessionExerciseId))
    .orderBy(desc(sets.setIndex))
    .limit(1);
  const previous = existing[0];
  const setIndex = previous ? previous.setIndex + 1 : 0;

  // Carrying from the set just logged wins; otherwise reach back to the last
  // session, which is what makes the first set of an exercise pre-filled too.
  const owner = await db
    .select({ exerciseId: sessionExercises.exerciseId, sessionId: sessionExercises.sessionId })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, sessionExerciseId))
    .limit(1);
  const lastPerformance = owner[0]
    ? await getLastPerformance(owner[0].exerciseId, owner[0].sessionId)
    : null;

  const seed = resolveSetSeed({
    last: lastPerformance,
    index: setIndex,
    carryFrom: previous
      ? { reps: previous.reps, weight: previous.weight, weightUnit: previous.weightUnit }
      : null,
  });

  const row: WorkoutSet = {
    id: newId('set'),
    sessionExerciseId,
    setIndex,
    reps: defaults?.reps ?? seed.reps,
    weight: defaults?.weight ?? seed.weight,
    weightUnit: defaults?.weightUnit ?? seed.weightUnit,
    completed: false,
    isWarmup: false,
    rpe: null,
  };
  await db.insert(sets).values(row);
  return row;
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit' | 'completed' | 'isWarmup' | 'rpe'>>
): Promise<void> {
  await db.update(sets).set(patch).where(eq(sets.id, setId));
}

export async function completeSet(
  setId: string,
  values?: { reps?: number | null; weight?: number | null }
): Promise<WorkoutSet | null> {
  const rows = await db.select().from(sets).where(eq(sets.id, setId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const patch = {
    completed: true as const,
    ...(values?.reps !== undefined ? { reps: values.reps } : {}),
    ...(values?.weight !== undefined ? { weight: values.weight } : {}),
  };
  await db.update(sets).set(patch).where(eq(sets.id, setId));
  return { ...row, ...patch };
}

export async function deleteSet(setId: string): Promise<void> {
  await db.delete(sets).where(eq(sets.id, setId));
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
