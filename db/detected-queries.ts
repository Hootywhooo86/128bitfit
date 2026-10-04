import { and, eq, gte } from 'drizzle-orm';
import { health } from '@/lib/health';
import { sortDetected, type DetectedSession, type HiddenReason } from '@/lib/detected-workouts';
import { db } from './client';
import { cardioSessions, workoutSessions } from './schema';
import { getSetting, setSetting } from './settings-queries';

/** This app's own package: what it wrote to Health Connect is not "detected". */
export const OWN_PACKAGE = 'com.hootywhooo86.bit128fit';
const DISMISSED_KEY = 'detected_dismissed';

/** What the recording measured. Each figure is null when it gave none. */
export type DetectedReadings = {
  heartRateAvg: number | null;
  heartRateMax: number | null;
  activeCalories: number | null;
  distanceM: number | null;
};

export type DetectedWorkout = DetectedSession & {
  /** Null when not read for this list (only the first few are, to spare Health Connect). */
  readings: DetectedReadings | null;
};

export type HiddenDetected = { session: DetectedSession; reason: HiddenReason };

export type DetectedState =
  | { status: 'unavailable' }
  | { status: 'not_connected' }
  | { status: 'no_exercise_access' }
  | { status: 'error'; message: string }
  | { status: 'ready'; days: number; workouts: DetectedWorkout[]; hidden: HiddenDetected[] };

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

/** "Show it again" for one hidden by mistake. */
export async function undismissDetected(id: string): Promise<void> {
  const ids = await dismissedIds();
  ids.delete(id);
  await setSetting(DISMISSED_KEY, JSON.stringify([...ids]));
}

async function readingsFor(s: DetectedSession): Promise<DetectedReadings> {
  const w = await health.readWindow(s.startMs, s.endMs);
  return {
    heartRateAvg: w.heartRateAvg,
    heartRateMax: w.heartRateMax,
    // A zero from a window with no calorie records at all is "none given",
    // not "burned nothing" — a 40-minute walk did not cost 0 kcal.
    activeCalories: w.activeCalories != null && w.activeCalories > 0 ? Math.round(w.activeCalories) : null,
    distanceM: w.distanceM ?? null,
  };
}

/**
 * Every workout a watch or another app recorded in the last `days`, newest
 * first, plus the ones held back and why. Only what this app wrote itself is
 * left out entirely. Heart rate and calories are read for the first
 * `readingsFor` workouts only; the rest are read when opened.
 */
export async function getDetectedWorkouts(
  opts: { days?: number; now?: number; readings?: number } = {}
): Promise<DetectedState> {
  const { days = 7, now = Date.now(), readings = 5 } = opts;
  if ((await health.getAvailability()) !== 'available') return { status: 'unavailable' };
  const perm = await health.getPermissionState();
  if (perm !== 'granted' && perm !== 'partial') return { status: 'not_connected' };
  if (!(await health.getGrants()).read.includes('exercise')) return { status: 'no_exercise_access' };

  const since = now - days * 86_400_000;
  let sessions: DetectedSession[];
  try {
    sessions = await health.readWorkouts(since, now);
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  const [dismissed, strength, cardio] = await Promise.all([
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

  const sorted = sortDetected(sessions, logged, { ownPackage: OWN_PACKAGE, dismissed });
  const workouts = await Promise.all(
    sorted.shown.map(async (s, i) => ({
      ...s,
      readings: i < readings ? await readingsFor(s).catch(() => null) : null,
    }))
  );
  return { status: 'ready', days, workouts, hidden: sorted.hidden };
}
