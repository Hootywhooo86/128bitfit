import { count } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { findExerciseByExactName, findExerciseByNameLike } from './workout-queries';
import { getSetting, setSetting } from './settings-queries';
import { routineExercises, routines } from './schema';

type SeedExercise = {
  exact?: string;
  like?: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
};

type SeedRoutine = {
  id: string;
  name: string;
  notes: string;
  exercises: SeedExercise[];
};

const STARTER: SeedRoutine[] = [
  {
    id: 'routine_push',
    name: 'Push',
    notes: 'Chest, shoulders, triceps',
    exercises: [
      { exact: 'Barbell Bench Press - Medium Grip', targetSets: 4, targetReps: 8, restSeconds: 90 },
      { exact: 'Barbell Incline Bench Press - Medium Grip', targetSets: 3, targetReps: 10, restSeconds: 90 },
      { exact: 'Dumbbell Flyes', targetSets: 3, targetReps: 12, restSeconds: 60 },
      { exact: 'Barbell Shoulder Press', targetSets: 3, targetReps: 8, restSeconds: 90 },
      { like: 'triceps pushdown', targetSets: 3, targetReps: 12, restSeconds: 60 },
    ],
  },
  {
    id: 'routine_pull',
    name: 'Pull',
    notes: 'Back and biceps',
    exercises: [
      { exact: 'Pullups', targetSets: 3, targetReps: 8, restSeconds: 90 },
      { exact: 'Barbell Deadlift', targetSets: 3, targetReps: 5, restSeconds: 120 },
      { like: 'bent over barbell row', targetSets: 4, targetReps: 8, restSeconds: 90 },
      { exact: 'Full Range-Of-Motion Lat Pulldown', targetSets: 3, targetReps: 10, restSeconds: 75 },
      { exact: 'Alternate Hammer Curl', targetSets: 3, targetReps: 12, restSeconds: 60 },
    ],
  },
  {
    id: 'routine_legs',
    name: 'Legs',
    notes: 'Quads, hammies, calves',
    exercises: [
      { exact: 'Barbell Full Squat', targetSets: 4, targetReps: 8, restSeconds: 120 },
      { exact: 'Romanian Deadlift', targetSets: 3, targetReps: 10, restSeconds: 90 },
      { exact: 'Leg Press', targetSets: 3, targetReps: 12, restSeconds: 90 },
      { exact: 'Barbell Lunge', targetSets: 3, targetReps: 10, restSeconds: 75 },
      { like: 'standing calf raise', targetSets: 3, targetReps: 15, restSeconds: 45 },
    ],
  },
  {
    id: 'routine_full_body',
    name: 'Full Body',
    notes: 'Simple full-body starter',
    exercises: [
      { exact: 'Barbell Full Squat', targetSets: 3, targetReps: 8, restSeconds: 90 },
      { exact: 'Barbell Bench Press - Medium Grip', targetSets: 3, targetReps: 8, restSeconds: 90 },
      { exact: 'Barbell Deadlift', targetSets: 3, targetReps: 5, restSeconds: 120 },
      { exact: 'Pullups', targetSets: 3, targetReps: 8, restSeconds: 90 },
      { exact: 'Plank', targetSets: 3, targetReps: 45, restSeconds: 60 },
    ],
  },
];

async function resolveExerciseId(spec: SeedExercise): Promise<string | null> {
  if (spec.exact) {
    const hit = await findExerciseByExactName(spec.exact);
    if (hit) return hit.id;
  }
  if (spec.like) {
    const hit = await findExerciseByNameLike(spec.like);
    if (hit) return hit.id;
  }
  if (spec.exact) {
    const hit = await findExerciseByNameLike(spec.exact.split(' ').slice(0, 3).join(' '));
    if (hit) return hit.id;
  }
  return null;
}

/** Seed Push / Pull / Legs / Full Body once when routines table is empty. */
/**
 * Set once, the first time the starters are laid down.
 *
 * "Seed when the table is empty" resurrected them: delete every routine and
 * they came straight back on the next visit to Train, which looks exactly like
 * delete not working. Seeding is a one-time event in the app's life, not a
 * condition to be maintained — an empty routine list is a legitimate state and
 * the app has no business arguing with it.
 */
const SEEDED_KEY = 'starter_routines_seeded';

export async function ensureStarterRoutines(): Promise<{ seeded: boolean; count: number }> {
  const [row] = await db.select({ n: count() }).from(routines);
  const existing = row?.n ?? 0;

  if (await getSetting(SEEDED_KEY)) {
    return { seeded: false, count: existing };
  }
  if (existing > 0) {
    // Routines already here from an import or an older build: nothing to seed,
    // and the flag is set so a later clear-out is not undone.
    await setSetting(SEEDED_KEY, '1');
    return { seeded: false, count: existing };
  }

  for (const routine of STARTER) {
    await db.insert(routines).values({
      id: routine.id,
      name: routine.name,
      notes: routine.notes,
      createdAt: new Date(),
    });

    let position = 0;
    for (const spec of routine.exercises) {
      const exerciseId = await resolveExerciseId(spec);
      if (!exerciseId) continue;
      await db.insert(routineExercises).values({
        id: newId('rex'),
        routineId: routine.id,
        exerciseId,
        position,
        targetSets: spec.targetSets,
        targetReps: spec.targetReps,
        restSeconds: spec.restSeconds,
        notes: null,
      });
      position += 1;
    }
  }

  await setSetting(SEEDED_KEY, '1');
  const [after] = await db.select({ n: count() }).from(routines);
  return { seeded: true, count: after?.n ?? 0 };
}
