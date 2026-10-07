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

/**
 * The watch recorded a workout but not what kind: Health Connect's "other
 * workout" (0), or a number this app has no name for. These get a nudge to
 * say what it was.
 */
export function isUnidentified(type: number): boolean {
  return type === 0 || !(type in TYPE_NAMES);
}

/**
 * A title that actually says what it was ("Pickleball"), as opposed to one
 * that just repeats that it was a workout. Apple Health names the types
 * Health Connect has no number for; those need no nudge.
 */
export function hasRealTitle(title: string | null | undefined): boolean {
  const t = title?.trim().toLowerCase();
  return !!t && !['workout', 'other', 'exercise', 'activity', 'other workout'].includes(t);
}

/** What the "What was this?" picker offers, most common first. */
export const LABEL_CHOICES: readonly number[] = [
  79, 56, 70, 81, 36, 37, 8, 9, 57, 25, 54, 69, 74, 83, 48, 16, 11, 44, 71, 68, 51, 0,
];

/**
 * Applies the type you gave a workout. A label replaces the watch's type and
 * its title, which usually just repeats the type it got wrong.
 */
export function applyLabel<T extends DetectedSession>(s: T, labels: Readonly<Record<string, number>>): T & { labelled: boolean } {
  const type = labels[s.id];
  if (type == null || !Number.isInteger(type)) return { ...s, labelled: false };
  return { ...s, type, title: null, labelled: true };
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
export const MIN_DETECTED_MS = 60_000;

/** Why a recorded workout is not in the main list. */
export type HiddenReason = 'dismissed' | 'short' | 'logged';

export const HIDDEN_REASON_TEXT: Record<HiddenReason, string> = {
  dismissed: 'You hid it',
  short: 'Under a minute',
  logged: 'Same time as a workout you logged here',
};

export type SortedDetected<T extends DetectedSession = DetectedSession> = {
  shown: T[];
  hidden: { session: T; reason: HiddenReason }[];
};

type Span = { startMs: number; endMs: number };

/**
 * Splits what Health Connect returned into the ones to show and the ones held
 * back, with the reason for each, so a missing workout can always be found
 * and explained. Only what this app wrote itself is dropped outright: that is
 * already in your log.
 *
 * A watch often records a session you also logged in the app. It counts as
 * the same workout only when each covers more than half of the other — a
 * strength session left running for three hours does not swallow the walk
 * the watch picked up inside it.
 */
export function sortDetected<T extends DetectedSession>(
  sessions: readonly T[],
  logged: readonly Span[],
  opts: { ownPackage: string; dismissed: ReadonlySet<string> }
): SortedDetected<T> {
  const len = (a: Span) => a.endMs - a.startMs;
  const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
  const sameWorkout = (a: Span, b: Span) => {
    const o = overlap(a, b);
    return o > len(a) / 2 && o > len(b) / 2;
  };
  const out: SortedDetected<T> = { shown: [], hidden: [] };
  const newest = [...sessions].sort((a, b) => b.startMs - a.startMs);
  for (const s of newest) {
    if (s.source === opts.ownPackage) continue;
    const reason: HiddenReason | null = opts.dismissed.has(s.id)
      ? 'dismissed'
      : len(s) < MIN_DETECTED_MS
        ? 'short'
        : logged.some((l) => sameWorkout(s, l))
          ? 'logged'
          : null;
    if (reason) out.hidden.push({ session: s, reason });
    else out.shown.push(s);
  }
  return out;
}

/** "Google Health" (the Fitbit app's name since May 2026) from com.fitbit.FitbitMobile; the package itself if unknown. */
export function sourceName(pkg: string | null): string {
  if (!pkg) return 'another app';
  // Apple Watch workouts come from com.apple.health.<device id>.
  if (pkg.startsWith('com.apple.health')) return 'Apple Watch';
  const known: Record<string, string> = {
    'com.fitbit.FitbitMobile': 'Google Health',
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
    'com.apple.Fitness': 'Fitness',
    'com.strava.stravaride': 'Strava',
    'com.garmin.connect.mobile': 'Garmin Connect',
    'com.fitbit.FitbitMobile.ios': 'Google Health',
  };
  return known[pkg] ?? pkg;
}

/** One line of the Health Connect report. Same shape as lib/health/diagnose's step. */
export type ReportLine = { label: string; value: string; ok: boolean | null };

/**
 * The workouts part of the Health Connect report: every workout Health
 * Connect holds for the window, when, who wrote it, and whether Home shows it
 * or held it back and why. Built for "my workout from today is missing" —
 * it answers whether Health Connect has it at all before anything else.
 */
export function detectedReport(
  state:
    | { status: 'unavailable' }
    | { status: 'not_connected' }
    | { status: 'no_exercise_access' }
    | { status: 'error'; message: string }
    | {
        status: 'ready';
        days: number;
        workouts: readonly DetectedSession[];
        hidden: readonly { session: DetectedSession; reason: HiddenReason }[];
      },
  now: number,
  time: (ms: number) => string
): ReportLine[] {
  if (state.status === 'unavailable') return [{ label: 'Workouts', value: 'Health Connect not available', ok: false }];
  if (state.status === 'not_connected') return [{ label: 'Workouts', value: 'Not connected', ok: false }];
  if (state.status === 'no_exercise_access') {
    return [{ label: 'Exercise permission', value: 'NOT granted — workouts cannot be read', ok: false }];
  }
  if (state.status === 'error') return [{ label: 'Workouts read', value: `threw — ${state.message}`, ok: false }];

  const all = [
    ...state.workouts.map((s) => ({ s, where: 'on Home' })),
    ...state.hidden.map((h) => ({ s: h.session, where: `held back: ${HIDDEN_REASON_TEXT[h.reason]}` })),
  ].sort((a, b) => b.s.startMs - a.s.startMs);

  const lines: ReportLine[] = [
    {
      label: `Workouts in Health Connect, last ${state.days} days`,
      value: `${all.length} (not counting ones this app wrote)`,
      ok: null,
    },
  ];
  if (all[0]) {
    const mins = Math.max(0, Math.round((now - all[0].s.endMs) / 60_000));
    lines.push({ label: 'Newest workout', value: `ended ${time(all[0].s.endMs)} — ${mins} min ago`, ok: null });
  }
  for (const { s, where } of all) {
    lines.push({
      label: `  ${workoutTypeName(s.type, s.title)}`,
      value: `${time(s.startMs)}–${time(s.endMs)} · ${sourceName(s.source)} · ${where}`,
      ok: null,
    });
  }
  return lines;
}
