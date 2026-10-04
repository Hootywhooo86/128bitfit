import { desc, eq } from 'drizzle-orm';
import {
  ACTIVITY_LEVELS,
  DEFAULT_ACTIVITY,
  DEFAULT_GOAL,
  GOALS,
  ageFromBirthday,
  toMetric,
  type ActivityLevel,
  type CalorieProfile,
  type Goal,
  type SexOption,
} from '@/lib/body';
import { clampCalorieTarget, type ClampedTarget } from '@/lib/calorie-floor';
import { db } from './client';
import { settings, weightEntries } from './schema';
import {
  DEFAULT_GOALS,
  ensureDefaultGoals,
  getDailyGoals,
  type DailyGoals,
} from './food-queries';
import { widgetsChanged } from '@/lib/widget-refresh';

export type WeightUnit = 'kg' | 'lb';

export type AppSettings = DailyGoals & {
  displayName: string;
  units: WeightUnit;
  onboardingComplete: boolean;
  sex: SexOption | null;
  birthday: string | null;
  heightCm: number | null;
  /** Hold the screen awake while a workout is running. */
  keepAwake: boolean;
  /** How much you move outside training — the TDEE multiplier. */
  activity: ActivityLevel;
  /** Cut, maintain or bulk. Adjusts the suggested target, never the floor. */
  goal: Goal;
};

/**
 * On by default.
 *
 * A screen that sleeps between sets means unlocking the phone to log each one,
 * which is the three-second rule lost to a system setting. Someone who would
 * rather have the battery can turn it off; nobody should have to turn it on to
 * make logging work.
 */
export const DEFAULT_KEEP_AWAKE = true;

const DEFAULT_DISPLAY_NAME = 'Athlete';
const DEFAULT_UNITS: WeightUnit = 'lb';

const SEX_VALUES: SexOption[] = ['female', 'male', 'other', 'prefer_not'];

const parseActivity = (raw: string | null): ActivityLevel =>
  ACTIVITY_LEVELS.some((l) => l.id === raw) ? (raw as ActivityLevel) : DEFAULT_ACTIVITY;
const parseGoal = (raw: string | null): Goal =>
  GOALS.some((g) => g.id === raw) ? (raw as Goal) : DEFAULT_GOAL;

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

function parseIntSetting(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(raw: string | null, fallback = false): boolean {
  if (raw == null) return fallback;
  return raw === '1' || raw === 'true';
}

function parseSex(raw: string | null): SexOption | null {
  if (!raw) return null;
  return SEX_VALUES.includes(raw as SexOption) ? (raw as SexOption) : null;
}

export async function isOnboardingComplete(): Promise<boolean> {
  return parseBool(await getSetting('onboarding_complete'), false);
}

export async function markOnboardingComplete(): Promise<void> {
  await setSetting('onboarding_complete', '1');
}

export async function getAppSettings(): Promise<AppSettings> {
  await ensureDefaultGoals();
  const goals = await getDailyGoals();
  const [
    name,
    unitsRaw,
    onboardingRaw,
    sexRaw,
    birthdayRaw,
    heightRaw,
    keepAwakeRaw,
    activityRaw,
    goalRaw,
  ] = await Promise.all([
    getSetting('display_name'),
    getSetting('units'),
    getSetting('onboarding_complete'),
    getSetting('sex'),
    getSetting('birthday'),
    getSetting('height_cm'),
    getSetting('keep_awake'),
    getSetting('activity_level'),
    getSetting('goal'),
  ]);
  const units: WeightUnit = unitsRaw === 'kg' ? 'kg' : DEFAULT_UNITS;
  const heightN = heightRaw != null ? Number(heightRaw) : NaN;
  return {
    ...goals,
    displayName: (name && name.trim()) || DEFAULT_DISPLAY_NAME,
    units,
    onboardingComplete: parseBool(onboardingRaw, false),
    sex: parseSex(sexRaw),
    birthday: birthdayRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw) ? birthdayRaw : null,
    heightCm: Number.isFinite(heightN) && heightN > 0 ? heightN : null,
    keepAwake: parseBool(keepAwakeRaw, DEFAULT_KEEP_AWAKE),
    activity: parseActivity(activityRaw),
    goal: parseGoal(goalRaw),
  };
}

/**
 * The body data the calorie floor needs. Weight comes from the most recent
 * weigh-in; the rest from settings. Any of it may be missing, in which case
 * the floor falls back to the absolute minimum.
 *
 * Queried straight off the table rather than through weight-queries, which
 * imports from this module — going the other way at runtime would close a
 * cycle.
 */
