import {
  and,
  asc,
  eq,
  sql,
} from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../id';
import { isUserExercise } from '@/lib/exercise-sources';
import {
  exercises,
  routineExercises,
  sessionExercises,
  sets,
  type Exercise,
} from '../schema';

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
