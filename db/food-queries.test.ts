import { describe, expect, it } from 'vitest';

/**
 * The rule these cover: null is "nobody knows", 0 is "the food has none".
 * They were the same value until the macro columns were made nullable, which
 * meant an unestimated macro read as "this meal had no fat".
 */

/** The summing lifted out of getDayFuelSummary, which needs a database. */
function sumDay(logs: { calories: number | null; protein: number | null; fat: number | null; carb: number | null }[]) {
  const totals = { calories: 0, protein: 0, fat: 0, carb: 0 };
  const partial = { protein: false, fat: false, carb: false };
  for (const log of logs) {
    totals.calories += log.calories ?? 0;
    for (const k of ['protein', 'fat', 'carb'] as const) {
      const v = log[k];
      if (v == null) partial[k] = true;
      else totals[k] += v;
    }
  }
  return { totals, partial };
}

describe('a day total with an unknown macro', () => {
  it('sums only what is known', () => {
    const { totals } = sumDay([
      { calories: 200, protein: 10, fat: 5, carb: 20 },
      { calories: 300, protein: 25, fat: null, carb: 10 },
    ]);
    expect(totals.protein).toBe(35);
    expect(totals.carb).toBe(30);
    // Not 5 + 0. The second log's fat is unknown, so it contributes nothing.
    expect(totals.fat).toBe(5);
  });

  it('flags the macro as partial so the UI can say the total is a floor', () => {
    const { partial } = sumDay([
      { calories: 200, protein: 10, fat: 5, carb: 20 },
      { calories: 300, protein: 25, fat: null, carb: 10 },
    ]);
    expect(partial.fat).toBe(true);
    expect(partial.protein).toBe(false);
    expect(partial.carb).toBe(false);
  });

  it('does not flag a macro that was genuinely zero', () => {
    // Black coffee really does have no fat. That is a figure, not a gap.
    const { totals, partial } = sumDay([{ calories: 2, protein: 0, fat: 0, carb: 0 }]);
    expect(partial.fat).toBe(false);
    expect(totals.fat).toBe(0);
  });

  it('is not partial when everything is known', () => {
    const { partial } = sumDay([{ calories: 100, protein: 1, fat: 2, carb: 3 }]);
    expect(Object.values(partial).every((v) => v === false)).toBe(true);
  });
});
