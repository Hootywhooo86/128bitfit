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

describe('logging onto a day you navigated back to', () => {
  const now = at(2026, 9, 24, 21, 5);
  const sep18 = new Date(2026, 8, 18, 0, 0, 0, 0);

  it('puts the meal on that day, not on today', () => {
    const t = mealTimestamp('dinner', sep18, now);
    expect(t.getFullYear()).toBe(2026);
    expect(t.getMonth()).toBe(8);
    expect(t.getDate()).toBe(18);
    expect(t.getHours()).toBe(19);
  });

  it('keeps the slots in order on that day too', () => {
    const b = mealTimestamp('breakfast', sep18, now).getTime();
    const l = mealTimestamp('lunch', sep18, now).getTime();
    const d = mealTimestamp('dinner', sep18, now).getTime();
    expect(b).toBeLessThan(l);
    expect(l).toBeLessThan(d);
  });

  it('lands a snack on that day, at the hour you are logging it', () => {
    const t = mealTimestamp('snack', sep18, now);
    expect(t.getDate()).toBe(18);
    expect(t.getHours()).toBe(21);
    expect(t.getMinutes()).toBe(5);
  });

  it('reads only the calendar date, so the time on the Date cannot leak in', () => {
    const noon = new Date(2026, 8, 18, 12, 45, 0, 0);
    expect(mealTimestamp('dinner', noon, now).getHours()).toBe(19);
    expect(mealTimestamp('snack', noon, now).getHours()).toBe(21);
  });

  it('still refuses the future if it is handed a day that has not happened', () => {
    const tomorrow = new Date(2026, 8, 25, 0, 0, 0, 0);
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      expect(mealTimestamp(meal, tomorrow, now).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('matches the string form when handed today or yesterday as a Date', () => {
    const today = new Date(2026, 8, 24, 3, 0, 0, 0);
    const yesterday = new Date(2026, 8, 23, 3, 0, 0, 0);
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      expect(mealTimestamp(meal, today, now).getTime()).toBe(
        mealTimestamp(meal, 'today', now).getTime()
      );
      expect(mealTimestamp(meal, yesterday, now).getTime()).toBe(
        mealTimestamp(meal, 'yesterday', now).getTime()
      );
    }
  });

  it('crosses a month end without landing on day zero', () => {
    const aug31 = new Date(2026, 7, 31, 0, 0, 0, 0);
    const t = mealTimestamp('lunch', aug31, now);
    expect(t.getMonth()).toBe(7);
    expect(t.getDate()).toBe(31);
  });
});
