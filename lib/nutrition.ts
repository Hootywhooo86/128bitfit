import type { Food } from '@/db/schema';

export type Nutrients = {
  calories: number;
  protein: number;
  fat: number;
  carb: number;
};

export type ParsedFoodNutrients = Record<string, number | null>;

export function parseNutrients(raw: string | null | undefined): ParsedFoodNutrients {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ParsedFoodNutrients;
  } catch {
    return {};
  }
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Nutrients for one "serving" of the food as stored (serving_size + unit).
 * - per_100g: scale nutrients by serving_size / 100
 * - per_serving: nutrients already apply to one serving
 */
export function nutrientsPerServing(food: Pick<Food, 'servingSize' | 'nutritionBasis' | 'nutrients'>): Nutrients {
  const n = parseNutrients(food.nutrients);
  const base: Nutrients = {
    calories: num(n.calories),
    protein: num(n.protein),
    fat: num(n.fat),
    carb: num(n.carb),
  };
  const basis = food.nutritionBasis ?? 'per_100g';
  if (basis === 'per_serving') {
    return base;
  }
  // per_100g (default): nutrients are per 100g; scale by serving size
  const size = food.servingSize && food.servingSize > 0 ? food.servingSize : 100;
  const factor = size / 100;
  return {
    calories: base.calories * factor,
    protein: base.protein * factor,
    fat: base.fat * factor,
    carb: base.carb * factor,
  };
}

/** Total nutrients for `servings` of the food (respecting nutrition_basis). */
export function nutrientsForServings(
  food: Pick<Food, 'servingSize' | 'nutritionBasis' | 'nutrients'>,
  servings: number
): Nutrients {
  const one = nutrientsPerServing(food);
  const s = Number.isFinite(servings) && servings > 0 ? servings : 0;
  return {
    calories: one.calories * s,
    protein: one.protein * s,
    fat: one.fat * s,
    carb: one.carb * s,
  };
}

export function roundNutrient(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function formatKcal(n: number): string {
  return `${Math.round(n)}`;
}

export function formatGrams(n: number): string {
  return `${roundNutrient(n, 1)}g`;
}

/** Local calendar day bounds as Date objects (start inclusive, end exclusive). */
export function dayBounds(day: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
  return { start, end };
}

export function defaultMealTypeForHour(hour: number): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

/** Display helper: never present missing nutrients as zero. */
export function formatOptionalKcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return formatKcal(n);
}

export function formatOptionalGrams(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return formatGrams(n);
}

/** True when a catalog food is missing calorie data (do not log silently as 0). */
export function isCaloriesMissing(food: Pick<Food, 'nutrients'>): boolean {
  const n = parseNutrients(food.nutrients);
  return n.calories == null || !Number.isFinite(n.calories);
}


/** Per-serving figures where a nutrient that was never recorded stays null. */
export type OptionalNutrients = {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carb: number | null;
};

/**
 * The same scaling as nutrientsPerServing, without the coercion to zero.
 *
 * nutrientsPerServing turns a missing nutrient into 0 so it can be added to a
 * day's running total. That is the wrong shape for anything that displays a
 * single food: 0 g of protein is a reading, and a food whose protein was never
 * entered has no reading. Use this where a number is shown rather than summed.
 */
export function optionalNutrientsPerServing(
  food: Pick<Food, 'servingSize' | 'nutritionBasis' | 'nutrients'>
): OptionalNutrients {
  const n = parseNutrients(food.nutrients);
  const basis = food.nutritionBasis ?? 'per_100g';
  const size = food.servingSize && food.servingSize > 0 ? food.servingSize : 100;
  const factor = basis === 'per_serving' ? 1 : size / 100;
  const scale = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v * factor : null;
  return {
    calories: scale(n.calories),
    protein: scale(n.protein),
    fat: scale(n.fat),
    carb: scale(n.carb),
  };
}

/** What a meal logged before needs to be logged again. */
export type LoggedPortion = {
  servings: number;
  calories: number;
  protein: number | null;
  fat: number | null;
  carb: number | null;
};

/**
 * A past log scaled to a new amount: `portions` 1 is exactly what was logged
 * last time, 0.5 half of it.
 *
 * Unknown stays unknown. A meal the AI could not put a fat figure on was
 * logged with none, and eating it again does not make that 0 g.
 */
export function scaleLoggedPortion(log: LoggedPortion, portions: number): LoggedPortion {
  const f = Number.isFinite(portions) && portions > 0 ? portions : 0;
  const scale = (v: number | null) => (v == null ? null : v * f);
  return {
    servings: log.servings * f,
    calories: log.calories * f,
    protein: scale(log.protein),
    fat: scale(log.fat),
    carb: scale(log.carb),
  };
}
