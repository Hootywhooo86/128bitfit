import { eq } from 'drizzle-orm';
import {
  DEFAULT_AVATAR,
  normalizeAvatar,
  type AvatarConfig,
  type SexOption,
} from '@/lib/avatar';
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
  onboardingComplete: boolean;
  showAvatarOnHome: boolean;
  avatar: AvatarConfig;
  sex: SexOption | null;
  birthday: string | null;
  heightCm: number | null;
};

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

function parseAvatar(raw: string | null): AvatarConfig {
  if (!raw) return { ...DEFAULT_AVATAR };
  try {
    return normalizeAvatar(JSON.parse(raw) as Partial<AvatarConfig>);
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

export async function isOnboardingComplete(): Promise<boolean> {
  return parseBool(await getSetting('onboarding_complete'), false);
}

export async function markOnboardingComplete(): Promise<void> {
  await setSetting('onboarding_complete', '1');
}

export async function getAvatarConfig(): Promise<AvatarConfig> {
  return parseAvatar(await getSetting('avatar_config'));
}

export async function setAvatarConfig(config: AvatarConfig): Promise<void> {
  await setSetting('avatar_config', JSON.stringify(normalizeAvatar(config)));
}

export async function getAppSettings(): Promise<AppSettings> {
  await ensureDefaultGoals();
  const goals = await getDailyGoals();
  const [
    name,
    unitsRaw,
    onboardingRaw,
    showAvatarRaw,
    avatarRaw,
    sexRaw,
    birthdayRaw,
    heightRaw,
  ] = await Promise.all([
    getSetting('display_name'),
    getSetting('units'),
    getSetting('onboarding_complete'),
    getSetting('show_avatar_on_home'),
    getSetting('avatar_config'),
    getSetting('sex'),
    getSetting('birthday'),
    getSetting('height_cm'),
  ]);
  const units: WeightUnit = unitsRaw === 'kg' ? 'kg' : DEFAULT_UNITS;
  const heightN = heightRaw != null ? Number(heightRaw) : NaN;
  return {
    ...goals,
    displayName: (name && name.trim()) || DEFAULT_DISPLAY_NAME,
    units,
    onboardingComplete: parseBool(onboardingRaw, false),
    showAvatarOnHome: parseBool(showAvatarRaw, true),
    avatar: parseAvatar(avatarRaw),
    sex: parseSex(sexRaw),
    birthday: birthdayRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw) ? birthdayRaw : null,
    heightCm: Number.isFinite(heightN) && heightN > 0 ? heightN : null,
  };
}

export async function updateAppSettings(patch: {
  calorieTarget?: number;
  proteinTarget?: number;
  waterTargetMl?: number;
  displayName?: string;
  units?: WeightUnit;
  onboardingComplete?: boolean;
  showAvatarOnHome?: boolean;
  avatar?: AvatarConfig;
  sex?: SexOption | null;
  birthday?: string | null;
  heightCm?: number | null;
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
  if (patch.onboardingComplete != null) {
    await setSetting('onboarding_complete', patch.onboardingComplete ? '1' : '0');
  }
  if (patch.showAvatarOnHome != null) {
    await setSetting('show_avatar_on_home', patch.showAvatarOnHome ? '1' : '0');
  }
  if (patch.avatar != null) {
    await setAvatarConfig(patch.avatar);
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
  return getAppSettings();
}

export { DEFAULT_GOALS, parseIntSetting };
