/**
 * Turning a scanned recipe into one food you can log again.
 *
 * What happened before: the model returned one entry per ingredient, already
 * divided to a single serving, and every one of them was written into today as
 * a separate log line. So a chilli became eight rows in your day, the servings
 * number you typed was used once in the prompt and thrown away, and eating the
 * same meal next week meant photographing it again.
 *
 * A recipe is one food with a per-serving nutrition panel. The ingredients are
 * what it is made of, not eight things you ate.
 *
 * Pure: ingredients in, one food out.
 */

export type RecipeIngredient = {
  name: string;
  portion: string;
  calories: number;
  protein: number | null;
  fat: number | null;
  carb: number | null;
};

export type RecipeTotals = {
  calories: number;
  protein: number | null;
  fat: number | null;
  carb: number | null;
  /** Macros where at least one ingredient had no figure, so the total is a floor. */
  partial: { protein: boolean; fat: boolean; carb: boolean };
};

/**
 * Sums a serving's ingredients.
 *
 * An unknown macro is not zero. If any ingredient's protein could not be
 * estimated then the protein total is a floor, not a measurement, and the flag
 * says so — the same rule the day's totals follow. Summing null as zero would
 * quietly under-report every recipe with one unrecognised ingredient in it.
 */
export function recipeTotals(ingredients: readonly RecipeIngredient[]): RecipeTotals {
  const totals: RecipeTotals = {
    calories: 0,
    protein: null,
    fat: null,
    carb: null,
    partial: { protein: false, fat: false, carb: false },
  };

  for (const item of ingredients) {
    totals.calories += Number.isFinite(item.calories) ? item.calories : 0;
    for (const key of ['protein', 'fat', 'carb'] as const) {
      const v = item[key];
      if (v == null || !Number.isFinite(v)) {
        totals.partial[key] = true;
        continue;
      }
      totals[key] = (totals[key] ?? 0) + v;
    }
  }

  totals.calories = Math.round(totals.calories);
  for (const key of ['protein', 'fat', 'carb'] as const) {
    const v = totals[key];
    if (v != null) totals[key] = Math.round(v * 10) / 10;
  }
  return totals;
}

/**
 * The ingredient list, for the food's description.
 *
 * Kept as text rather than as rows of their own: they are what the recipe is
 * made of, and the app has no use for them individually — logging half a
 * serving does not mean logging half an onion as a separate food.
 */
export function describeIngredients(
  ingredients: readonly RecipeIngredient[],
  servings: number
): string {
  const per = servings === 1 ? 'per serving' : `per serving, makes ${servings}`;
  const lines = ingredients.map((i) => `${i.name} — ${i.portion}`);
  return [`Ingredients (${per}):`, ...lines].join('\n');
}

/** A sensible name when the model did not give the dish one. */
export function fallbackRecipeName(ingredients: readonly RecipeIngredient[]): string {
  const named = ingredients.filter((i) => i.name.trim());
  if (named.length === 0) return 'Recipe';
  if (named.length <= 2) return named.map((i) => i.name).join(' and ');
  return `${named[0].name} and ${named.length - 1} more`;
}
