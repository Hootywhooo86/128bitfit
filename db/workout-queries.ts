import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
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
    });
  }

  return { session, exercises: exerciseList };
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
    const targetSets = re.targetSets ?? 3;
    for (let s = 0; s < targetSets; s++) {
      await db.insert(sets).values({
        id: newId('set'),
        sessionExerciseId: seId,
        setIndex: s,
        reps: re.targetReps ?? 10,
        weight: null,
        weightUnit: 'lb',
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

  const targetSets = opts?.targetSets ?? 1;
  for (let s = 0; s < targetSets; s++) {
    await db.insert(sets).values({
      id: newId('set'),
      sessionExerciseId: seId,
      setIndex: s,
      reps: opts?.targetReps ?? null,
      weight: null,
      weightUnit: 'lb',
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
  const last = existing[0];
  const setIndex = last ? last.setIndex + 1 : 0;
  const row: WorkoutSet = {
    id: newId('set'),
    sessionExerciseId,
    setIndex,
    reps: defaults?.reps ?? last?.reps ?? null,
    weight: defaults?.weight ?? last?.weight ?? null,
    weightUnit: defaults?.weightUnit ?? last?.weightUnit ?? 'lb',
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

export { and, asc, desc, eq };