export async function getCalorieProfile(): Promise<CalorieProfile> {
  const [sexRaw, birthdayRaw, heightRaw, unitsRaw, activityRaw] = await Promise.all([
    getSetting('sex'),
    getSetting('birthday'),
    getSetting('height_cm'),
    getSetting('units'),
    getSetting('activity_level'),
  ]);

  const latest = await db
    .select({ value: weightEntries.kgOrLb, unit: weightEntries.unit })
    .from(weightEntries)
    .orderBy(desc(weightEntries.loggedAt))
    .limit(1);

  const heightN = heightRaw != null ? Number(heightRaw) : NaN;
  const entry = latest[0];
  // Each weigh-in stores the unit it was entered in; trust that over the
  // display preference, which the user may have changed since.
  const { kg, cm } = toMetric({
    heightCm: Number.isFinite(heightN) && heightN > 0 ? heightN : null,
    weightValue: entry ? entry.value : null,
    units: entry ? (entry.unit === 'kg' ? 'kg' : 'lb') : unitsRaw === 'kg' ? 'kg' : 'lb',
  });

  return {
    sex: parseSex(sexRaw),
    age: ageFromBirthday(birthdayRaw),
    weightKg: kg,
    heightCm: cm,
    // Carried here too, or the floor and the suggestion disagree about what
    // maintenance is for this person.
    activity: parseActivity(activityRaw),
  };
}

/**
 * Applies the calorie floor. Exported so a screen can show what will happen
 * before saving — but enforcement does not depend on any screen calling it,
 * because updateAppSettings clamps again on the way to the database.
 */
export async function previewCalorieTarget(requested: number): Promise<ClampedTarget> {
  return clampCalorieTarget(requested, await getCalorieProfile());
}

export async function updateAppSettings(patch: {
  calorieTarget?: number;
  proteinTarget?: number;
  waterTargetMl?: number;
  displayName?: string;
  units?: WeightUnit;
  onboardingComplete?: boolean;
  sex?: SexOption | null;
  birthday?: string | null;
  heightCm?: number | null;
  keepAwake?: boolean;
  activity?: ActivityLevel;
  goal?: Goal;
}): Promise<AppSettings> {
  // Home-screen widgets show this; they redraw shortly after (lib/widget-refresh).
  widgetsChanged();
  if (patch.proteinTarget != null) {
    await setSetting('protein_target', String(Math.round(patch.proteinTarget)));
  }
  if (patch.waterTargetMl != null) {
    await setSetting('water_target_ml', String(Math.round(patch.waterTargetMl)));
  }
  if (patch.displayName != null) {
    await setSetting('display_name', patch.displayName.trim() || DEFAULT_DISPLAY_NAME);
  }
  if (patch.units != null) {
    await setSetting('units', patch.units === 'kg' ? 'kg' : 'lb');
  }
  if (patch.onboardingComplete != null) {
    await setSetting('onboarding_complete', patch.onboardingComplete ? '1' : '0');
  }
  if (patch.sex !== undefined) {
    if (patch.sex == null) await setSetting('sex', '');
    else await setSetting('sex', patch.sex);
  }
  if (patch.birthday !== undefined) {
    await setSetting('birthday', patch.birthday ?? '');
  }
  if (patch.heightCm !== undefined) {
    if (patch.heightCm == null) await setSetting('height_cm', '');
    else await setSetting('height_cm', String(Math.round(patch.heightCm)));
  }
  if (patch.keepAwake != null) {
    await setSetting('keep_awake', patch.keepAwake ? '1' : '0');
  }
  if (patch.activity != null) await setSetting('activity_level', patch.activity);
  if (patch.goal != null) await setSetting('goal', patch.goal);

  // Non-negotiable #6, applied last: sex, birthday, height and activity above
  // all move the floor, and onboarding sends them in the same call as the
  // target. Clamping first measured the target against the profile as it was
  // before this save — for a new user, an empty one, so a target far below
  // their BMR went straight in.
  if (patch.calorieTarget != null) {
    const clamped = clampCalorieTarget(patch.calorieTarget, await getCalorieProfile());
    await setSetting('calorie_target', String(clamped.value));
  } else {
    await reapplyCalorieFloor();
  }
  return getAppSettings();
}

/**
 * Raises the stored target if the profile has moved the floor above it — a
 * weigh-in, a birthday, a change of activity. The floor is a property of the
 * person, not of the moment the target was typed, so it is checked again
 * whenever the person changes. Returns the result, or null with no target.
 */
export async function reapplyCalorieFloor(): Promise<ClampedTarget | null> {
  const raw = await getSetting('calorie_target');
  if (raw == null || raw === '') return null;
  const clamped = clampCalorieTarget(Number(raw), await getCalorieProfile());
  if (clamped.clamped) await setSetting('calorie_target', String(clamped.value));
  return clamped;
}

export { DEFAULT_GOALS, parseIntSetting };
