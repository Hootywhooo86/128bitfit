/**
 * Reads what the widgets show from the same queries the screens use, so a
 * widget can never disagree with the app. Runs inside the app and in the
 * widget's background task alike.
 */
import { getDayFuelSummary } from '@/db/food-queries';
import { getMuscleTally } from '@/db/muscle-queries';
import { getSetting, setSetting } from '@/db/settings-queries';
import { getInProgressSession, loadActiveWorkout } from '@/db/workout-queries';
import { health, today } from '@/lib/health';
import { findScheduledRestEndsAt } from '@/lib/rest-timer-notifications';
import { todayModel, workoutModel, type BurnedReading, type TodayModel, type WorkoutModel } from '@/lib/widget-model';
import { emptyTally, type MuscleTally } from '@/lib/muscle-load';

const BURNED_CACHE = 'widget_burned';

/**
 * Calories burned today, from Health Connect. Health Connect may refuse reads
 * from the background, so a reading taken while the app was open is kept and
 * shown with its time rather than replaced by a dash — or by a 0 it never said.
 */
async function burnedToday(): Promise<BurnedReading> {
  try {
    if ((await health.getAvailability()) !== 'available') return { status: 'unavailable' };
    const perm = await health.getPermissionState();
    if (perm !== 'granted' && perm !== 'partial') return { status: 'not_connected' };
    const day = today();
    const [d] = await health.readDays(day, day);
    if (d?.activeCalories != null) {
      const reading = { status: 'reading' as const, kcal: d.activeCalories, at: Date.now() };
      await setSetting(BURNED_CACHE, JSON.stringify({ day, kcal: reading.kcal, at: reading.at })).catch(() => undefined);
      return reading;
    }
  } catch {
    // Fall through to the last reading taken today.
  }
  try {
    const cached = JSON.parse((await getSetting(BURNED_CACHE)) ?? 'null');
    if (cached?.day === today() && typeof cached.kcal === 'number' && typeof cached.at === 'number') {
      return { status: 'reading', kcal: cached.kcal, at: cached.at };
    }
  } catch {
    // No cache.
  }
  return { status: 'not_connected' };
}

export async function loadToday(): Promise<TodayModel> {
  const [fuel, burned] = await Promise.all([getDayFuelSummary(), burnedToday()]);
  return todayModel({
    calorieTarget: fuel.goals.calorieTarget,
    proteinTarget: fuel.goals.proteinTarget,
    calories: fuel.totals.calories,
    protein: fuel.totals.protein,
    proteinPartial: fuel.partial.protein,
    logCount: fuel.logs.length,
    burned,
  });
}

export async function loadWorkout(): Promise<WorkoutModel> {
  const session = await getInProgressSession();
  if (!session) return { state: 'none' };
  const [active, rest] = await Promise.all([
    loadActiveWorkout(session.id),
    findScheduledRestEndsAt().catch(() => null),
  ]);
  if (!active) return { state: 'none' };
  return workoutModel(
    session,
    active.exercises.map((e) => ({
      id: e.id,
      name: e.exerciseName,
      track: e.track,
      restSeconds: e.restSeconds,
      sets: e.sets.map((s) => ({
        id: s.id,
        completed: s.completed,
        isWarmup: s.isWarmup,
        reps: s.reps,
        weight: s.weight,
        weightUnit: s.weightUnit,
        distanceM: s.distanceM,
      })),
    })),
    rest?.sessionId == null || rest.sessionId === session.id ? rest?.endsAt ?? null : null
  );
}

export async function loadMuscles(): Promise<MuscleTally> {
  try {
    return await getMuscleTally(new Date(Date.now() - 7 * 86_400_000));
  } catch {
    return emptyTally();
  }
}
