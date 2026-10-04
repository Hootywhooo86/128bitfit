/**
 * The pure half of the Apple Health (HealthKit) provider: how its workout
 * types, sleep stages and units map onto what the rest of the app already
 * speaks, which is Health Connect's numbering and the HealthDay shape.
 *
 * Kept free of the native module so it can be tested on any machine.
 */
import { dayKey } from './dates';

/**
 * HKWorkoutActivityType → Health Connect exercise type, so detected workouts,
 * their names, and "Add to my cardio" work the same on both phones. Types
 * Health Connect has no number for map to 0 with HealthKit's own name, so the
 * row still says what it was.
 */
const HK_TO_HC: Record<number, number | [0, string]> = {
  1: 28, // American football
  2: [0, 'Archery'],
  3: 29, // Australian football
  4: 2, // Badminton
  5: 4, // Baseball
  6: 5, // Basketball
  7: [0, 'Bowling'],
  8: 11, // Boxing
  9: 51, // Climbing
  10: 14, // Cricket
  11: [0, 'Cross training'],
  12: [0, 'Curling'],
  13: 8, // Cycling (indoor handled below)
  14: 16, // Dance
  15: 16, // Dance-inspired training
  16: 25, // Elliptical
  17: [0, 'Equestrian'],
  18: 27, // Fencing
  19: [0, 'Fishing'],
  20: 70, // Functional strength training
  21: 32, // Golf
  22: 34, // Gymnastics
  23: 35, // Handball
  24: 37, // Hiking
  25: 38, // Hockey
  26: [0, 'Hunting'],
  27: [0, 'Lacrosse'],
  28: 44, // Martial arts
  29: [0, 'Mind and body'],
  30: [0, 'Mixed cardio'],
  31: 46, // Paddle sports
  32: [0, 'Play'],
  33: [0, 'Recovery'],
  34: 50, // Racquetball
  35: 53, // Rowing (indoor handled below)
  36: 55, // Rugby
  37: 56, // Running (indoor handled below)
  38: 58, // Sailing
  39: 60, // Skating
  40: 61, // Snow sports
  41: 64, // Soccer
  42: 65, // Softball
  43: 66, // Squash
  44: 68, // Stair climbing
  45: 72, // Surfing
  46: 74, // Swimming (open water handled below)
  47: 75, // Table tennis
  48: 76, // Tennis
  49: [0, 'Track and field'],
  50: 70, // Traditional strength training
  51: 78, // Volleyball
  52: 79, // Walking
  53: [0, 'Water fitness'],
  54: 80, // Water polo
  55: [0, 'Water sports'],
  56: [0, 'Wrestling'],
  57: 83, // Yoga
  58: [0, 'Barre'],
  59: [0, 'Core training'],
  60: 61, // Cross-country skiing
  61: 61, // Downhill skiing
  62: 71, // Flexibility
  63: 36, // HIIT
  64: 41, // Jump rope
  65: 11, // Kickboxing
  66: 48, // Pilates
  67: 62, // Snowboarding
  68: 68, // Stairs
  69: [0, 'Step training'],
  70: 82, // Wheelchair walk pace
  71: 82, // Wheelchair run pace
  72: [0, 'Tai chi'],
  73: [0, 'Mixed cardio'],
  74: 8, // Hand cycling
  75: 31, // Disc sports
  76: [0, 'Fitness gaming'],
  77: 16, // Cardio dance
  78: 16, // Social dance
  79: [0, 'Pickleball'],
  80: 71, // Cooldown
  82: [0, 'Triathlon'],
  83: [0, 'Transition'],
  84: 59, // Underwater diving
};

/** HealthKit's swimming location metadata: 1 pool, 2 open water. */
const SWIM_OPEN_WATER = 2;

export type MappedWorkoutType = { type: number; title: string | null };

/**
 * One HealthKit workout's type in Health Connect's numbering. Indoor runs,
 * rides and rows, and open-water swims, are told apart by HealthKit metadata
 * rather than by type, so that is read here too.
 */
