import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_NUTRIENT_ROWS,
  formatNutrient,
  nutrientLevel,
  percentOfDv,
  sumDayNutrients,
  type LoggedNutrients,
} from './micronutrients';

const withFood = (n: Record<string, number | null>): LoggedNutrients => ({
  nutrients: n as LoggedNutrients['nutrients'],
  hasFoodData: true,
});
const noFood = (n: Record<string, number | null>): LoggedNutrients => ({
  nutrients: n as LoggedNutrients['nutrients'],
  hasFoodData: false,
});

describe('summing a day of food', () => {
  it('adds what was recorded', () => {
    const d = sumDayNutrients([withFood({ iron: 4 }), withFood({ iron: 6 })]);
    expect(d.totals.get('iron')!.value).toBe(10);
  });

  it('leaves a nutrient nobody recorded as null, never zero', () => {
    // The whole point: "you ate no iron" and "nobody measured iron" differ.
    const d = sumDayNutrients([withFood({ calories: 500 })]);
    expect(d.totals.get('iron')!.value).toBeNull();
  });

  it('flags a total as a floor when only some items carried it', () => {
    const d = sumDayNutrients([withFood({ iron: 4 }), withFood({ calories: 200 })]);
    const iron = d.totals.get('iron')!;
    expect(iron.value).toBe(4);
    expect(iron.partial).toBe(true);
    expect(iron.from).toBe(1);
  });

  it('does not flag a total every item contributed to', () => {
    const d = sumDayNutrients([withFood({ iron: 4 }), withFood({ iron: 2 })]);
    expect(d.totals.get('iron')!.partial).toBe(false);
  });

  it('counts the items that carry no food data at all', () => {
    // An AI estimate or a hand-typed meal has calories but no micronutrients.
    const d = sumDayNutrients([withFood({ iron: 4 }), noFood({ calories: 600 })]);
    expect(d.itemsWithoutData).toBe(1);
    expect(d.itemCount).toBe(2);
  });

  it('treats an explicit zero as a real reading', () => {
    const d = sumDayNutrients([withFood({ iron: 0 })]);
    expect(d.totals.get('iron')!.value).toBe(0);
    expect(d.totals.get('iron')!.from).toBe(1);
  });

  it('ignores a non-numeric value rather than poisoning the total with NaN', () => {
    const d = sumDayNutrients([
      withFood({ iron: 4 }),
      { nutrients: { iron: Number.NaN }, hasFoodData: true },
    ]);
    expect(d.totals.get('iron')!.value).toBe(4);
  });

  it('has an entry for every nutrient even on an empty day', () => {
    const d = sumDayNutrients([]);
    expect(d.totals.size).toBe(ALL_NUTRIENT_ROWS.length);
    for (const t of d.totals.values()) expect(t.value).toBeNull();
  });
});

describe('comparing against the reference intake', () => {
  it('says unknown rather than 0% when nothing was measured', () => {
    expect(nutrientLevel(null, 18)).toBe('unknown');
    expect(percentOfDv(null, 18)).toBeNull();
  });

  it('flags low below 70 percent', () => {
    expect(nutrientLevel(12.5, 18)).toBe('low');
    expect(nutrientLevel(12.7, 18)).toBe('ok');
  });

  it('flags high above 200 percent', () => {
    expect(nutrientLevel(37, 18)).toBe('high');
    expect(nutrientLevel(36, 18)).toBe('ok');
  });

  it('treats a measured zero as low, not unknown', () => {
    expect(nutrientLevel(0, 18)).toBe('low');
    expect(percentOfDv(0, 18)).toBe(0);
  });

  it('refuses to divide by a missing reference intake', () => {
    expect(nutrientLevel(5, 0)).toBe('unknown');
    expect(percentOfDv(5, 0)).toBeNull();
  });
});

describe('formatting', () => {
  it('shows a dash for nothing measured, not a zero', () => {
    expect(formatNutrient(null, 'mg')).toBe('—');
  });

  it('keeps a decimal on small numbers and drops it on large', () => {
    expect(formatNutrient(1.35, 'mg')).toBe('1.4mg');
    expect(formatNutrient(310.4, 'mg')).toBe('310mg');
  });
});

describe('the table matches the data actually shipped', () => {
  it('only lists nutrients the bundled foods carry', () => {
    const foods = JSON.parse(
      readFileSync(resolve(process.cwd(), 'assets/data/foods.json'), 'utf8')
    ) as { nutrients?: Record<string, unknown> }[];
    const present = new Set<string>();
    for (const f of foods) {
      for (const [k, v] of Object.entries(f.nutrients ?? {})) {
        if (v != null) present.add(k);
      }
    }
    // A row for a nutrient no food carries would render as a permanent dash.
    for (const row of ALL_NUTRIENT_ROWS) {
      expect(present, `${row.key} is not in the shipped food data`).toContain(row.key);
    }
  });

  it('gives every nutrient a positive reference intake', () => {
    for (const row of ALL_NUTRIENT_ROWS) expect(row.dv).toBeGreaterThan(0);
  });
});
