/**
 * Workouts your watch or another app recorded into Health Connect — an
 * auto-detected walk, a run started on the watch, a class — shown on Home so
 * nothing you did goes uncounted.
 *
 * Pure: the reading lives in lib/health and db/detected-queries.ts; deciding
 * what to show, and calling it by name, lives here where it is tested.
 */

/** Health Connect's ExerciseSessionRecord types, by number. */
const TYPE_NAMES: Record<number, string> = {
  0: 'Workout',
  1: 'Back extension',
  2: 'Badminton',
  3: 'Barbell shoulder press',
  4: 'Baseball',
  5: 'Basketball',
  6: 'Bench press',
  7: 'Bench sit up',
  8: 'Ride',
  9: 'Indoor ride',
  10: 'Boot camp',
  11: 'Boxing',
  12: 'Burpee',
  13: 'Calisthenics',
  14: 'Cricket',
  15: 'Crunch',
  16: 'Dancing',
  17: 'Deadlift',
  18: 'Dumbbell curl left arm',
  19: 'Dumbbell curl right arm',
  20: 'Dumbbell front raise',
  21: 'Dumbbell lateral raise',
  22: 'Dumbbell triceps extension left arm',
  23: 'Dumbbell triceps extension right arm',
  24: 'Dumbbell triceps extension two arm',
  25: 'Elliptical',
  26: 'Exercise class',
  27: 'Fencing',
  28: 'American football',
  29: 'Australian football',
  30: 'Forward twist',
  31: 'Frisbee',
  32: 'Golf',
  33: 'Guided breathing',
  34: 'Gymnastics',
  35: 'Handball',
  36: 'HIIT',
  37: 'Hike',
  38: 'Ice hockey',
  39: 'Ice skating',
  40: 'Jumping jack',
  41: 'Jump rope',
  42: 'Lat pull down',
  43: 'Lunge',
  44: 'Martial arts',
  46: 'Paddling',
  47: 'Paragliding',
  48: 'Pilates',
  49: 'Plank',
  50: 'Racquetball',
  51: 'Rock climbing',
  52: 'Roller hockey',
  53: 'Rowing',
  54: 'Rowing machine',
  55: 'Rugby',
  56: 'Run',
  57: 'Treadmill run',
  58: 'Sailing',
  59: 'Scuba diving',
  60: 'Skating',
  61: 'Skiing',
  62: 'Snowboarding',
  63: 'Snowshoeing',
  64: 'Soccer',
  65: 'Softball',
  66: 'Squash',
  67: 'Squat',
  68: 'Stair climbing',
  69: 'Stair machine',
  70: 'Strength training',
  71: 'Stretching',
  72: 'Surfing',
  73: 'Open-water swim',
  74: 'Pool swim',
  75: 'Table tennis',
  76: 'Tennis',
  77: 'Upper twist',
  78: 'Volleyball',
  79: 'Walk',
  80: 'Water polo',
  81: 'Weightlifting',
  82: 'Wheelchair',
  83: 'Yoga',
};

export function workoutTypeName(type: number, title?: string | null): string {
  const t = title?.trim();
  if (t) return t;
  return TYPE_NAMES[type] ?? 'Workout';
}

/** The app's own sport for a detected type, so it can be added as cardio. */
const TYPE_TO_SPORT: Record<number, string> = {
  79: 'walk',
  56: 'run',
  57: 'treadmill',
  37: 'hike',
  8: 'ride',
  9: 'indoor_ride',
  82: 'wheelchair',
};

export function sportForType(type: number): string | null {
  return TYPE_TO_SPORT[type] ?? null;
}

export type DetectedSession = {
  id: string;
  type: number;
  title: string | null;
  startMs: number;
  endMs: number;
  /** The app that wrote it, e.g. com.fitbit.FitbitMobile. */
  source: string | null;
};

/** Shorter than this is a false start, not a workout. */
export const MIN_DETECTED_MS = 3 * 60_000;

/**
 * The ones worth showing: not written by this app, not hidden, long enough,
 * and not the same workout you already logged here. A watch often records a
 * session you also logged in the app; overlapping by more than half of the
 * detected session's length counts as the same workout.
 */
export function pickDetected(
  sessions: readonly DetectedSession[],
  logged: readonly { startMs: number; endMs: number }[],
  opts: { ownPackage: string; dismissed: ReadonlySet<string> }
): DetectedSession[] {
  const overlap = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) =>
    Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
  return sessions
    .filter((s) => s.source !== opts.ownPackage)
    .filter((s) => !opts.dismissed.has(s.id))
    .filter((s) => s.endMs - s.startMs >= MIN_DETECTED_MS)
    .filter((s) => !logged.some((l) => overlap(s, l) > (s.endMs - s.startMs) / 2))
    .sort((a, b) => b.startMs - a.startMs);
}

/** "Fitbit" from com.fitbit.FitbitMobile; the package itself if unknown. */
export function sourceName(pkg: string | null): string {
  if (!pkg) return 'another app';
  const known: Record<string, string> = {
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.google.android.apps.fitness': 'Google Fit',
    'com.google.android.apps.healthdata': 'Health Connect',
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.garmin.android.apps.connectmobile': 'Garmin Connect',
    'com.strava': 'Strava',
    'com.whoop.android': 'WHOOP',
    'com.ouraring.oura': 'Oura',
    'com.xiaomi.wearable': 'Mi Fitness',
    'com.huawei.health': 'Huawei Health',
    'com.polar.polarflow': 'Polar Flow',
    'com.suunto.android': 'Suunto',
  };
  return known[pkg] ?? pkg;
}
