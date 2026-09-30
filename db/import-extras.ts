/**
 * Writing the non-set parts of a backup into the database.
 *
 * A backup is not just a history. It also holds the routines the user built,
 * the exercises they defined themselves, and their weigh-ins — and until now
 * all three went on the floor while the import reported success. Importing
 * 4,263 sets and silently dropping thirteen routines is not an import.
 *
 * Kept apart from db/import-sets.ts because the two are different claims. A set
 * is training that happened and belongs on the muscle map. A routine is a plan
 * that has not happened yet and must never reach it.
 *
 * Re-running is safe throughout. Nothing here overwrites what is already on the
 * phone: a routine whose name is taken is left alone, an exercise keeps the
 * muscles it has, and a weigh-in already recorded is not duplicated.
 */
import { eq, like } from 'drizzle-orm';
import type { ImportExtras, ImportedExercise } from '@/lib/import/parse';
import { fieldsToFill } from '@/lib/import/merge';
import { mirrorWeights } from '@/lib/health/mirror';
import { db } from './client';
import { newId } from './id';
import { reapplyCalorieFloor } from './settings-queries';
import { exercises, routineExercises, routines, weightEntries } from './schema';

export type ExtrasOutcome = {
  routinesAdded: number;
  /** Routines whose name is already taken, left untouched. */
  routinesSkipped: number;
  exercisesCreated: number;
  /** Exercises that already existed and gained the muscles they were missing. */
  exercisesFilledIn: number;
  weightsAdded: number;
  /** Weigh-ins already recorded at the same moment. */
  weightsSkipped: number;
};

/** Local midday, so a day never shifts across a timezone or a DST boundary. */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

async function findExercise(name: string): Promise<{ id: string; primaryMuscles: string; secondaryMuscles: string; instructions: string } | null> {
  const trimmed = name.trim();
  const rows = await db
    .select({
      id: exercises.id,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      instructions: exercises.instructions,
    })
    .from(exercises)
    // `like` with no wildcards is case-insensitive equality in SQLite, which is
    // what we want: "Bench Press" and "bench press" are one lift.
    .where(like(exercises.name, trimmed))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Creates the exercise, or fills in what the existing row is missing.
 *
 * Never overwrites. If the library already knows an exercise's muscles, the
 * backup's opinion does not replace them — the bundled data is curated and a
 * user's hand-tagged custom entry is not a reason to rewrite it. An empty field
 * is a different matter: filling that in is strictly more than was there.
 */
async function upsertExercise(
  ex: ImportedExercise,
  counts: { created: number; filled: number }
): Promise<string> {
  const existing = await findExercise(ex.name);

  if (!existing) {
    const id = newId('ex');
    await db.insert(exercises).values({
      id,
      name: ex.name.trim(),
      equipment: ex.equipment,
      primaryMuscles: JSON.stringify(ex.primaryMuscles),
      secondaryMuscles: JSON.stringify(ex.secondaryMuscles),
      instructions: JSON.stringify(ex.instructions),
      images: '[]',
      category: ex.category ?? 'imported',
    });
    counts.created += 1;
    return id;
  }

  const patch = fieldsToFill(existing, ex);
  if (Object.keys(patch).length > 0) {
    await db.update(exercises).set(patch).where(eq(exercises.id, existing.id));
    counts.filled += 1;
  }
  return existing.id;
}

/**
 * An exercise referenced by a routine but defined nowhere.
 *
 * Created with no muscles on purpose. The backup names it by an id whose label
 * it does not carry, so anything we put here would be a guess, and a guess
 * colours the muscle map with training that may never have happened.
 */
async function placeholderExercise(
  name: string,
  counts: { created: number; filled: number }
): Promise<string> {
  const existing = await findExercise(name);
  if (existing) return existing.id;
  const id = newId('ex');
  await db.insert(exercises).values({
    id,
    name: name.trim(),
    primaryMuscles: '[]',
    secondaryMuscles: '[]',
    instructions: '[]',
    images: '[]',
    category: 'imported',
  });
  counts.created += 1;
  return id;
}

export async function importExtras(extras: ImportExtras): Promise<ExtrasOutcome> {
  const counts = { created: 0, filled: 0 };

  // Exercises first, so a routine written below links to a row that already
  // knows its muscles rather than a bare placeholder.
  for (const ex of extras.exercises) {
    await upsertExercise(ex, counts);
  }

  let routinesAdded = 0;
  let routinesSkipped = 0;
  const taken = new Set(
    (await db.select({ name: routines.name }).from(routines)).map((r) => r.name.toLowerCase())
  );

  for (const routine of extras.routines) {
    const key = routine.name.trim().toLowerCase();
    // A routine the user already has — imported before, or built here — is
    // theirs. Overwriting it with the backup's version would undo edits.
    if (taken.has(key)) {
      routinesSkipped += 1;
      continue;
    }
    taken.add(key);

    const routineId = newId('rt');
    await db.insert(routines).values({
      id: routineId,
      name: routine.name.trim(),
      notes: routine.notes,
      createdAt: new Date(),
    });

    let position = 0;
    for (const ex of routine.exercises) {
      const exerciseId = await placeholderExercise(ex.exerciseName, counts);
      await db.insert(routineExercises).values({
        id: newId('re'),
        routineId,
        exerciseId,
        position: position++,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        restSeconds: ex.restSeconds,
        notes: ex.notes,
      });
    }
    routinesAdded += 1;
  }

  // Weigh-ins. Matched on the exact instant, which is what a re-import repeats;
  // two genuine weigh-ins a minute apart are still two readings.
  const existingAt = new Set(
    (await db.select({ loggedAt: weightEntries.loggedAt }).from(weightEntries))
      .map((r) => (r.loggedAt ? new Date(r.loggedAt).getTime() : null))
      .filter((t): t is number => t != null)
  );

  let weightsAdded = 0;
  let weightsSkipped = 0;
  const pushed: { id: string; at: number; kg: number }[] = [];

  for (const w of extras.weights) {
    const at = w.at ?? dayToDate(w.date).getTime();
    if (existingAt.has(at)) {
      weightsSkipped += 1;
      continue;
    }
    existingAt.add(at);

    const id = newId('we');
    await db.insert(weightEntries).values({
      id,
      kgOrLb: w.value,
      unit: w.unit,
      loggedAt: new Date(at),
      note: 'Imported',
    });
    pushed.push({ id, at, kg: w.unit === 'kg' ? w.value : w.value * 0.453592 });
    weightsAdded += 1;
  }

  // Inserted directly rather than through addWeightEntry, so the whole history
  // goes to Health Connect as one write instead of one call per weigh-in.
  mirrorWeights(pushed);
  if (weightsAdded > 0) await reapplyCalorieFloor();

  return {
    routinesAdded,
    routinesSkipped,
    exercisesCreated: counts.created,
    exercisesFilledIn: counts.filled,
    weightsAdded,
    weightsSkipped,
  };
}
