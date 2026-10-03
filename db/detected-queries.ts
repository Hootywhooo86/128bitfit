import { and, eq, gte } from 'drizzle-orm';
import { health } from '@/lib/health';
import { pickDetected, type DetectedSession } from '@/lib/detected-workouts';
import { db } from './client';
import { cardioSessions, workoutSessions } from './schema';
import { getSetting, setSetting } from './settings-queries';

/** This app's own package: what it wrote to Health Connect is not "detected". */
export const OWN_PACKAGE = 'com.hootywhooo86.bit128fit';
const DISMISSED_KEY = 'detected_dismissed';

export type DetectedWorkout = DetectedSession & {
  heartRateAvg: number | null;
  heartRateMax: number | null;
  /** Measured by the watch or app that recorded it; null when it gave none. */
  activeCalories: number | null;
  distanceM: number | null;
};

export type DetectedState =
  | { status: 'unavailable' }
  | { status: 'not_connected' }
  | { status: 'ready'; workouts: DetectedWorkout[] };

async function dismissedIds(): Promise<Set<string>> {
  try {
    const v = JSON.parse((await getSetting(DISMISSED_KEY)) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** "Not a workout": hidden from Home for good. */
export async function dismissDetected(id: string): Promise<void> {
  const ids = await dismissedIds();
  ids.add(id);
  // Only recent ids matter; keep the list from growing forever.
  await setSetting(DISMISSED_KEY, JSON.stringify([...ids].slice(-300)));
}

/**
 * Workouts recorded by a watch or another app in the last `days`, with what
 * that recording measured: heart rate, active calories, distance. Workouts you
 * logged in this app, and ones it wrote itself, are left out.
 */
export async function getDetectedWorkouts(days = 7, now = Date.now(), limit = 8): Promise<DetectedState> {
  if ((await health.getAvailability()) !== 'available') return { status: 'unavailable' };
  const perm = await health.getPermissionState();
  if (perm !== 'granted' && perm !== 'partial') return { status: 'not_connected' };

  const since = now - days * 86_400_000;
  const [sessions, dismissed, strength, cardio] = await Promise.all([
    health.readWorkouts(since, now),
    dismissedIds(),
    db
      .select({ startedAt: workoutSessions.startedAt, endedAt: workoutSessions.endedAt })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.status, 'completed'), gte(workoutSessions.startedAt, new Date(since - 86_400_000)))),
    db
      .select({ startedAt: cardioSessions.startedAt, endedAt: cardioSessions.endedAt })
      .from(cardioSessions)
      .where(and(eq(cardioSessions.status, 'finished'), gte(cardioSessions.startedAt, since - 86_400_000))),
  ]);

  const logged = [
    ...strength
      .filter((s) => s.startedAt && s.endedAt)
      .map((s) => ({ startMs: new Date(s.startedAt).getTime(), endMs: new Date(s.endedAt!).getTime() })),
    ...cardio.filter((c) => c.endedAt != null).map((c) => ({ startMs: c.startedAt, endMs: c.endedAt! })),
  ];

  const picked = pickDetected(sessions, logged, { ownPackage: OWN_PACKAGE, dismissed }).slice(0, limit);
  const workouts = await Promise.all(
    picked.map(async (s) => {
      const w = await health.readWindow(s.startMs, s.endMs);
      return {
        ...s,
        heartRateAvg: w.heartRateAvg,
        heartRateMax: w.heartRateMax,
        // A zero from a window with no calorie records at all is "none given",
        // not "burned nothing" — a 40-minute walk did not cost 0 kcal.
        activeCalories: w.activeCalories != null && w.activeCalories > 0 ? Math.round(w.activeCalories) : null,
        distanceM: w.distanceM ?? null,
      };
    })
  );
  return { status: 'ready', workouts };
}
