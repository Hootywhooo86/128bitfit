/**
 * Calorie floors, enforced in code.
 *
 * CLAUDE.md, non-negotiable #6: "Targets never drop below the higher of the
 * user's BMR or the standard minimum, whatever rate they pick. Deficit capped
 * at 25% of TDEE. No user setting overrides this."
 *
 * So the floor is the highest of three bounds, using whichever can be computed:
 *
 *   1. an absolute minimum that applies even with no body data at all
 *   2. the user's BMR — never eat below what the body burns at rest
 *   3. 75% of TDEE — the 25% deficit cap
 *
 * Note that when TDEE is known, bound 3 always dominates bound 2: TDEE is
 * BMR x 1.375, so 75% of it is ~1.03 x BMR. Both are kept explicit anyway, so
 * the rule still holds if the activity multiplier ever changes.
 *
 * This module is pure. The enforcement point is updateAppSettings() in
 * db/settings-queries.ts, which every screen goes through — clamping in a
 * screen would leave the other screens as a way around it.
 */
import { basalMetabolicRate, totalDailyEnergy, type CalorieProfile, type SexOption } from './body';

/**
 * The widely cited absolute daily minimums. Applied when body data is missing,
 * and as a lower bound when it is present.
 *
 * Unknown or undisclosed sex uses the lower figure: the BMR and TDEE bounds
 * already scale the floor to the individual whenever we know enough to compute
 * them, and 1200 is the conventional absolute floor.
 */
export const ABSOLUTE_MINIMUM_KCAL: Record<'female' | 'male' | 'unknown', number> = {
  female: 1200,
  male: 1500,
  unknown: 1200,
};

/** The share of TDEE a target may not fall below — a 25% deficit cap. */
export const MAX_DEFICIT_FRACTION = 0.25;

export type FloorReason = 'absolute_minimum' | 'bmr' | 'deficit_cap';

export type CalorieFloor = {
  /** Lowest target that may be stored, in kcal. */
  floor: number;
  /** Which bound is binding — drives the explanation shown to the user. */
  reason: FloorReason;
  bmr: number | null;
  tdee: number | null;
};

function absoluteMinimumFor(sex: SexOption | null): number {
  if (sex === 'female') return ABSOLUTE_MINIMUM_KCAL.female;
  if (sex === 'male') return ABSOLUTE_MINIMUM_KCAL.male;
  return ABSOLUTE_MINIMUM_KCAL.unknown;
}

export function calorieFloor(profile: CalorieProfile): CalorieFloor {
  const bmr = basalMetabolicRate(profile);
  const tdee = totalDailyEnergy(profile);

  let floor = absoluteMinimumFor(profile.sex);
  let reason: FloorReason = 'absolute_minimum';

  if (bmr != null && bmr > floor) {
    floor = bmr;
    reason = 'bmr';
  }
  if (tdee != null) {
    const deficitFloor = tdee * (1 - MAX_DEFICIT_FRACTION);
    if (deficitFloor > floor) {
      floor = deficitFloor;
      reason = 'deficit_cap';
    }
  }

  return { floor: Math.ceil(floor), reason, bmr, tdee };
}

export type ClampedTarget = {
  /** The value to store. */
  value: number;
  /** True when the request was raised to meet the floor. */
  clamped: boolean;
  /** What was asked for, after rounding — for an honest message. */
  requested: number;
  floor: number;
  reason: FloorReason;
};

/**
 * Brings a requested target up to the floor. Never lowers a target: a user
 * eating more than the floor is not this function's business.
 *
 * A non-finite or non-positive request is treated as a request for the floor
 * rather than an error, so a mistyped field cannot write a target of 0.
 */
export function clampCalorieTarget(
  requested: number,
  profile: CalorieProfile
): ClampedTarget {
  const { floor, reason } = calorieFloor(profile);
  const asked =
    Number.isFinite(requested) && requested > 0 ? Math.round(requested) : 0;

  if (asked >= floor) {
    return { value: asked, clamped: false, requested: asked, floor, reason };
  }
  return { value: floor, clamped: true, requested: asked, floor, reason };
}

/** One honest sentence for the UI when a target was raised. */
export function explainFloor(result: ClampedTarget): string {
  const base = `Target raised to ${result.floor} kcal.`;
  switch (result.reason) {
    case 'deficit_cap':
      return `${base} A deficit deeper than ${Math.round(
        MAX_DEFICIT_FRACTION * 100
      )}% of your maintenance calories is not supported.`;
    case 'bmr':
      return `${base} That is your estimated resting metabolic rate — targets below it are not supported.`;
    default:
      return `${base} This is the minimum daily intake the app will store.`;
  }
}
