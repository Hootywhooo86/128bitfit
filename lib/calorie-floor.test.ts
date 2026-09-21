import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_MINIMUM_KCAL,
  MAX_DEFICIT_FRACTION,
  calorieFloor,
  clampCalorieTarget,
  explainFloor,
} from './calorie-floor';
import type { CalorieProfile } from './avatar';

/**
 * CLAUDE.md non-negotiable #6. This is a safety rail, not a feature: the tests
 * that matter most are the ones asserting a dangerous target cannot be stored.
 */

const noProfile: CalorieProfile = { sex: null, age: null, weightKg: null, heightCm: null };
const woman: CalorieProfile = { sex: 'female', age: 30, weightKg: 65, heightCm: 165 };
const man: CalorieProfile = { sex: 'male', age: 30, weightKg: 85, heightCm: 180 };
const older: CalorieProfile = { sex: 'female', age: 70, weightKg: 45, heightCm: 150 };
const undisclosed: CalorieProfile = { ...woman, sex: 'prefer_not' };

describe('refusing dangerous targets', () => {
  it.each([
    ['a severe deficit', 800],
    ['zero', 0],
    ['a negative number', -500],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('raises %s to the floor', (_label, requested) => {
    const result = clampCalorieTarget(requested, woman);
    expect(result.clamped).toBe(true);
    expect(result.value).toBeGreaterThanOrEqual(ABSOLUTE_MINIMUM_KCAL.female);
  });

  it('never stores a zero or negative target', () => {
    for (const bad of [0, -1, -9999, Number.NaN]) {
      expect(clampCalorieTarget(bad, woman).value).toBeGreaterThan(0);
      expect(clampCalorieTarget(bad, noProfile).value).toBeGreaterThan(0);
    }
  });
});

describe('the floor with no body data', () => {
  it('still applies an absolute minimum', () => {
    expect(calorieFloor(noProfile).reason).toBe('absolute_minimum');
    expect(calorieFloor(noProfile).floor).toBe(ABSOLUTE_MINIMUM_KCAL.unknown);
  });

  it('uses the male minimum for a male profile', () => {
    expect(calorieFloor({ ...noProfile, sex: 'male' }).floor).toBe(ABSOLUTE_MINIMUM_KCAL.male);
  });

  it('treats undisclosed sex as the lower minimum', () => {
    expect(calorieFloor({ ...noProfile, sex: 'prefer_not' }).floor).toBe(
      ABSOLUTE_MINIMUM_KCAL.unknown
    );
  });
});

describe('the 25% deficit cap', () => {
  it.each([
    ['woman', woman],
    ['man', man],
    ['undisclosed sex', undisclosed],
  ])('binds above BMR for %s once TDEE is known', (_label, profile) => {
    const f = calorieFloor(profile);
    expect(f.reason).toBe('deficit_cap');
    expect(f.tdee).not.toBeNull();
    // The floor is the ceiling of the cap, so it sits in [cap, cap + 1).
    const cap = f.tdee! * (1 - MAX_DEFICIT_FRACTION);
    expect(f.floor).toBeGreaterThanOrEqual(cap);
    expect(f.floor).toBeLessThan(cap + 1);
    expect(f.floor).toBeGreaterThan(f.bmr!);
  });
});

describe('floor invariants', () => {
  it.each([
    ['woman', woman],
    ['man', man],
    ['older, smaller', older],
    ['no profile', noProfile],
  ])('%s: floor is a whole number at or above every bound', (_label, profile) => {
    const f = calorieFloor(profile);
    expect(Number.isInteger(f.floor)).toBe(true);
    if (f.bmr != null) expect(f.floor).toBeGreaterThanOrEqual(f.bmr);
    if (f.tdee != null) {
      expect(f.floor).toBeGreaterThanOrEqual(f.tdee * (1 - MAX_DEFICIT_FRACTION) - 1);
    }
    const minimum =
      profile.sex === 'male' ? ABSOLUTE_MINIMUM_KCAL.male : ABSOLUTE_MINIMUM_KCAL.unknown;
    expect(f.floor).toBeGreaterThanOrEqual(minimum);
  });
});

describe('not interfering above the floor', () => {
  it('passes a high target through untouched', () => {
    const result = clampCalorieTarget(3000, woman);
    expect(result.clamped).toBe(false);
    expect(result.value).toBe(3000);
  });

  it('allows a target exactly at the floor but not one below it', () => {
    const floor = calorieFloor(woman).floor;
    expect(clampCalorieTarget(floor, woman).clamped).toBe(false);
    expect(clampCalorieTarget(floor - 1, woman).clamped).toBe(true);
  });

  it('rounds a fractional request rather than rejecting it', () => {
    expect(clampCalorieTarget(2000.6, woman).value).toBe(2001);
  });
});

describe('explaining the adjustment', () => {
  it('reports what was actually asked for', () => {
    expect(clampCalorieTarget(800, woman).requested).toBe(800);
  });

  it('names the floor and cites the deficit rule', () => {
    const result = clampCalorieTarget(800, woman);
    const message = explainFloor(result);
    expect(message).toContain(String(result.floor));
    expect(message).toContain('25%');
  });

  it('explains the absolute minimum when no body data exists', () => {
    const message = explainFloor(clampCalorieTarget(900, noProfile));
    expect(message).toContain(String(ABSOLUTE_MINIMUM_KCAL.unknown));
  });
});
