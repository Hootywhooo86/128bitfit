/** Pixel avatar config, palettes, and goal helpers for onboarding. */

export const BODY_TYPES = [
  'petite',
  'slim',
  'average',
  'athletic',
  'curvy',
  'solid',
  'broad',
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  petite: 'Petite',
  slim: 'Slim',
  average: 'Average',
  athletic: 'Athletic',
  curvy: 'Curvy',
  solid: 'Solid',
  broad: 'Broad',
};

export const AVATAR_POSES = ['idle', 'curl', 'eat', 'think'] as const;
export type AvatarPose = (typeof AVATAR_POSES)[number];

export type SexOption = 'female' | 'male' | 'other' | 'prefer_not';

export type AvatarConfig = {
  bodyType: BodyType;
  skinTone: number;
  eyeColor: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
  top: number;
  bottom: number;
  accessory: number;
};

export const SKIN_TONES = [
  '#e8e8e8',
  '#c8c8c8',
  '#a0a0a0',
  '#787878',
  '#505050',
  '#2e2e2e',
] as const;

export const EYE_COLORS = [
  '#1a1a1a',
  '#4a4a4a',
  '#6e6e6e',
  '#909090',
  '#b8b8b8',
  '#e0e0e0',
] as const;

export const HAIR_COLORS = [
  '#0f0f0f',
  '#2a2a2a',
  '#454545',
  '#6a6a6a',
  '#909090',
  '#b8b8b8',
  '#dcdcdc',
  '#f5f5f5',
] as const;

export const HAIR_STYLES = [
  { id: 0, label: 'Buzz' },
  { id: 1, label: 'Short' },
  { id: 2, label: 'Medium' },
  { id: 3, label: 'Long' },
  { id: 4, label: 'Ponytail' },
  { id: 5, label: 'Bun' },
] as const;

export const FACIAL_HAIR = [
  { id: 0, label: 'None' },
  { id: 1, label: 'Stubble' },
  { id: 2, label: 'Mustache' },
  { id: 3, label: 'Beard' },
] as const;

export const TOPS = [
  { id: 0, label: 'Tee', color: '#ffffff' },
  { id: 1, label: 'Tank', color: '#c8c8c8' },
  { id: 2, label: 'Hoodie', color: '#888888' },
  { id: 3, label: 'Crop', color: '#555555' },
  { id: 4, label: 'Jersey', color: '#2a2a2a' },
] as const;

export const BOTTOMS = [
  { id: 0, label: 'Shorts', color: '#1a1a1a' },
  { id: 1, label: 'Joggers', color: '#333333' },
  { id: 2, label: 'Leggings', color: '#4a4a4a' },
  { id: 3, label: 'Jeans', color: '#6e6e6e' },
] as const;

export const ACCESSORIES = [
  { id: 0, label: 'None' },
  { id: 1, label: 'Cap' },
  { id: 2, label: 'Headband' },
  { id: 3, label: 'Glasses' },
] as const;

export const DEFAULT_AVATAR: AvatarConfig = {
  bodyType: 'average',
  skinTone: 1,
  eyeColor: 0,
  hairStyle: 2,
  hairColor: 1,
  facialHair: 0,
  top: 0,
  bottom: 0,
  accessory: 0,
};

export function clampIndex(n: number, len: number): number {
  if (!Number.isFinite(n) || len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, Math.floor(n)));
}

