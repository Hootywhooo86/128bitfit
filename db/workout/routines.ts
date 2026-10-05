import {
  asc,
  count,
  eq,
  inArray,
} from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../id';
import { type TrackMode } from '@/lib/track-mode';
import {
  exercises,
  routineExercises,
  routines,
  type Routine,
  type RoutineExercise,
} from '../schema';

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

export async function countRoutines(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(routines);
  return row?.n ?? 0;
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
