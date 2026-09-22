import { and, asc, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
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
  totals: Nutrients;
  waterMl: number;
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

export async function getDayFuelSummary(day: Date = new Date()): Promise<DayFuelSummary> {
  const goals = await ensureDefaultGoals();
  const logs = await listFoodLogsForDay(day);
  const totals: Nutrients = { calories: 0, protein: 0, fat: 0, carb: 0 };
  const byMeal: Record<MealType, FoodLogWithName[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const log of logs) {
    totals.calories += log.calories ?? 0;
    totals.protein += log.protein ?? 0;
    totals.fat += log.fat ?? 0;
    totals.carb += log.carb ?? 0;
    const mt = (log.mealType as MealType) || 'snack';
    if (byMeal[mt]) byMeal[mt].push(log);
    else byMeal.snack.push(log);
  }
  const waterMl = await getWaterTotalForDay(day);
  return { goals, totals, waterMl, logs, byMeal };
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
  protein: number;
  fat: number;
  carb: number;
  notes?: string | null;
};

export async function insertFoodLog(input: LogFoodInput): Promise<string> {
  const id = newId('fl');
  await db.insert(foodLogs).values({
    id,
    foodId: input.foodId ?? null,
    customName: input.customName ?? null,
    mealType: input.mealType,
    loggedAt: input.loggedAt ?? new Date(),
    servings: input.servings,
    servingSize: input.servingSize ?? null,
    servingUnit: input.servingUnit ?? null,
    calories: input.calories,
    protein: input.protein,
    fat: input.fat,
    carb: input.carb,
    notes: input.notes ?? null,
  });
  return id;
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
}

export async function deleteFoodLog(id: string): Promise<void> {
  await db.delete(foodLogs).where(eq(foodLogs.id, id));
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
}

export async function getTodayCalories(): Promise<number> {
  const summary = await getDayFuelSummary(new Date());
  return summary.totals.calories;
}
