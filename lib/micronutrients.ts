/**
 * The detailed nutrition day: everything the food carried, not just the three
 * big numbers.
 *
 * The honesty problem this exists to avoid. food_logs stores calories and the
 * four macros; micronutrients live on the food row and are reached through
 * food_id. So a log with no linked food — an AI estimate, something typed by
 * hand — carries none of them. Summing those as zero would report a day of
 * 2,000 calories as containing no iron, which is not a measurement, it is the
 * absence of one.
 *
 * Every total here is therefore nullable, and every total knows how much of
 * the day it could not see.
 *
 * Pure: no database.
 */

export type NutrientKey =
  | 'calories' | 'protein' | 'carb' | 'fiber' | 'sugars' | 'fat'
  | 'saturated_fat' | 'trans_fat' | 'cholesterol'
  | 'sodium' | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'zinc'
  | 'phosphorus' | 'selenium' | 'copper' | 'manganese'
  | 'vitamin_a' | 'vitamin_c' | 'vitamin_d' | 'vitamin_e' | 'vitamin_k'
  | 'thiamin' | 'riboflavin' | 'niacin' | 'vitamin_b6' | 'folate'
  | 'vitamin_b12' | 'pantothenic_acid';

export type NutrientRow = {
  key: NutrientKey;
  label: string;
  unit: string;
  /**
   * FDA Daily Value for adults, 2016 labelling update. A general reference
   * intake for a mixed adult population — not a target, not a prescription,
   * and not adjusted for the user's body or training.
   */
  dv: number;
};

export type NutrientGroup = { group: string; rows: NutrientRow[] };

/** Only nutrients the bundled USDA data actually carries. Measured, not assumed. */
export const NUTRIENT_GROUPS: NutrientGroup[] = [
  {
    group: 'ENERGY & MACROS',
    rows: [
      { key: 'calories', label: 'Calories', unit: '', dv: 2000 },
      { key: 'protein', label: 'Protein', unit: 'g', dv: 50 },
      { key: 'carb', label: 'Carbohydrate', unit: 'g', dv: 275 },
      { key: 'fiber', label: 'Fibre', unit: 'g', dv: 28 },
      { key: 'sugars', label: 'Sugars', unit: 'g', dv: 50 },
      { key: 'fat', label: 'Fat', unit: 'g', dv: 78 },
      { key: 'saturated_fat', label: 'Saturated fat', unit: 'g', dv: 20 },
      { key: 'trans_fat', label: 'Trans fat', unit: 'g', dv: 2 },
      { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', dv: 300 },
    ],
  },
  {
    group: 'MINERALS',
    rows: [
      { key: 'sodium', label: 'Sodium', unit: 'mg', dv: 2300 },
      { key: 'potassium', label: 'Potassium', unit: 'mg', dv: 4700 },
      { key: 'calcium', label: 'Calcium', unit: 'mg', dv: 1300 },
      { key: 'iron', label: 'Iron', unit: 'mg', dv: 18 },
      { key: 'magnesium', label: 'Magnesium', unit: 'mg', dv: 420 },
      { key: 'zinc', label: 'Zinc', unit: 'mg', dv: 11 },
      { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', dv: 1250 },
      { key: 'selenium', label: 'Selenium', unit: 'µg', dv: 55 },
      { key: 'copper', label: 'Copper', unit: 'mg', dv: 0.9 },
      { key: 'manganese', label: 'Manganese', unit: 'mg', dv: 2.3 },
    ],
  },
  {
    group: 'VITAMINS',
    rows: [
      { key: 'vitamin_a', label: 'Vitamin A', unit: 'µg', dv: 900 },
      { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg', dv: 90 },
      { key: 'vitamin_d', label: 'Vitamin D', unit: 'µg', dv: 20 },
      { key: 'vitamin_e', label: 'Vitamin E', unit: 'mg', dv: 15 },
      { key: 'vitamin_k', label: 'Vitamin K', unit: 'µg', dv: 120 },
      { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', dv: 1.2 },
      { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', dv: 1.3 },
      { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', dv: 16 },
      { key: 'vitamin_b6', label: 'Vitamin B6', unit: 'mg', dv: 1.7 },
      { key: 'folate', label: 'Folate', unit: 'µg', dv: 400 },
      { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'µg', dv: 2.4 },
      { key: 'pantothenic_acid', label: 'Pantothenic acid', unit: 'mg', dv: 5 },
    ],
  },
];

export const ALL_NUTRIENT_ROWS: NutrientRow[] = NUTRIENT_GROUPS.flatMap((g) => g.rows);

/** One logged item's contribution: its nutrients already scaled to what was eaten. */
export type LoggedNutrients = {
  /** Calories always exist on a log; everything else may be absent. */
  nutrients: Partial<Record<NutrientKey, number | null>>;
  /** False when the log has no food row behind it, so it carries no micros. */
  hasFoodData: boolean;
};

export type NutrientTotal = {
  key: NutrientKey;
  /** Null when no logged item carried this nutrient at all. */
  value: number | null;
  /** How many logged items contributed a figure. */
  from: number;
  /** True when some items carried it and others did not, so the total is a floor. */
  partial: boolean;
};

export type DayNutrients = {
  totals: Map<NutrientKey, NutrientTotal>;
  /** Items logged with no food behind them — AI estimates, hand-typed entries. */
  itemsWithoutData: number;
  itemCount: number;
};

/**
 * Sums a day.
 *
 * A nutrient nobody recorded stays null rather than becoming zero, and a
 * nutrient only some foods recorded is flagged as a floor. Both distinctions
 * are the difference between "you ate none" and "nobody measured".
 */
export function sumDayNutrients(items: readonly LoggedNutrients[]): DayNutrients {
  const totals = new Map<NutrientKey, NutrientTotal>();
  for (const row of ALL_NUTRIENT_ROWS) {
    totals.set(row.key, { key: row.key, value: null, from: 0, partial: false });
  }

  let itemsWithoutData = 0;
  for (const item of items) {
    if (!item.hasFoodData) itemsWithoutData += 1;
    for (const row of ALL_NUTRIENT_ROWS) {
      const v = item.nutrients[row.key];
      const t = totals.get(row.key)!;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      t.value = (t.value ?? 0) + v;
      t.from += 1;
    }
  }

  for (const t of totals.values()) {
    if (t.value != null) t.value = Math.round(t.value * 100) / 100;
    // Some items had it, others did not: the number understates the day.
    t.partial = t.from > 0 && t.from < items.length;
  }

  return { totals, itemsWithoutData, itemCount: items.length };
}

export type NutrientLevel = 'unknown' | 'low' | 'ok' | 'high';

/**
 * How a nutrient compares to its reference intake.
 *
 * 'unknown' is its own state and never renders as 0%. Below 70% reads low,
 * above 200% reads high — deliberately wide, because one day is not a diet and
 * a screen that flags everything every day is noise.
 */
export function nutrientLevel(value: number | null, dv: number): NutrientLevel {
  if (value == null || !Number.isFinite(value) || !(dv > 0)) return 'unknown';
  const pct = (value / dv) * 100;
  if (pct < 70) return 'low';
  if (pct > 200) return 'high';
  return 'ok';
}

/** Percent of the reference intake, or null when there is nothing to compare. */
export function percentOfDv(value: number | null, dv: number): number | null {
  if (value == null || !Number.isFinite(value) || !(dv > 0)) return null;
  return Math.round((value / dv) * 100);
}

/** Small numbers need a decimal; large ones do not. */
export function formatNutrient(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${n}${unit}`;
}
