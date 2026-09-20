import { eq } from 'drizzle-orm';
import { db } from './client';
import { settings } from './schema';
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
};

const DEFAULT_DISPLAY_NAME = 'Athlete';
const DEFAULT_UNITS: WeightUnit = 'lb';

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

export async function getAppSettings(): Promise<AppSettings> {
  await ensureDefaultGoals();
  const goals = await getDailyGoals();
  const [name, unitsRaw] = await Promise.all([
    getSetting('display_name'),
    getSetting('units'),
  ]);
  const units: WeightUnit = unitsRaw === 'kg' ? 'kg' : DEFAULT_UNITS;
  return {
    ...goals,
    displayName: (name && name.trim()) || DEFAULT_DISPLAY_NAME,
    units,
  };
}

export async function updateAppSettings(patch: {
  calorieTarget?: number;
  proteinTarget?: number;
  waterTargetMl?: number;
  displayName?: string;
  units?: WeightUnit;
}): Promise<AppSettings> {
  if (patch.calorieTarget != null) {
    await setSetting('calorie_target', String(Math.round(patch.calorieTarget)));
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
  return getAppSettings();
}

export { DEFAULT_GOALS, parseIntSetting };
