import { and, eq, gte } from 'drizzle-orm';
import { db } from './client';
import { ensureDefaultGoals } from './food-queries';
import { cardioSessions, foodLogs, sessionExercises, sets, workoutSessions } from './schema';
import { getAppSettings } from './settings-queries';
import { mondayOf, weeklyRecap, type WeeklyRecap } from '@/lib/weekly-recap';

/** This week and last, from what was logged. See lib/weekly-recap.ts. */
export async function getWeeklyRecap(now: Date = new Date()): Promise<WeeklyRecap> {
  const monday = mondayOf(now);
  const since = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);

  const [workouts, setRows, cardio, food, goals, app] = await Promise.all([
    db
      .select({ startedAt: workoutSessions.startedAt })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.status, 'completed'), gte(workoutSessions.startedAt, since))),
    db
      .select({
        startedAt: workoutSessions.startedAt,
        reps: sets.reps,
        weight: sets.weight,
        unit: sets.weightUnit,
      })
      .from(sets)
      .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(workoutSessions.status, 'completed'),
          gte(workoutSessions.startedAt, since),
          eq(sets.completed, true),
          eq(sets.isWarmup, false)
        )
      ),
    db
      .select({ startedAt: cardioSessions.startedAt, distanceM: cardioSessions.distanceM })
      .from(cardioSessions)
      .where(and(eq(cardioSessions.status, 'finished'), gte(cardioSessions.startedAt, since.getTime()))),
    db
      .select({ loggedAt: foodLogs.loggedAt, protein: foodLogs.protein })
      .from(foodLogs)
      .where(gte(foodLogs.loggedAt, since)),
    ensureDefaultGoals(),
    getAppSettings(),
  ]);

  return weeklyRecap({
    now,
    workouts: workouts.map((w) => new Date(w.startedAt).getTime()),
    sets: setRows.map((s) => ({
      at: new Date(s.startedAt).getTime(),
      reps: s.reps,
      weight: s.weight,
      unit: s.unit,
    })),
    cardio: cardio.map((c) => ({ at: c.startedAt, distanceM: c.distanceM })),
    food: food.map((f) => ({ at: new Date(f.loggedAt).getTime(), protein: f.protein })),
    proteinTarget: goals.proteinTarget,
    weightUnit: app.units,
  });
}
