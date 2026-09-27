import { and, asc, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { drinkFluid } from '@/lib/drink-fluid';
import {
  foodLogs,
  foods,
  settings,
  waterLogs,
  type Food,
  type FoodLog,
  type MealType,
  type WaterLog,
} from './schema';
import { dayBounds, nutrientsForServings, type Nutrients } from '@/lib/nutrition';
import { dayKey } from '@/lib/fuel-day';
import {
  mirrorMeal,
  mirrorMealRemoved,
  mirrorWater,
  mirrorWaterRemoved,
} from '@/lib/health/mirror';

export const DEFAULT_GOALS = {
  calorie_target: 2200,
  protein_target: 150,
  fat_target: 70,
  carb_target: 220,
  water_target_ml: 2500,
} as const;

export type DailyGoals = {
  calorieTarget: number;
  proteinTarget: number;
  fatTarget: number;
  carbTarget: number;
  waterTargetMl: number;
};

export type FoodLogWithName = FoodLog & { displayName: string; photoUri: string | null };

export type DayFuelSummary = {
  goals: DailyGoals;
  /** Sum of what is known. See `partial`. */
  totals: Nutrients;
  /**
   * True where at least one of the day's logs has an unknown value for that
   * macro, so the total is a floor rather than a figure. The UI marks it.
   */
  partial: { protein: boolean; fat: boolean; carb: boolean };
  /** Everything drunk: water logged on its own plus drinks with a stated volume. */
  waterMl: number;
  /** Water logged on its own — the part the +/- buttons change. */
  waterLoggedMl: number;
  /** Fluid from drinks logged as food, worked out from their servings. */
  drinkMl: number;
  /** Drinks logged by weight or with no serving, so not counted. Their names. */
  unmeasuredDrinks: string[];
  logs: FoodLogWithName[];
  byMeal: Record<MealType, FoodLogWithName[]>;
};

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

function parseIntSetting(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function getDailyGoals(): Promise<DailyGoals> {
  const [cal, pro, fat, carb, water] = await Promise.all([
    getSetting('calorie_target'),
    getSetting('protein_target'),
    getSetting('fat_target'),
    getSetting('carb_target'),
    getSetting('water_target_ml'),
  ]);
  return {
    calorieTarget: parseIntSetting(cal, DEFAULT_GOALS.calorie_target),
    proteinTarget: parseIntSetting(pro, DEFAULT_GOALS.protein_target),
    fatTarget: parseIntSetting(fat, DEFAULT_GOALS.fat_target),
    carbTarget: parseIntSetting(carb, DEFAULT_GOALS.carb_target),
    waterTargetMl: parseIntSetting(water, DEFAULT_GOALS.water_target_ml),
  };
}

export async function ensureDefaultGoals(): Promise<DailyGoals> {
  const goals = await getDailyGoals();
  // Persist defaults if missing so settings exist for future UI
  const existing = await Promise.all([
    getSetting('calorie_target'),
    getSetting('protein_target'),
    getSetting('water_target_ml'),
  ]);
  if (existing[0] == null) await setSetting('calorie_target', String(DEFAULT_GOALS.calorie_target));
  if (existing[1] == null) await setSetting('protein_target', String(DEFAULT_GOALS.protein_target));
  if (existing[2] == null) await setSetting('water_target_ml', String(DEFAULT_GOALS.water_target_ml));
  return goals;
}

export async function searchFoods(query: string, limit = 40): Promise<Food[]> {
  const q = query.trim();
  if (!q) return [];
  return db
    .select()
    .from(foods)
    .where(like(foods.name, `%${q}%`))
    .orderBy(asc(foods.name))
    .limit(limit);
}

export async function getFoodById(id: string): Promise<Food | null> {
  const rows = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listFoodLogsForDay(day: Date = new Date()): Promise<FoodLogWithName[]> {
  const { start, end } = dayBounds(day);
  const rows = await db
    .select({
      id: foodLogs.id,
      foodId: foodLogs.foodId,
      customName: foodLogs.customName,
      mealType: foodLogs.mealType,
      loggedAt: foodLogs.loggedAt,
      servings: foodLogs.servings,
      servingSize: foodLogs.servingSize,
      servingUnit: foodLogs.servingUnit,
      calories: foodLogs.calories,
      protein: foodLogs.protein,
      fat: foodLogs.fat,
      carb: foodLogs.carb,
      notes: foodLogs.notes,
      foodName: foods.name,
      photoUri: foods.photoUri,
    })
    .from(foodLogs)
    .leftJoin(foods, eq(foodLogs.foodId, foods.id))
    .where(and(gte(foodLogs.loggedAt, start), lt(foodLogs.loggedAt, end)))
    .orderBy(asc(foodLogs.loggedAt));

  return rows.map((r) => ({
    id: r.id,
    foodId: r.foodId,
    customName: r.customName,
    mealType: r.mealType,
    loggedAt: r.loggedAt,
    servings: r.servings,
    servingSize: r.servingSize,
    servingUnit: r.servingUnit,
    calories: r.calories,
    protein: r.protein,
    fat: r.fat,
    carb: r.carb,
    notes: r.notes,
    displayName: r.customName || r.foodName || 'Food',
    photoUri: r.photoUri ?? null,
  }));
}

/** One day in the history strip: what it cost and whether anything is there. */
export type DayTotal = {
  /** Local `YYYY-MM-DD`, matching lib/fuel-day's dayKey. */
  key: string;
  calories: number;
  items: number;
};

/**
 * Calories per day across a range, for the day strip.
 *
 * One query for the whole window rather than thirty — a strip that fires a
 * round trip per chip would stutter on the first paint of Fuel.
 *
 * Bucketed in JS, not SQL. The rows hold an instant; which calendar day that
 * instant falls in is a question about the phone's timezone, and SQLite would
 * have to be told the offset for every day in the window to answer it — which
 * it would then get wrong on the days either side of a DST change.
 *
 * A day with no logs is absent from the map, not present with 0. The strip has
 * to be able to tell "ate nothing recorded" from "logged nothing".
 */
export async function listDayTotals(days: Date[]): Promise<Map<string, DayTotal>> {
  const totals = new Map<string, DayTotal>();
  if (days.length === 0) return totals;

  const sorted = [...days].sort((a, b) => a.getTime() - b.getTime());
  const { start } = dayBounds(sorted[0]);
  const { end } = dayBounds(sorted[sorted.length - 1]);

  const rows = await db
    .select({ loggedAt: foodLogs.loggedAt, calories: foodLogs.calories })
    .from(foodLogs)
    .where(and(gte(foodLogs.loggedAt, start), lt(foodLogs.loggedAt, end)));

  for (const row of rows) {
    // dayKey, not a local copy of it: the strip looks these up by the key it
    // computes itself, and two spellings of "which day is this" would show a
    // day's food under the chip next to it.
    const key = dayKey(row.loggedAt);
    const existing = totals.get(key) ?? { key, calories: 0, items: 0 };
    existing.calories += row.calories ?? 0;
    existing.items += 1;
    totals.set(key, existing);
  }
  return totals;
}

export async function getDayFuelSummary(day: Date = new Date()): Promise<DayFuelSummary> {
  const goals = await ensureDefaultGoals();
  const logs = await listFoodLogsForDay(day);
  const totals: Nutrients = { calories: 0, protein: 0, fat: 0, carb: 0 };
  // A day's total is only the sum of what is known. If any log has an unknown
  // macro the total is a floor, not a figure, and the UI has to be able to say
  // so rather than presenting it as complete.
  const partial = { protein: false, fat: false, carb: false };
  const byMeal: Record<MealType, FoodLogWithName[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const log of logs) {
    totals.calories += log.calories ?? 0;
    for (const k of ['protein', 'fat', 'carb'] as const) {
      const v = log[k];
      if (v == null) partial[k] = true;
      else totals[k] += v;
    }
    const mt = (log.mealType as MealType) || 'snack';
    if (byMeal[mt]) byMeal[mt].push(log);
    else byMeal.snack.push(log);
  }
  let drinkMl = 0;
  const unmeasuredDrinks: string[] = [];
  for (const log of logs) {
    const fluid = drinkFluid({
      name: log.displayName,
      servingSize: log.servingSize,
      servingUnit: log.servingUnit,
      servings: log.servings,
    });
    if (fluid.status === 'counted') drinkMl += fluid.ml;
    else if (fluid.status === 'unmeasured') unmeasuredDrinks.push(log.displayName);
  }
  const waterLoggedMl = Math.max(0, await getWaterTotalForDay(day));
  return {
    goals,
    totals,
    partial,
    waterMl: waterLoggedMl + drinkMl,
    waterLoggedMl,
    drinkMl,
    unmeasuredDrinks,
    logs,
    byMeal,
  };
}

export type LogFoodInput = {
  foodId?: string | null;
  customName?: string | null;
  mealType: MealType;
  loggedAt?: Date;
  servings: number;
  servingSize?: number | null;
  servingUnit?: string | null;
  calories: number;
  /** null means unknown. 0 means the food genuinely has none of it. */
  protein: number | null;
  fat: number | null;
  carb: number | null;
  notes?: string | null;
};

export async function insertFoodLog(input: LogFoodInput): Promise<string> {
  const id = newId('fl');
  const loggedAt = input.loggedAt ?? new Date();

  await db.insert(foodLogs).values({
    id,
    foodId: input.foodId ?? null,
    customName: input.customName ?? null,
    mealType: input.mealType,
    loggedAt,
    servings: input.servings,
    servingSize: input.servingSize ?? null,
    servingUnit: input.servingUnit ?? null,
    calories: input.calories,
    protein: input.protein,
    fat: input.fat,
    carb: input.carb,
    notes: input.notes ?? null,
  });

  // The local row is committed; the phone's health store gets a copy in the
  // background. Every food path goes through this function, so none of them can
  // forget. See lib/health/mirror.ts.
  //
  // Off the caller's path, because naming the entry needs a lookup and the log
  // is already saved — the screen should not wait on a copy.
  void (async () => {
    try {
      mirrorMeal({
        id,
        loggedAt: loggedAt.getTime(),
        name: await displayNameForLog(input),
        mealType: input.mealType,
        calories: input.calories,
        protein: input.protein,
        fat: input.fat,
        carb: input.carb,
      });
    } catch {
      // Already stored locally; a name we could not look up is not a lost meal.
    }
  })();

  // Log fluid volume for drinks (e.g., water, coffee, juice, soda)

  return id;
}

/**
 * What to call this entry in the phone's health app.
 *
 * "Food" is the last resort, not the first: an entry the user cannot recognise
 * in Health Connect is nearly as bad as no entry at all.
 */
async function displayNameForLog(input: {
  customName?: string | null;
  foodId?: string | null;
}): Promise<string> {
  if (input.customName) return input.customName;
  if (input.foodId) {
    const food = await getFoodById(input.foodId);
    if (food?.name) return food.name;
  }
  return 'Food';
}

export async function logFoodFromCatalog(
  food: Food,
  opts: { servings: number; mealType: MealType; loggedAt?: Date; notes?: string | null }
): Promise<string> {
  const macros = nutrientsForServings(food, opts.servings);
  return insertFoodLog({
    foodId: food.id,
    customName: null,
    mealType: opts.mealType,
    loggedAt: opts.loggedAt,
    servings: opts.servings,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    calories: macros.calories,
    protein: macros.protein,
    fat: macros.fat,
    carb: macros.carb,
    notes: opts.notes ?? null,
  });
}

export async function updateFoodLog(
  id: string,
  patch: Partial<
    Pick<
      FoodLog,
      | 'mealType'
      | 'servings'
      | 'servingSize'
      | 'servingUnit'
      | 'calories'
      | 'protein'
      | 'fat'
      | 'carb'
      | 'notes'
      | 'customName'
      | 'loggedAt'
    >
  >
): Promise<void> {
  await db.update(foodLogs).set(patch).where(eq(foodLogs.id, id));

  // Re-push rather than patch: the client id is the local row id, so Health
  // Connect replaces its copy instead of ending up with two.
  void (async () => {
    try {
      const row = await getFoodLogById(id);
      if (!row?.loggedAt) return;
      mirrorMeal({
        id: row.id,
        loggedAt: new Date(row.loggedAt).getTime(),
        name: await displayNameForLog({
          customName: row.customName,
          foodId: row.foodId,
        }),
        mealType: row.mealType,
        calories: row.calories,
        protein: row.protein,
        fat: row.fat,
        carb: row.carb,
      });
    } catch {
      // The edit is saved; only the copy in Health Connect is stale.
    }
  })();
}

export async function deleteFoodLog(id: string): Promise<void> {
  await db.delete(foodLogs).where(eq(foodLogs.id, id));
  // A meal the user took back should not stay in their health store, skewing
  // whatever else reads it.
  mirrorMealRemoved(id);
}

export async function getFoodLogById(id: string): Promise<FoodLog | null> {
  const rows = await db.select().from(foodLogs).where(eq(foodLogs.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Distinct recently logged foods (by food_id or custom_name), newest first. */
export async function listRecentFoods(limit = 20): Promise<
  { key: string; foodId: string | null; name: string; calories: number; servings: number; servingUnit: string | null }[]
> {
  const rows = await db
    .select({
      foodId: foodLogs.foodId,
      customName: foodLogs.customName,
      calories: foodLogs.calories,
      servings: foodLogs.servings,
      servingUnit: foodLogs.servingUnit,
      loggedAt: foodLogs.loggedAt,
      foodName: foods.name,
    })
    .from(foodLogs)
    .leftJoin(foods, eq(foodLogs.foodId, foods.id))
    .orderBy(desc(foodLogs.loggedAt))
    .limit(200);

  const seen = new Set<string>();
  const out: {
    key: string;
    foodId: string | null;
    name: string;
    calories: number;
    servings: number;
    servingUnit: string | null;
  }[] = [];

  for (const r of rows) {
    const name = r.customName || r.foodName || 'Food';
    const key = r.foodId ? `id:${r.foodId}` : `custom:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      foodId: r.foodId,
      name,
      calories: r.calories ?? 0,
      servings: r.servings ?? 1,
      servingUnit: r.servingUnit,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getWaterTotalForDay(day: Date = new Date()): Promise<number> {
  const { start, end } = dayBounds(day);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${waterLogs.ml}), 0)` })
    .from(waterLogs)
    .where(and(gte(waterLogs.loggedAt, start), lt(waterLogs.loggedAt, end)));
  return Number(row?.total ?? 0);
}

export async function addWater(ml: number, loggedAt: Date = new Date()): Promise<string> {
  const id = newId('wl');
  await db.insert(waterLogs).values({ id, ml, loggedAt });
  // Negative amounts are how the UI undoes a tap; there is nothing to mirror.
  if (ml > 0) mirrorWater(id, loggedAt.getTime(), ml);
  return id;
}

export async function listWaterLogsForDay(day: Date = new Date()): Promise<WaterLog[]> {
  const { start, end } = dayBounds(day);
  return db
    .select()
    .from(waterLogs)
    .where(and(gte(waterLogs.loggedAt, start), lt(waterLogs.loggedAt, end)))
    .orderBy(desc(waterLogs.loggedAt));
}

export async function deleteWaterLog(id: string): Promise<void> {
  await db.delete(waterLogs).where(eq(waterLogs.id, id));
  mirrorWaterRemoved(id);
}

export async function getTodayCalories(): Promise<number> {
  const summary = await getDayFuelSummary(new Date());
  return summary.totals.calories;
}
