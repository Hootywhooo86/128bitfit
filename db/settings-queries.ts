import { desc, eq } from 'drizzle-orm';
import {
  ageFromBirthday,
  toMetric,
  type CalorieProfile,
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
  ] = await Promise.all([
    getSetting('display_name'),
    getSetting('units'),
    getSetting('onboarding_complete'),
    getSetting('sex'),
    getSetting('birthday'),
    getSetting('height_cm'),
    getSetting('keep_awake'),
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
  const [sexRaw, birthdayRaw, heightRaw, unitsRaw] = await Promise.all([
    getSetting('sex'),
    getSetting('birthday'),
    getSetting('height_cm'),
    getSetting('units'),
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
}): Promise<AppSettings> {
  if (patch.calorieTarget != null) {
    // Non-negotiable #6: the floor is applied here, at the only path into the
    // database, so no screen and no future caller can write below it.
    const clamped = clampCalorieTarget(patch.calorieTarget, await getCalorieProfile());
    await setSetting('calorie_target', String(clamped.value));
  }
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
  return getAppSettings();
}

export { DEFAULT_GOALS, parseIntSetting };
