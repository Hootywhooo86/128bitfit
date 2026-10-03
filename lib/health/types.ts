/**
 * Platform-agnostic health data access.
 *
 * Health Connect (Android) is the only implementation today; HealthKit slots in
 * behind the same interface later. Nothing above this layer imports a platform
 * SDK directly.
 *
 * The honesty rule from CLAUDE.md is encoded in the types: every metric is
 * `number | null`, where `null` means "no reading was taken" and `0` means "we
 * read it and it was zero". Callers must render those differently and must
 * never substitute one for the other.
 */

/** Whether health data can be read on this device at all. */
export type HealthAvailability =
  /** Provider present and usable. */
  | 'available'
  /** No provider on this device, or an unsupported platform (iOS today, web). */
  | 'unavailable'
  /** Provider installed but too old to talk to; the user must update it. */
  | 'update_required';

/**
 * Whether the user has granted us the data we ask for.
 *
 * `partial` exists because Health Connect lets the user tick some boxes and not
 * others, and that is a normal thing to do. Collapsing it into `denied` would
 * hide steps the user did grant; collapsing it into `granted` would make the
 * app promise data it cannot read.
 */
export type HealthPermissionState = 'granted' | 'partial' | 'denied' | 'unknown';

/**
 * Everything the app asks for, named in its own terms rather than the
 * platform's. Each maps to one record type per implementation.
 */
export const HEALTH_SCOPES = [
  'steps',
  'heartRate',
  'restingHeartRate',
  'activeCalories',
  'totalCalories',
  'distance',
  'sleep',
  'weight',
  'height',
  'bodyFat',
  'exercise',
  'nutrition',
  'hydration',
  'oxygenSaturation',
  'respiratoryRate',
  'vo2Max',
  'bloodPressure',
  'basalMetabolicRate',
] as const;
export type HealthScope = (typeof HEALTH_SCOPES)[number];

/** What the user has actually agreed to, per direction. */
export type HealthGrants = {
  read: HealthScope[];
  write: HealthScope[];
};

/**
 * One local calendar day of metrics.
 *
 * `null` is not zero. See the module comment. A field is null when the day
 * could not be read *or* when that scope was never granted — in both cases no
 * reading was taken, which is the distinction that matters.
 */
export type HealthDay = {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  steps: number | null;
  /** Mean of the day's samples, not a resting figure. */
  heartRateAvg: number | null;
  heartRateMin: number | null;
  heartRateMax: number | null;
  restingHeartRate: number | null;
  activeCalories: number | null;
  totalCalories: number | null;
  distanceMeters: number | null;
  sleepMinutes: number | null;
  /** Latest reading that day, not an average — weight is a point measurement. */
  weightKg: number | null;
  bodyFatPercent: number | null;
  hydrationMl: number | null;
  oxygenSaturation: number | null;
  respiratoryRate: number | null;
};

/** A day with nothing read. Callers build on this so a new metric cannot default to 0. */
export function emptyHealthDay(date: string): HealthDay {
  return {
    date,
    steps: null,
    heartRateAvg: null,
    heartRateMin: null,
    heartRateMax: null,
    restingHeartRate: null,
    activeCalories: null,
    totalCalories: null,
    distanceMeters: null,
    sleepMinutes: null,
    weightKg: null,
    bodyFatPercent: null,
    hydrationMl: null,
    oxygenSaturation: null,
    respiratoryRate: null,
  };
}

/**
 * Our own id for a record we wrote, carried into the platform store.
 *
 * Health Connect calls this a clientRecordId and treats it as a primary key of
 * ours: writing the same one twice updates the record rather than adding a
 * second copy, and it lets us delete exactly the record we wrote when the user
 * deletes the local row. Without it, editing a logged meal leaves the old
 * version in Health Connect forever and deleting it leaves all of them.
 */
export type WithClientId = {
  /** The local row id. Omitted only where there is no local row to point at. */
  clientId?: string;
};

/**
 * Metrics for one exact time window.
 *
 * A day's average heart rate says nothing about what a 50-minute session cost —
 * it is diluted by sixteen hours of sitting still. Attributing effort to a
 * workout needs the window, not the day.
 */
export type HeartRateSample = { t: number; bpm: number };

