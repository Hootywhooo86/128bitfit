/**
 * The day's full nutrition, reached by joining logs back to the foods behind
 * them.
 *
 * food_logs stores calories and the four macros only; the other 27 nutrients
 * live on the food row. So a log with no food_id — an AI estimate, something
 * typed by hand — contributes none of them, and the screen has to say so
 * rather than quietly reporting a day as low in iron.
 */
import { and, eq, gte, lt } from 'drizzle-orm';
import { nutrientsForServings, parseNutrients } from '@/lib/nutrition';
import {
  sumDayNutrients,
  type DayNutrients,
  type LoggedNutrients,
  type NutrientKey,
} from '@/lib/micronutrients';
import { db } from './client';
import { foodLogs, foods } from './schema';

function dayBoundsFor(day: Date): { start: Date; end: Date } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Everything logged between two instants, as per-item nutrient maps.
 *
 * Scaling matters: the food row's nutrients are per 100g or per serving, and
 * the log records how many servings were eaten. nutrientsForServings already
 * owns that arithmetic for the macros; the same factor applies to the rest.
 */
async function itemsBetween(start: Date, end: Date): Promise<LoggedNutrients[]> {
  const rows = await db
    .select({
      logCalories: foodLogs.calories,
      logProtein: foodLogs.protein,
      logFat: foodLogs.fat,
      logCarb: foodLogs.carb,
      servings: foodLogs.servings,
      foodId: foodLogs.foodId,
      foodNutrients: foods.nutrients,
      servingSize: foods.servingSize,
      nutritionBasis: foods.nutritionBasis,
    })
    .from(foodLogs)
    .leftJoin(foods, eq(foodLogs.foodId, foods.id))
    .where(and(gte(foodLogs.loggedAt, start), lt(foodLogs.loggedAt, end)));

  return rows.map((r) => {
    // No food behind it: the macros on the log are all there is.
    if (!r.foodId || !r.foodNutrients) {
      return {
        hasFoodData: false,
        nutrients: {
          calories: r.logCalories,
          protein: r.logProtein,
          fat: r.logFat,
          carb: r.logCarb,
        } as Partial<Record<NutrientKey, number | null>>,
      };
    }

    const raw = parseNutrients(r.foodNutrients);
    const basis = r.nutritionBasis ?? 'per_100g';
    const size = r.servingSize && r.servingSize > 0 ? r.servingSize : 100;
    const servings = Number.isFinite(r.servings) && r.servings > 0 ? r.servings : 0;
    const factor = (basis === 'per_serving' ? 1 : size / 100) * servings;

    const scaled: Partial<Record<NutrientKey, number | null>> = {};
    for (const [k, v] of Object.entries(raw)) {
      scaled[k as NutrientKey] =
        typeof v === 'number' && Number.isFinite(v) ? v * factor : null;
    }

    // The macros the user may have edited on the log win over the food's,
    // because an edited portion is a correction to what the catalogue said.
    const macros = nutrientsForServings(
      { servingSize: r.servingSize, nutritionBasis: r.nutritionBasis, nutrients: r.foodNutrients },
      servings
    );
    scaled.calories = r.logCalories ?? macros.calories;
    if (r.logProtein != null) scaled.protein = r.logProtein;
    if (r.logFat != null) scaled.fat = r.logFat;
    if (r.logCarb != null) scaled.carb = r.logCarb;

    return { hasFoodData: true, nutrients: scaled };
  });
}

/** One day's full nutrient breakdown. */
export async function getDayNutrition(day: Date = new Date()): Promise<DayNutrients> {
  const { start, end } = dayBoundsFor(day);
  return sumDayNutrients(await itemsBetween(start, end));
}

export type AveragedNutrition = DayNutrients & {
  /** Days in the window that had any food logged at all. */
  daysWithFood: number;
  days: number;
};

/**
 * An average over the last N days, divided by the days you actually logged.
 *
 * Dividing by the whole window would report someone who logged three days out
 * of seven as eating a third of what they ate. A day with nothing logged is a
 * day with no data, not a day of fasting.
 */
export async function getAverageNutrition(days: number): Promise<AveragedNutrition> {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const perDay: DayNutrients[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const bounds = dayBoundsFor(d);
    const items = await itemsBetween(bounds.start, bounds.end);
    if (items.length > 0) perDay.push(sumDayNutrients(items));
  }

  const daysWithFood = perDay.length;
  const combined = sumDayNutrients(
    perDay.flatMap((d) =>
      [...d.totals.values()].map((t) => ({
        hasFoodData: true,
        nutrients: { [t.key]: t.value } as Partial<Record<NutrientKey, number | null>>,
      }))
    )
  );

  if (daysWithFood > 0) {
    for (const t of combined.totals.values()) {
      if (t.value != null) t.value = Math.round((t.value / daysWithFood) * 100) / 100;
    }
  }

  return {
    ...combined,
    itemsWithoutData: perDay.reduce((n, d) => n + d.itemsWithoutData, 0),
    itemCount: perDay.reduce((n, d) => n + d.itemCount, 0),
    daysWithFood,
    days,
  };
}