export function hcTypeForHealthKit(
  activityType: number,
  meta: { indoor?: unknown; swimmingLocation?: unknown } = {}
): MappedWorkoutType {
  const indoor = meta.indoor === true || meta.indoor === 1;
  if (activityType === 37 && indoor) return { type: 57, title: null };
  if (activityType === 13 && indoor) return { type: 9, title: null };
  if (activityType === 35 && indoor) return { type: 54, title: null };
  if (activityType === 46 && Number(meta.swimmingLocation) === SWIM_OPEN_WATER) return { type: 73, title: null };
  const m = HK_TO_HC[activityType];
  if (m == null) return { type: 0, title: null };
  return Array.isArray(m) ? { type: 0, title: m[1] } : { type: m, title: null };
}

/**
 * The other way, for workouts this app writes: a Health Connect number to a
 * HealthKit type, plus whether HealthKit should be told it was indoors.
 */
export function healthKitTypeForHc(hcType: number): { activityType: number; indoor: boolean } {
  switch (hcType) {
    case 57:
      return { activityType: 37, indoor: true };
    case 9:
      return { activityType: 13, indoor: true };
    case 54:
      return { activityType: 35, indoor: true };
    case 73:
      return { activityType: 46, indoor: false };
    case 70:
      return { activityType: 50, indoor: false };
    case 82:
      return { activityType: 70, indoor: false };
    case 61:
      return { activityType: 61, indoor: false };
    case 16:
      return { activityType: 14, indoor: false };
    case 11:
      return { activityType: 8, indoor: false };
    case 71:
      return { activityType: 62, indoor: false };
    case 68:
      return { activityType: 44, indoor: false };
  }
  for (const [hk, hc] of Object.entries(HK_TO_HC)) {
    if (hc === hcType) return { activityType: Number(hk), indoor: false };
  }
  return { activityType: 3000, indoor: false }; // HKWorkoutActivityType.other
}

/** HKCategoryValueSleepAnalysis: the stages that are sleep, not "in bed" or "awake". */
const ASLEEP = new Set([1, 3, 4, 5]);

/** Gaps longer than this between sleep stages start a new night (or a nap). */
const NEW_NIGHT_GAP_MS = 3 * 60 * 60_000;

export type SleepStageSample = { value: number; startMs: number; endMs: number };

/**
 * Minutes asleep, keyed by the local day of waking — the same rule as
 * ./sleep, applied to HealthKit's shape.
 *
 * HealthKit stores a night as many stage samples (core, deep, REM…), often
 * twice over when the phone and a watch both record it. So: keep the asleep
 * stages, merge overlaps so nothing is counted twice, group what is left into
 * nights split by long gaps, and file each night under the day it ended.
 */
export function sleepMinutesFromStages(samples: readonly SleepStageSample[]): Map<string, number> {
  const asleep = samples
    .filter((s) => ASLEEP.has(s.value) && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
    .map((s) => ({ start: s.startMs, end: s.endMs }))
    .sort((a, b) => a.start - b.start);

  // Union of intervals: two sources recording the same minutes count once.
  const merged: { start: number; end: number }[] = [];
  for (const s of asleep) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }

  const out = new Map<string, number>();
  let night: { end: number; ms: number } | null = null;
  const close = () => {
    if (!night) return;
    const key = dayKey(new Date(night.end));
    out.set(key, (out.get(key) ?? 0) + Math.round(night.ms / 60000));
  };
  for (const s of merged) {
    if (night && s.start - night.end > NEW_NIGHT_GAP_MS) {
      close();
      night = null;
    }
    night = night ? { end: s.end, ms: night.ms + (s.end - s.start) } : { end: s.end, ms: s.end - s.start };
  }
  close();
  return out;
}

/** HealthKit stores percentages as fractions (0.21); the app speaks 21. */
export function percentFromFraction(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 1000) / 10;
}