export type HealthWindow = {
  heartRateAvg: number | null;
  heartRateMax: number | null;
  /** Measured, by whatever recorded it. Never our own estimate. */
  activeCalories: number | null;
  /** Metres, summed from Distance records; null when nothing recorded any. */
  distanceM?: number | null;
};

/** A workout another app or a watch wrote to the health store. */
export type HealthWorkoutSession = {
  id: string;
  /** The platform's exercise type number. */
  type: number;
  title: string | null;
  startMs: number;
  endMs: number;
  /** Package of the app that wrote it. */
  source: string | null;
};

/** A completed workout to push back to the platform's health store. */
export type HealthWorkoutEntry = WithClientId & {
  startedAt: number;
  endedAt: number;
  /** Shown in the health app's own UI. */
  title?: string;
  /** Health Connect ExerciseType; strength training when left out. */
  exerciseType?: number;
};

/*
 * Note on calories: a session is written as duration and title only, never with
 * an energy figure attached.
 *
 * The app can estimate what a workout burned (lib/workout-energy.ts) and shows
 * that estimate, labelled, on the summary screen. Writing it into Health
 * Connect would strip the label — every other app reading it would treat a
 * guess from time and body weight as a measurement from a watch. That is the
 * fake-sync mistake in CLAUDE.md, one layer down, so the estimate stays in our
 * UI where its caveat travels with it.
 */

/** A logged meal to push back. Grams and kilocalories, per the platform's units. */
export type HealthNutritionEntry = WithClientId & {
  at: number;
  name?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carb?: number | null;
  fiber?: number | null;
  sugars?: number | null;
  saturatedFat?: number | null;
  /** Milligrams, as labels state it. */
  sodium?: number | null;
};

export type HealthWeightEntry = WithClientId & {
  at: number;
  kg: number;
};

export type HealthHydrationEntry = WithClientId & {
  at: number;
  ml: number;
};

/** What a write attempt did. `written` is how many records the platform took. */
export type HealthWriteResult = {
  written: number;
  /** One honest sentence when something went wrong, else null. */
  error: string | null;
};

export interface HealthProvider {
  /** For logs and the Settings screen, e.g. "Health Connect". */
  readonly name: string;

  getAvailability(): Promise<HealthAvailability>;

  /** Never prompts. Safe to call on every screen focus. */
  getPermissionState(): Promise<HealthPermissionState>;

  /** Which scopes the user actually granted, so the UI can say what is missing. */
  getGrants(): Promise<HealthGrants>;

  /** Prompts. Only call from an explicit user action. */
  requestPermissions(): Promise<HealthPermissionState>;

  /**
   * Read whole local days, inclusive of both ends. Days with no reading come
   * back with null metrics rather than being omitted, so callers can tell
   * "nothing recorded" from "not asked for".
   */
  readDays(startDate: string, endDate: string): Promise<HealthDay[]>;

  /** Metrics between two exact instants, for attributing them to one session. */
  readWindow(startMs: number, endMs: number): Promise<HealthWindow>;

  /**
   * Every heart-rate sample between two instants, oldest first, for the graph.
   * Empty when nothing was recorded or it cannot be read — never made up.
   */
  readHeartRateSeries(startMs: number, endMs: number): Promise<HeartRateSample[]>;
  /** Exercise sessions in the store from any app, oldest first. */
  readWorkouts(startMs: number, endMs: number): Promise<HealthWorkoutSession[]>;

  writeEntries(entries: HealthWorkoutEntry[]): Promise<number>;
  writeNutrition(entries: HealthNutritionEntry[]): Promise<HealthWriteResult>;
  writeWeight(entries: HealthWeightEntry[]): Promise<HealthWriteResult>;
  writeHydration(entries: HealthHydrationEntry[]): Promise<HealthWriteResult>;

  /**
   * Removes records we previously wrote, by the client ids we gave them.
   *
   * Only ever touches our own rows: the platform scopes a clientRecordId to the
   * writing app, so this cannot delete data another app recorded.
   */
  deleteEntries(
    scope: 'nutrition' | 'weight' | 'hydration' | 'exercise',
    clientIds: string[]
  ): Promise<HealthWriteResult>;

  /** Opens the platform health app so the user can change permissions. */
  openSettings(): void;
}
