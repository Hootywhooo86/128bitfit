import { and, eq, gte } from 'drizzle-orm';
import { health } from '@/lib/health';
import { applyLabel, sortDetected, type DetectedSession, type HiddenReason } from '@/lib/detected-workouts';
import { db } from './client';
import { cardioSessions, workoutSessions } from './schema';
import { getSetting, setSetting } from './settings-queries';

/** This app's own package: what it wrote to Health Connect is not "detected". */
export const OWN_PACKAGE = 'com.hootywhooo86.bit128fit';
const DISMISSED_KEY = 'detected_dismissed';
const LABELS_KEY = 'detected_labels';

/** What the recording measured. Each figure is null when it gave none. */
export type DetectedReadings = {
  heartRateAvg: number | null;
  heartRateMax: number | null;
  activeCalories: number | null;
  distanceM: number | null;
};

export type DetectedWorkout = DetectedSession & {
  /** You said what it was; the type is yours, not the watch's. */
  labelled: boolean;
  /** Null until read (see readDetectedReadings). */
  readings: DetectedReadings | null;
};

export type HiddenDetected = { session: DetectedSession & { labelled: boolean }; reason: HiddenReason };

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

async function labels(): Promise<Record<string, number>> {
  try {
    const v = JSON.parse((await getSetting(LABELS_KEY)) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v).filter((e): e is [string, number] => Number.isInteger(e[1]))
    );
  } catch {
    return {};
  }
}

/**
 * "What was this?" — the type you gave a workout the watch didn't name (or
 * named wrong). Kept in this app: Health Connect only lets the app that wrote
 * a workout change it.
 */
export async function labelDetected(id: string, type: number): Promise<void> {
  const all = await labels();
  delete all[id];
  all[id] = type;
  // Only recent ids matter; keep the map from growing forever.
  await setSetting(LABELS_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-300))));
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
 * left out entirely. Heart rate and calories are not read here — that is one
 * read per workout per measure — so the list can show at once; fetch them
 * with readDetectedReadings.
 */
export async function getDetectedWorkouts(opts: { days?: number; now?: number } = {}): Promise<DetectedState> {
  const { days = 7, now = Date.now() } = opts;
  if ((await health.getAvailability()) !== 'available') return { status: 'unavailable' };
  // One permission lookup answers both "connected at all?" and "exercise?".
  const grants = await health.getGrants();
  if (grants.read.length === 0 && grants.write.length === 0) return { status: 'not_connected' };
  if (!grants.read.includes('exercise')) return { status: 'no_exercise_access' };

  const since = now - days * 86_400_000;
  const [read, dismissed, named, strength, cardio] = await Promise.all([
    health.readWorkouts(since, now).then(
      (sessions) => ({ sessions, error: null }),
      (e: unknown) => ({ sessions: [], error: e instanceof Error ? e.message : String(e) })
    ),
    dismissedIds(),
    labels(),
    db
      .select({ startedAt: workoutSessions.startedAt, endedAt: workoutSessions.endedAt })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.status, 'completed'), gte(workoutSessions.startedAt, new Date(since - 86_400_000)))),
    db
      .select({ startedAt: cardioSessions.startedAt, endedAt: cardioSessions.endedAt })
      .from(cardioSessions)
      .where(and(eq(cardioSessions.status, 'finished'), gte(cardioSessions.startedAt, since - 86_400_000))),
  ]);
  if (read.error != null) return { status: 'error', message: read.error };

  const logged = [
    ...strength
      .filter((s) => s.startedAt && s.endedAt)
      .map((s) => ({ startMs: new Date(s.startedAt).getTime(), endMs: new Date(s.endedAt!).getTime() })),
    ...cardio.filter((c) => c.endedAt != null).map((c) => ({ startMs: c.startedAt, endMs: c.endedAt! })),
  ];

  const sessions = read.sessions.map((x) => applyLabel(x, named));
  const sorted = sortDetected(sessions, logged, { ownPackage: OWN_PACKAGE, dismissed });
  return {
    status: 'ready',
    days,
    workouts: sorted.shown.map((x) => ({ ...x, readings: null })),
    hidden: sorted.hidden,
  };
}

/** Heart rate, calories and distance for each, read side by side; null where a read failed. */
export async function readDetectedReadings(workouts: readonly DetectedSession[]): Promise<Map<string, DetectedReadings | null>> {
  const out = await Promise.all(workouts.map(async (w) => [w.id, await readingsFor(w).catch(() => null)] as const));
  return new Map(out);
}