export function normalizeAvatar(raw: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  const src = raw ?? {};
  const bodyType = BODY_TYPES.includes(src.bodyType as BodyType)
    ? (src.bodyType as BodyType)
    : DEFAULT_AVATAR.bodyType;
  return {
    bodyType,
    skinTone: clampIndex(src.skinTone ?? DEFAULT_AVATAR.skinTone, SKIN_TONES.length),
    eyeColor: clampIndex(src.eyeColor ?? DEFAULT_AVATAR.eyeColor, EYE_COLORS.length),
    hairStyle: clampIndex(src.hairStyle ?? DEFAULT_AVATAR.hairStyle, HAIR_STYLES.length),
    hairColor: clampIndex(src.hairColor ?? DEFAULT_AVATAR.hairColor, HAIR_COLORS.length),
    facialHair: clampIndex(src.facialHair ?? DEFAULT_AVATAR.facialHair, FACIAL_HAIR.length),
    top: clampIndex(src.top ?? DEFAULT_AVATAR.top, TOPS.length),
    bottom: clampIndex(src.bottom ?? DEFAULT_AVATAR.bottom, BOTTOMS.length),
    accessory: clampIndex(src.accessory ?? DEFAULT_AVATAR.accessory, ACCESSORIES.length),
  };
}

/** Body silhouette scale factors for layered View renderer. */
export function bodyMetrics(bodyType: BodyType): {
  head: number;
  torsoW: number;
  torsoH: number;
  hipW: number;
  armW: number;
  legW: number;
} {
  switch (bodyType) {
    case 'petite':
      return { head: 0.9, torsoW: 0.78, torsoH: 0.88, hipW: 0.82, armW: 0.75, legW: 0.78 };
    case 'slim':
      return { head: 0.95, torsoW: 0.82, torsoH: 1, hipW: 0.8, armW: 0.78, legW: 0.8 };
    case 'average':
      return { head: 1, torsoW: 1, torsoH: 1, hipW: 1, armW: 1, legW: 1 };
    case 'athletic':
      return { head: 1, torsoW: 1.12, torsoH: 1.02, hipW: 0.95, armW: 1.15, legW: 1.05 };
    case 'curvy':
      return { head: 1, torsoW: 0.95, torsoH: 0.98, hipW: 1.22, armW: 0.95, legW: 1.1 };
    case 'solid':
      return { head: 1.02, torsoW: 1.18, torsoH: 1.05, hipW: 1.15, armW: 1.12, legW: 1.15 };
    case 'broad':
      return { head: 1.05, torsoW: 1.28, torsoH: 1.08, hipW: 1.12, armW: 1.25, legW: 1.12 };
  }
}

/** Age in whole years from ISO date, or null. */
export function ageFromBirthday(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 10 && age <= 120 ? age : null;
}

/** Convert height/weight to metric for BMR. */
export function toMetric(opts: {
  heightCm: number | null;
  weightValue: number | null;
  units: 'kg' | 'lb';
}): { kg: number | null; cm: number | null } {
  const cm = opts.heightCm != null && opts.heightCm > 0 ? opts.heightCm : null;
  let kg: number | null = null;
  if (opts.weightValue != null && opts.weightValue > 0) {
    kg = opts.units === 'kg' ? opts.weightValue : opts.weightValue * 0.453592;
  }
  return { kg, cm };
}

/**
 * Mifflin-St Jeor BMR (kcal/day). Sex 'other' / prefer_not uses average of M/F.
 * Activity multiplier 1.375 (lightly active) for a sensible calorie default.
 */
export function suggestCalorieTarget(input: {
  sex: SexOption | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
}): number {
  const { sex, age, weightKg, heightCm } = input;
  if (weightKg == null || heightCm == null || age == null) {
    return 2200;
  }
  const bmrM = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrF = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  let bmr: number;
  if (sex === 'male') bmr = bmrM;
  else if (sex === 'female') bmr = bmrF;
  else bmr = (bmrM + bmrF) / 2;
  const tdee = bmr * 1.375;
  return Math.round(tdee / 50) * 50;
}

/** ~1.6–1.8 g/kg lean-ish default from body weight. */
export function suggestProteinTarget(weightKg: number | null): number {
  if (weightKg == null || weightKg <= 0) return 150;
  return Math.round((weightKg * 1.7) / 5) * 5;
}

/** ~33 ml/kg water, floored to 250 ml steps. */
export function suggestWaterTargetMl(weightKg: number | null): number {
  if (weightKg == null || weightKg <= 0) return 2500;
  return Math.round((weightKg * 33) / 250) * 250;
}
