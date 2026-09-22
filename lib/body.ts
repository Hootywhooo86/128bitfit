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

/** Lightly active. The one place this multiplier is defined. */
export const ACTIVITY_MULTIPLIER = 1.375;

export type CalorieProfile = {
  sex: SexOption | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
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
  const bmrM = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrF = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  if (sex === 'male') return bmrM;
  if (sex === 'female') return bmrF;
  return (bmrM + bmrF) / 2;
}

/** Maintenance calories, or null when BMR is unknown. */
export function totalDailyEnergy(input: CalorieProfile): number | null {
  const bmr = basalMetabolicRate(input);
  return bmr == null ? null : bmr * ACTIVITY_MULTIPLIER;
}

/** A sensible starting target: maintenance, rounded to 50 kcal. */
export function suggestCalorieTarget(input: CalorieProfile): number {
  const tdee = totalDailyEnergy(input);
  if (tdee == null) return 2200;
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
