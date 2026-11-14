/**
 * What the workout picker reads: the exercise library (bundled and your own),
 * what you have done, recent load per muscle, and active injuries if you have
 * chosen to tell the coach about them.
 */
import { and, eq, sql } from 'drizzle-orm';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-load';
import type { LibraryExercise, PickHistory } from '@/lib/workout-pick';
import { db } from './client';
import { getTellCoach, listActiveInjuries } from './injury-queries';
import { getMuscleTally, periodFor } from './muscle-queries';
import { exercises, sessionExercises, sets, workoutSessions } from './schema';

const GROUPS = new Set<string>(MUSCLE_GROUPS);
const DAY = 86_400_000;

function muscles(raw: string | null): MuscleGroup[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((m) => (typeof m === 'string' ? m.trim().toLowerCase() : ''))
      .filter((m): m is MuscleGroup => GROUPS.has(m));
  } catch {
    return [];
  }
}

export async function loadPickLibrary(): Promise<LibraryExercise[]> {
  const rows = await db.select().from(exercises);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    equipment: r.equipment,
    category: r.category,
    mechanic: r.mechanic,
    level: r.level,
    primary: muscles(r.primaryMuscles),
    secondary: muscles(r.secondaryMuscles),
    hasImage: (r.images ?? '[]') !== '[]',
  }));
}

export async function loadPickHistory(now = new Date()): Promise<PickHistory> {
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      primaryMuscles: exercises.primaryMuscles,
      last: sql<number>`max(${workoutSessions.startedAt})`,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(and(eq(sets.completed, true), eq(workoutSessions.status, 'completed')))
    .groupBy(sessionExercises.exerciseId);

  const done = new Set<string>();
  const lastByMuscle = new Map<MuscleGroup, number>();
  for (const r of rows) {
    done.add(r.exerciseId);
    // Stored as seconds by drizzle's timestamp mode.
    const at = Number(r.last) * 1000;
    if (!Number.isFinite(at)) continue;
    for (const m of muscles(r.primaryMuscles)) lastByMuscle.set(m, Math.max(lastByMuscle.get(m) ?? 0, at));
  }
  const daysSince: PickHistory['daysSince'] = {};
  for (const [m, at] of lastByMuscle) daysSince[m] = Math.max(0, Math.floor((now.getTime() - at) / DAY));

  const tally = await getMuscleTally(periodFor(7).since);
  const recentSets: PickHistory['recentSets'] = {};
  for (const m of MUSCLE_GROUPS) if (tally[m] > 0) recentSets[m] = tally[m];
  return { done, recentSets, daysSince };
}

/** Active injuries in the user's words, or none if they chose not to tell the coach. */
export async function loadPickInjuries(): Promise<string[]> {
  if (!(await getTellCoach())) return [];
  const hurts = await listActiveInjuries();
  return hurts.map((h) => `${h.area} (${h.severity})${h.avoid ? `: avoid ${h.avoid}` : ''}`);
}
