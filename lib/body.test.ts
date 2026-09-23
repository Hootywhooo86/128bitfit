import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_LEVELS,
  activityFactor,
  basalMetabolicRate,
  GOALS,
  goalFraction,
  suggestCalorieTarget,
  totalDailyEnergy,
} from './body';

/** A worked example to check against Gym Geek's calculator by hand. */
const man = {
  sex: 'male' as const,
  age: 35,
  weightKg: 80,
  heightCm: 180,
  activity: null,
};

describe('BMR', () => {
  it('matches Mifflin-St Jeor as Gym Geek states it', () => {
    // 9.99×80 + 6.25×180 − 4.92×35 + 5 = 799.2 + 1125 − 172.2 + 5 = 1757
    expect(Math.round(basalMetabolicRate(man)!)).toBe(1757);
  });

  it('uses the female equation for women', () => {
    // Same numbers, −161 instead of +5: 1757 − 166 = 1591
    expect(Math.round(basalMetabolicRate({ ...man, sex: 'female' })!)).toBe(1591);
  });

  it('averages the two when sex is not stated', () => {
    const avg = (basalMetabolicRate({ ...man, sex: 'male' })! +
      basalMetabolicRate({ ...man, sex: 'female' })!) / 2;
    expect(basalMetabolicRate({ ...man, sex: 'prefer_not' })).toBeCloseTo(avg, 6);
    expect(basalMetabolicRate({ ...man, sex: null })).toBeCloseTo(avg, 6);
  });

  it('has no answer from an incomplete profile, rather than a made-up one', () => {
    expect(basalMetabolicRate({ ...man, weightKg: null })).toBeNull();
    expect(basalMetabolicRate({ ...man, heightCm: null })).toBeNull();
    expect(basalMetabolicRate({ ...man, age: null })).toBeNull();
    expect(basalMetabolicRate({ ...man, weightKg: 0 })).toBeNull();
  });
});

describe('activity levels', () => {
  it('carries the Harris-Benedict factors Gym Geek uses', () => {
    expect(ACTIVITY_LEVELS.map((l) => l.factor)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
  });

  it('falls back to light activity for an unknown or missing level', () => {
    // What the app assumed before there was a setting, so nobody's target
    // moves just because the field is empty.
    expect(activityFactor(null)).toBe(1.375);
    expect(activityFactor(undefined)).toBe(1.375);
  });

  it('changes maintenance by a figure that actually matters', () => {
    const sedentary = totalDailyEnergy({ ...man, activity: 'sedentary' })!;
    const extra = totalDailyEnergy({ ...man, activity: 'extra' })!;
    // Derived from the BMR rather than a number typed in here, or the test is
    // asserting my arithmetic instead of the code's.
    expect(sedentary).toBeCloseTo(basalMetabolicRate(man)! * 1.2, 6);
    // Roughly 1,230 kcal between the ends of the scale — the reason one
    // hardcoded multiplier was wrong for most people.
    expect(extra - sedentary).toBeGreaterThan(1000);
  });
});

describe('goals', () => {
  it('adjusts by a fraction of maintenance, not a flat number', () => {
    // 500 kcal off is a gentle cut for a large man and a dangerous one for a
    // small woman. The test has to check the *proportion*: comparing the two
    // targets only shows the bigger person eats more, which a flat subtraction
    // would satisfy just as well.
    const small = { sex: 'female' as const, age: 30, weightKg: 52, heightCm: 158, activity: 'moderate' as const };
    const big = { ...man, activity: 'moderate' as const };

    for (const who of [big, small]) {
      const maintenance = totalDailyEnergy(who)!;
      const cut = suggestCalorieTarget(who, 'cut');
      // 20% below maintenance for both, within the 50 kcal rounding.
      expect((maintenance - cut) / maintenance).toBeCloseTo(0.2, 1);
    }

    // And the cut itself is a different number of calories for each of them.
    const bigCut = totalDailyEnergy(big)! - suggestCalorieTarget(big, 'cut');
    const smallCut = totalDailyEnergy(small)! - suggestCalorieTarget(small, 'cut');
    expect(bigCut).toBeGreaterThan(smallCut + 50);
  });

  it('maintains when no goal is given', () => {
    expect(goalFraction(null)).toBe(0);
    expect(goalFraction(undefined)).toBe(0);
    expect(suggestCalorieTarget({ ...man, activity: 'moderate' })).toBe(
      suggestCalorieTarget({ ...man, activity: 'moderate' }, 'maintain')
    );
  });

  it('offers a bulk as well as a cut', () => {
    const ids = GOALS.map((g) => g.id);
    expect(ids).toContain('cut');
    expect(ids).toContain('bulk');
    expect(goalFraction('bulk')).toBeGreaterThan(0);
    expect(goalFraction('cut')).toBeLessThan(0);
  });

  it('rounds to 50 kcal, so the number looks like a target and not a readout', () => {
    for (const goal of GOALS.map((g) => g.id)) {
      expect(suggestCalorieTarget({ ...man, activity: 'moderate' }, goal) % 50).toBe(0);
    }
  });

  it('falls back to a usable number when the profile is empty', () => {
    expect(suggestCalorieTarget({ sex: null, age: null, weightKg: null, heightCm: null }, 'cut')).toBe(
      2200
    );
  });
});
