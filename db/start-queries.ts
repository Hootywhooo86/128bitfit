/**
 * What the start flow needs to know before a session exists.
 *
 * Starting a workout used to create the session the instant you tapped a
 * routine. There was no way to see what was in it first, and backing out meant
 * an abandoned session in the database. These read-only queries let the pick
 * and preview screens show the whole thing before anything is written.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './client';
import {
  exercises,
  routineExercises,
  routines,
  sessionExercises,
  sets,
  workoutSessions,
  type Routine,
} from './schema';

export type StartableRoutine = Routine & {
  exerciseCount: number;
  /** Target sets across the whole routine; 0 when nothing sets a target. */
  setCount: number;
  /** When this routine was last completed, or null if it never has been. */
  lastRunAt: Date | null;
  /** First few exercise names, so "Day 1" still says what it is. */
  names: string[];
};

/** Routines, with enough to choose between them without opening each one. */
export async function listStartableRoutines(): Promise<StartableRoutine[]> {
  const list = await db.select().from(routines).orderBy(desc(routines.id));
  if (list.length === 0) return [];
  const ids = list.map((r) => r.id);

  const [rows, runs] = await Promise.all([
    db
      .select({
        routineId: routineExercises.routineId,
        position: routineExercises.position,
        targetSets: routineExercises.targetSets,
        name: exercises.name,
      })
      .from(routineExercises)
      .leftJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .where(inArray(routineExercises.routineId, ids))
      .orderBy(routineExercises.position),
    db
      .select({
        routineId: workoutSessions.routineId,
        startedAt: sql<number>`max(${workoutSessions.startedAt})`,
      })
      .from(workoutSessions)
      .where(
        and(eq(workoutSessions.status, 'completed'), inArray(workoutSessions.routineId, ids))
      )
      .groupBy(workoutSessions.routineId),
  ]);

  const names = new Map<string, string[]>();
  const counts = new Map<string, number>();
  const setTotals = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.routineId, (counts.get(r.routineId) ?? 0) + 1);
    setTotals.set(r.routineId, (setTotals.get(r.routineId) ?? 0) + (r.targetSets ?? 0));
    if (!r.name) continue;
    const n = names.get(r.routineId) ?? [];
    if (n.length < 3) n.push(r.name);
    names.set(r.routineId, n);
  }

  const lastRun = new Map<string, Date>();
  for (const r of runs) {
    if (!r.routineId || r.startedAt == null) continue;
    // started_at is stored in SECONDS (drizzle 'timestamp' mode), and max()
    // comes back as a raw number rather than a Date.
    lastRun.set(r.routineId, new Date(Number(r.startedAt) * 1000));
  }

  return list.map((r) => ({
    ...r,
    exerciseCount: counts.get(r.id) ?? 0,
    setCount: setTotals.get(r.id) ?? 0,
    lastRunAt: lastRun.get(r.id) ?? null,
    names: names.get(r.id) ?? [],
  }));
}

export type PreviewExercise = {
  exerciseId: string;
  name: string;
  /** Primary muscles as stored, for the tag line. */
  primaryMuscles: string[];
  equipment: string | null;
  targetSets: number | null;
  targetReps: number | null;
  /** Heaviest completed set of this exercise, ever. Null when never lifted. */
  bestWeight: number | null;
};

export type RoutinePreview = {
  routine: Routine;
  exercises: PreviewExercise[];
  setCount: number;
};

/** Everything the confirm screen shows, without creating a session. */
export async function getRoutinePreview(routineId: string): Promise<RoutinePreview | null> {
  const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
  if (!routine) return null;

  const rows = await db
    .select({
      exerciseId: routineExercises.exerciseId,
      targetSets: routineExercises.targetSets,
      targetReps: routineExercises.targetReps,
      name: exercises.name,
      primaryMuscles: exercises.primaryMuscles,
      equipment: exercises.equipment,
    })
    .from(routineExercises)
    .leftJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(routineExercises.position);

  const ids = rows.map((r) => r.exerciseId);
  const bests = new Map<string, number>();
  if (ids.length > 0) {
    const best = await db
      .select({
        exerciseId: sessionExercises.exerciseId,
        weight: sql<number>`max(${sets.weight})`,
      })
      .from(sets)
      .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(sets.completed, true),
          eq(workoutSessions.status, 'completed'),
          inArray(sessionExercises.exerciseId, ids)
        )
      )
      .groupBy(sessionExercises.exerciseId);
    for (const b of best) {
      if (b.weight != null) bests.set(b.exerciseId, Number(b.weight));
    }
  }

  return {
    routine,
    setCount: rows.reduce((n, r) => n + (r.targetSets ?? 0), 0),
    exercises: rows.map((r) => ({
      exerciseId: r.exerciseId,
      name: r.name ?? 'Unknown exercise',
      primaryMuscles: parseList(r.primaryMuscles),
      equipment: r.equipment,
      targetSets: r.targetSets,
      targetReps: r.targetReps,
      bestWeight: bests.get(r.exerciseId) ?? null,
    })),
  };
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
