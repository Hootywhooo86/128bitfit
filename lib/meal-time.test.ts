import { describe, expect, it } from 'vitest';
import { describeMealTime, mealTimestamp } from './meal-time';

/** Local time, because a meal belongs to the day you ate it in your timezone. */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

describe('logging the whole day at bedtime', () => {
  const bedtime = at(2026, 9, 23, 22, 5);

  it('files breakfast this morning, not at 10pm', () => {
    const t = mealTimestamp('breakfast', 'today', bedtime);
    expect(t.getDate()).toBe(23);
    expect(t.getHours()).toBe(8);
  });

  it('keeps the day-order of the meals you enter in one sitting', () => {
    const b = mealTimestamp('breakfast', 'today', bedtime).getTime();
    const l = mealTimestamp('lunch', 'today', bedtime).getTime();
    const d = mealTimestamp('dinner', 'today', bedtime).getTime();
    expect(b).toBeLessThan(l);
    expect(l).toBeLessThan(d);
  });

  it('leaves a snack at the time you logged it, since a snack is whenever', () => {
    const t = mealTimestamp('snack', 'today', bedtime);
    expect(t.getHours()).toBe(22);
    expect(t.getMinutes()).toBe(5);
  });
});

describe('logging after midnight', () => {
  const justAfterMidnight = at(2026, 9, 24, 0, 30);

  it('files dinner as yesterday, not nineteen hours from now', () => {
    const t = mealTimestamp('dinner', 'today', justAfterMidnight);
    expect(t.getDate()).toBe(23);
    expect(t.getHours()).toBe(19);
  });

  it('files breakfast as yesterday too, because 8am has not come round', () => {
    const t = mealTimestamp('breakfast', 'today', justAfterMidnight);
    expect(t.getDate()).toBe(23);
  });

  it('never produces a time in the future', () => {
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      const t = mealTimestamp(meal, 'today', justAfterMidnight);
      expect(t.getTime()).toBeLessThanOrEqual(justAfterMidnight.getTime());
    }
  });
});

describe('saying yesterday explicitly', () => {
  const morning = at(2026, 9, 23, 9, 0);

  it('goes back a day from the slot time', () => {
    const t = mealTimestamp('breakfast', 'yesterday', morning);
    expect(t.getDate()).toBe(22);
    expect(t.getHours()).toBe(8);
  });

  it('does not double-shift a slot that had already been pushed back', () => {
    // At 09:00, dinner today would be in the future -> yesterday. Asking for
    // yesterday on top must mean the day before, not two days back twice.
    const t = mealTimestamp('dinner', 'yesterday', morning);
    expect(t.getDate()).toBe(22);
  });

  it('shifts a snack back a day as well', () => {
    const t = mealTimestamp('snack', 'yesterday', morning);
    expect(t.getDate()).toBe(22);
    expect(t.getHours()).toBe(9);
  });
});

describe('crossing a month boundary', () => {
  it('rolls into the previous month rather than day zero', () => {
    const t = mealTimestamp('dinner', 'today', at(2026, 10, 1, 0, 15));
    expect(t.getMonth()).toBe(8); // September
    expect(t.getDate()).toBe(30);
  });
});

describe('telling the user what it chose', () => {
  const now = at(2026, 9, 23, 22, 0);

  it('says today for today', () => {
    expect(describeMealTime(at(2026, 9, 23, 8, 0), now)).toMatch(/^today /);
  });

  it('says yesterday for yesterday', () => {
    expect(describeMealTime(at(2026, 9, 22, 19, 0), now)).toMatch(/^yesterday /);
  });

  it('gives the date for anything older', () => {
    const s = describeMealTime(at(2026, 9, 20, 12, 30), now);
    expect(s).not.toMatch(/today|yesterday/);
  });
});
