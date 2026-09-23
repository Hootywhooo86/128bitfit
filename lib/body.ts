/**
 * Body measurements and the energy maths derived from them.
 *
 * Split out of the old lib/avatar.ts when the pixel avatar was removed: the
 * avatar was cosmetic, but BMR, TDEE and the target suggestions underpin the
 * calorie floor and are not going anywhere.
 */

export type SexOption = 'female' | 'male' | 'other' | 'prefer_not';

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
 * Activity levels and their multipliers, as Gym Geek's maintenance calculator
 * uses them — the Harris-Benedict Standard Activity Factors.
 *
 * This used to be one hardcoded 1.375, which is "light activity". Someone
 * training six days a week was being told to eat for someone who trains twice,
 * a gap of about 600 kcal on an 1,800 kcal BMR — enough to explain a stall
 * that has nothing to do with discipline.
 */
export const ACTIVITY_LEVELS = [
  {
    id: 'sedentary',
    factor: 1.2,
    label: 'Sedentary',
    detail: 'Desk job, little or no exercise',
  },
  {
    id: 'light',
    factor: 1.375,
    label: 'Light',
    detail: 'Exercise 1–3 days a week, or a job on your feet',
  },
  {
    id: 'moderate',
    factor: 1.55,
    label: 'Moderate',
    detail: 'Exercise 3–5 days a week',
  },
  {
    id: 'very',
    factor: 1.725,
    label: 'Very active',
    detail: 'Exercise 6–7 days a week',
  },
  {
    id: 'extra',
    factor: 1.9,
    label: 'Extra active',
    detail: 'Twice a day, or hard physical work',
  },
] as const;

export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]['id'];

/** Light activity. The default, and what the single hardcoded value used to be. */
export const DEFAULT_ACTIVITY: ActivityLevel = 'light';

export function activityFactor(level: ActivityLevel | null | undefined): number {
  return ACTIVITY_LEVELS.find((l) => l.id === level)?.factor ?? 1.375;
}

/** @deprecated Kept so nothing silently changes meaning; use activityFactor. */
export const ACTIVITY_MULTIPLIER = 1.375;

export type CalorieProfile = {
  sex: SexOption | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Null falls back to light activity, which is what the app assumed before. */
  activity?: ActivityLevel | null;
};

/**
 * Mifflin-St Jeor BMR (kcal/day), or null when the profile is too incomplete
 * to compute one. Sex 'other' / 'prefer_not' uses the average of the male and
 * female equations.
 */
export function basalMetabolicRate(input: CalorieProfile): number | null {
  const { sex, age, weightKg, heightCm } = input;
  if (weightKg == null || heightCm == null || age == null) return null;
  if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;
  // 9.99, not 10: the coefficient Mifflin and St Jeor published, and the one
  // Gym Geek's calculator uses. The difference is under a kilocalorie, but
  // matching the calculator the user is checking against costs nothing.
  const bmrM = 9.99 * weightKg + 6.25 * heightCm - 4.92 * age + 5;
  const bmrF = 9.99 * weightKg + 6.25 * heightCm - 4.92 * age - 161;
  if (sex === 'male') return bmrM;
  if (sex === 'female') return bmrF;
  return (bmrM + bmrF) / 2;
}

/** Maintenance calories — BMR × activity factor — or null when BMR is unknown. */
export function totalDailyEnergy(input: CalorieProfile): number | null {
  const bmr = basalMetabolicRate(input);
  return bmr == null ? null : bmr * activityFactor(input.activity);
}

/**
 * What the user is trying to do, and what it does to the target.
 *
 * Rates are a fraction of maintenance rather than a flat number of calories,
 * because 500 kcal off is a gentle cut for a large man and a dangerous one for
 * a small woman. The calorie floor in lib/calorie-floor.ts still has the final
 * say on every one of these — non-negotiable #6 — so nothing here can produce
 * a target below BMR whatever is picked.
 */
export const GOALS = [
  { id: 'cut', label: 'Lose fat', fraction: -0.2, detail: '20% below maintenance' },
  { id: 'slow_cut', label: 'Lose slowly', fraction: -0.1, detail: '10% below maintenance' },
  { id: 'maintain', label: 'Maintain', fraction: 0, detail: 'Eat at maintenance' },
  { id: 'lean_bulk', label: 'Lean bulk', fraction: 0.1, detail: '10% above maintenance' },
  { id: 'bulk', label: 'Bulk', fraction: 0.2, detail: '20% above maintenance' },
] as const;

export type Goal = (typeof GOALS)[number]['id'];
export const DEFAULT_GOAL: Goal = 'maintain';

export function goalFraction(goal: Goal | null | undefined): number {
  return GOALS.find((g) => g.id === goal)?.fraction ?? 0;
}

/**
 * A starting target: maintenance adjusted for the goal, rounded to 50 kcal.
 *
 * Still passed through the calorie floor before it is stored — this suggests,
 * it does not decide.
 */
export function suggestCalorieTarget(input: CalorieProfile, goal?: Goal | null): number {
  const tdee = totalDailyEnergy(input);
  if (tdee == null) return 2200;
  return Math.round((tdee * (1 + goalFraction(goal))) / 50) * 50;
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
