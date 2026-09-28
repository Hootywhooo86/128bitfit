import { describe, expect, it } from 'vitest';
import { mondayOf, weeklyRecap, type RecapInput } from './weekly-recap';

// Local times, so these hold in every TZ the suite runs in.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
// Thursday 1 October 2026, 6pm.
const NOW = new Date(2026, 9, 1, 18);

const base = (over: Partial<RecapInput> = {}): RecapInput => ({
  now: NOW,
  workouts: [],
  sets: [],
  cardio: [],
  food: [],
  proteinTarget: 150,
  weightUnit: 'lb',
  ...over,
});

describe('weekly recap', () => {
  it('weeks start on Monday at local midnight', () => {
    expect(mondayOf(NOW)).toEqual(new Date(2026, 8, 28));
    expect(mondayOf(new Date(2026, 8, 28, 0, 5))).toEqual(new Date(2026, 8, 28));
    expect(mondayOf(new Date(2026, 9, 4, 23))).toEqual(new Date(2026, 8, 28));
  });

  it('is empty, with nothing to compare, for a new user', () => {
    const r = weeklyRecap(base());
    expect(r.thisWeek).toEqual({
      workouts: 0,
      volume: null,
      cardioSessions: 0,
      cardioM: 0,
      foodDays: 0,
      proteinDays: 0,
    });
    expect(r.lastWeek).toBeNull();
  });

  it('splits this week from last at Monday midnight', () => {
    const r = weeklyRecap(
      base({ workouts: [at(2026, 9, 27, 23), at(2026, 9, 28, 0) + 60_000, at(2026, 10, 1)] })
    );
    expect(r.thisWeek.workouts).toBe(2);
    expect(r.lastWeek?.workouts).toBe(1);
  });

  it('adds volume in the user unit, converting kg sets, skipping bodyweight', () => {
    const r = weeklyRecap(
      base({
        sets: [
          { at: at(2026, 9, 29), reps: 5, weight: 100, unit: 'lb' },
          { at: at(2026, 9, 29), reps: 10, weight: 20, unit: 'kg' },
          { at: at(2026, 9, 29), reps: 12, weight: null, unit: 'lb' },
        ],
      })
    );
    expect(r.thisWeek.volume).toBe(Math.round(500 + 200 * 2.2046226218));
  });

  it('counts protein only on days food was logged', () => {
    const r = weeklyRecap(
      base({
        food: [
          { at: at(2026, 9, 28, 8), protein: 80 },
          { at: at(2026, 9, 28, 19), protein: 80 },
          { at: at(2026, 9, 29), protein: 90 },
          { at: at(2026, 9, 30), protein: null },
        ],
      })
    );
    expect(r.thisWeek.foodDays).toBe(3);
    expect(r.thisWeek.proteinDays).toBe(1);
  });

  it('has no protein count without a target', () => {
    expect(weeklyRecap(base({ proteinTarget: 0 })).thisWeek.proteinDays).toBeNull();
  });

  it('adds cardio distance', () => {
    const r = weeklyRecap(
      base({ cardio: [{ at: at(2026, 9, 30), distanceM: 3000 }, { at: at(2026, 10, 1), distanceM: null }] })
    );
    expect(r.thisWeek).toMatchObject({ cardioSessions: 2, cardioM: 3000 });
  });
});
