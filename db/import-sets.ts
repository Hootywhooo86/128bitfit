/**
 * Writing an imported history into the database.
 *
 * Sets are grouped into one completed session per imported day, so the muscle
 * map, history and PRs all see the same shape as sets logged in the app.
 *
 * Two things this is careful about:
 *   - An exercise the library does not have is created rather than dropped. A
 *     history that silently loses every lift the bundled data never heard of is
 *     not an import.
 *   - Re-importing the same file does not duplicate it. Sessions carry a marker
 *     naming the day they came from, and a day already imported is left alone.
 */
import { and, eq, like } from 'drizzle-orm';
import type { ImportedSet } from '@/lib/import/parse';
import { db } from './client';
import { newId } from './id';
import { exercises, sessionExercises, sets, workoutSessions } from './schema';

export type ImportOutcome = {
  setsAdded: number;
  sessionsAdded: number;
  exercisesCreated: number;
  /** Days already imported, left untouched. */
  duplicatesSkipped: number;
};

/** Marks a session as imported and from which day, so a re-run can spot it. */
const MARKER = (day: string) => `[imported ${day}]`;

/** Local midday, so a day never shifts across a timezone or a DST boundary. */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

async function findOrCreateExercise(name: string, created: { n: number }): Promise<string> {
  const trimmed = name.trim();
  const existing = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.name, trimmed))
    .limit(1);
  if (existing[0]) return existing[0].id;

  // Case-insensitive second look: "Bench Press" and "bench press" are the
  // same lift and should not become two rows.
  const loose = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(like(exercises.name, trimmed))
    .limit(1);
  if (loose[0]) return loose[0].id;

  const id = newId('ex');
  await db.insert(exercises).values({
    id,
    name: trimmed,
    // No muscles: guessing them would colour the muscle map with training that
    // may never have happened. The user can fill them in on the exercise.
    primaryMuscles: '[]',
    secondaryMuscles: '[]',
    instructions: '[]',
    images: '[]',
    category: 'imported',
  });
  created.n += 1;
  return id;
}

export async function importSets(rows: ImportedSet[]): Promise<ImportOutcome> {
  const byDay = new Map<string, ImportedSet[]>();
  for (const r of rows) {
    const list = byDay.get(r.date) ?? [];
    list.push(r);
    byDay.set(r.date, list);
  }

  const created = { n: 0 };
  let setsAdded = 0;
  let sessionsAdded = 0;
  let duplicatesSkipped = 0;

  for (const [day, dayRows] of [...byDay.entries()].sort()) {
    const marker = MARKER(day);
    const already = await db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.notes, marker), eq(workoutSessions.status, 'completed')))
      .limit(1);
    if (already[0]) {
      duplicatesSkipped += dayRows.length;
      continue;
    }

    const sessionId = newId('ws');
    const startedAt = dayToDate(day);
    await db.insert(workoutSessions).values({
      id: sessionId,
      routineId: null,
      startedAt,
      endedAt: startedAt,
      status: 'completed',
      notes: marker,
    });
    sessionsAdded += 1;

    // One session_exercises row per distinct exercise, in the order the file
    // listed them, so set numbering stays per-exercise as it was.
    const order: string[] = [];
    const grouped = new Map<string, ImportedSet[]>();
    for (const r of dayRows) {
      if (!grouped.has(r.exerciseName)) {
        grouped.set(r.exerciseName, []);
        order.push(r.exerciseName);
      }
      grouped.get(r.exerciseName)!.push(r);
    }

    let position = 0;
    for (const name of order) {
      const exerciseId = await findOrCreateExercise(name, created);
      const seId = newId('se');
      await db.insert(sessionExercises).values({
        id: seId,
        sessionId,
        exerciseId,
        position: position++,
      });

      const list = grouped.get(name)!.sort((a, b) => a.setIndex - b.setIndex);
      for (const [i, r] of list.entries()) {
        await db.insert(sets).values({
          id: newId('set'),
          sessionExerciseId: seId,
          setIndex: i + 1,
          reps: r.reps,
          weight: r.weight,
          // The file's unit is kept rather than converted, so nothing is
          // rewritten on the way in; display converts.
          weightUnit: r.weightUnit ?? 'lb',
          completed: true,
          isWarmup: false,
          rpe: r.rpe,
        });
        setsAdded += 1;
      }
    }
  }

  return { setsAdded, sessionsAdded, exercisesCreated: created.n, duplicatesSkipped };
}
