/**
 * The data behind "what have I not trained lately".
 *
 * One query, reusing the muscle map's own aggregation so the suggestion and
 * the map can never disagree about what was worked. Everything else is pure
 * and lives in lib/workout-gap.ts.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { gapReport, suggestSession, type GapReport, type PickableExercise, type SuggestedExercise } from '@/lib/workout-gap';
import { db } from './client';
import { periodFor, workEntries } from './muscle-queries';
import { exercises, sessionExercises, sets, workoutSessions } from './schema';

/** Exercises the user has actually logged, newest first — their weights prefill. */
async function familiarExerciseIds(limit = 200): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ id: sessionExercises.exerciseId })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(eq(workoutSessions.status, 'completed'))
    .orderBy(desc(sessionExercises.id))
    .limit(limit);
  return new Set(rows.map((r) => r.id));
}

/**
 * Candidate exercises for the gaps.
 *
 * Pulled per muscle rather than as the whole 900-row library: the picker only
 * ever chooses something that targets a neglected muscle, so the rest of the
 * catalogue is weight it would carry through every round of the selection.
 */
async function candidatesFor(muscles: string[], perMuscle = 40): Promise<PickableExercise[]> {
  if (muscles.length === 0) return [];
  const seen = new Map<string, PickableExercise>();
  for (const m of muscles) {
    const rows = await db
      .select({
        id: exercises.id,
        name: exercises.name,
        primaryMuscles: exercises.primaryMuscles,
        secondaryMuscles: exercises.secondaryMuscles,
      })
      .from(exercises)
      // Quoted, so "lats" cannot match "latissimus" in another row.
      .where(sql`${exercises.primaryMuscles} like ${`%"${m}"%`}`)
      .limit(perMuscle);
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.set(r.id, {
        id: r.id,
        name: r.name,
        primaryMuscles: parseList(r.primaryMuscles),
        secondaryMuscles: parseList(r.secondaryMuscles),
      });
    }
  }
  return [...seen.values()];
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

export type WorkoutSuggestion = {
  report: GapReport;
  /** Empty unless the report is usable. */
  exercises: SuggestedExercise[];
  /** The window this looked at, for the heading. */
  days: number;
};

/**
 * Suggests a session from the muscles with the least work in the window.
 *
 * Takes the emptiest few rather than everything with a zero: a session that
 * tries to cover seventeen muscle groups is not a session.
 */
export async function suggestWorkout(days = 30, exerciseCount = 5): Promise<WorkoutSuggestion> {
  const { since } = periodFor(days);
  const report = gapReport(await workEntries(since));
  if (report.status !== 'ok') return { report, exercises: [], days };

  // Only genuinely untrained muscles drive the suggestion. If nothing is at
  // zero the user has covered everything, and saying so is the honest answer.
  const untrained = report.neglected.filter((g) => g.sets === 0);
  if (untrained.length === 0) return { report, exercises: [], days };

  const target = untrained.slice(0, exerciseCount * 2);
  const [familiar, pool] = await Promise.all([
    familiarExerciseIds(),
    candidatesFor(target.map((g) => g.muscle)),
  ]);

  const withFamiliarity = pool.map((e) => ({ ...e, familiar: familiar.has(e.id) }));
  return { report, exercises: suggestSession(target, withFamiliarity, exerciseCount), days };
}

/** Sets logged in the window, so the screen can say how much it looked at. */
export async function completedSetsSince(days = 30): Promise<number> {
  const { since } = periodFor(days);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    // Typed operators, not a hand-rolled comparison: started_at is stored in
    // SECONDS (drizzle's 'timestamp' mode), so an interpolated getTime() would
    // be a thousand times too large and this would silently count nothing.
    .where(
      and(
        eq(sets.completed, true),
        eq(workoutSessions.status, 'completed'),
        gte(workoutSessions.startedAt, since)
      )
    );
  return Number(row?.n ?? 0);
}
