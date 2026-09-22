/**
 * Sets worked per muscle over a period, for the muscle map.
 *
 * Only completed sets of completed sessions count, the same rule the set
 * pre-fill uses: an abandoned workout is full of values nobody lifted, and
 * colouring a muscle from those would be inventing training that did not happen.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import {
  muscleRoles,
  tallyMuscleSets,
  type MuscleRoles,
  type MuscleTally,
  type MuscleWorkEntry,
} from '@/lib/muscle-load';
import { db } from './client';
import { exercises, sessionExercises, sets, workoutSessions } from './schema';

export type MusclePeriod = {
  /** Local start of the window. */
  since: Date;
  /** For the heading: "7 days", "30 days". */
  label: string;
};

/** Windows offered on the muscle map. */
export function periodFor(days: number): MusclePeriod {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  return { since, label: `${days} days` };
}

/**
 * Completed sets in the window, grouped by exercise, with that exercise's
 * muscles. Grouping in SQL keeps this one query rather than one per exercise.
 */
async function workEntries(since: Date): Promise<MuscleWorkEntry[]> {
  const rows = await db
    .select({
      completedSets: sql<number>`count(${sets.id})`,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(
        eq(sets.completed, true),
        eq(workoutSessions.status, 'completed'),
        gte(workoutSessions.startedAt, since)
      )
    )
    .groupBy(sessionExercises.exerciseId);

  return rows.map((r) => ({
    completedSets: Number(r.completedSets) || 0,
    // Stored as JSON text columns.
    primaryMuscles: parseList(r.primaryMuscles),
    secondaryMuscles: parseList(r.secondaryMuscles),
  }));
}

export async function getMuscleTally(since: Date): Promise<MuscleTally> {
  return tallyMuscleSets(await workEntries(since));
}

/** What the map colours by: targeted in red, assisting in yellow. */
export async function getMuscleRoles(since: Date): Promise<MuscleRoles> {
  return muscleRoles(await workEntries(since));
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // Malformed row: no muscles rather than a crash mid-render.
    return [];
  }
}
