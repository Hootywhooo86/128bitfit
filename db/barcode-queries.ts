import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  fetchOpenFoodFactsProduct,
  normalizeBarcode,
  type NormalizedOffFood,
} from '@/lib/open-food-facts';
import { db } from './client';
import { newId } from './id';
import { foods, offFoodCache, type Food } from './schema';

/** Bundled USDA / FoodData Central sources (local-first barcode tier). */
const USDA_SOURCES = ['foundation', 'sr_legacy', 'survey', 'branded'] as const;

export type BarcodeLookupSource = 'usda' | 'off_cache' | 'open_food_facts' | 'miss';

export type BarcodeLookupHit = {
  status: 'hit';
  source: Exclude<BarcodeLookupSource, 'miss'>;
  food: Food;
  /** Nutrient keys that were explicitly present (OFF only; empty for USDA). */
  nutrientKeysPresent: string[];
  productUrl: string | null;
};

export type BarcodeLookupMiss = {
  status: 'miss';
  barcode: string;
  message: string;
};

export type BarcodeLookupResult = BarcodeLookupHit | BarcodeLookupMiss;

function offId(barcode: string): string {
  return `off_${barcode}`;
}

function cacheRowToNormalized(row: typeof offFoodCache.$inferSelect): NormalizedOffFood {
  let nutrientKeysPresent: NormalizedOffFood['nutrientKeysPresent'] = [];
  try {
    nutrientKeysPresent = JSON.parse(row.nutrientKeysPresent || '[]');
  } catch {
    nutrientKeysPresent = [];
  }
  let nutrients: Record<string, number | null> = {};
  try {
    nutrients = JSON.parse(row.nutrients || '{}');
  } catch {
    nutrients = {};
  }
  return {
    barcode: row.barcode,
    sourceId: row.sourceId ?? row.barcode,
    name: row.name,
    brand: row.brand,
    servingSize: row.servingSize,
    servingUnit: row.servingUnit,
    nutritionBasis: (row.nutritionBasis as 'per_100g' | 'per_serving') || 'per_100g',
    nutrients,
    nutrientKeysPresent: nutrientKeysPresent as NormalizedOffFood['nutrientKeysPresent'],
    productUrl: row.productUrl,
    source: 'open_food_facts',
  };
}

/** Upsert normalized OFF food into foods catalog + off_food_cache. */
export async function cacheOffFood(normalized: NormalizedOffFood): Promise<Food> {
  const id = offId(normalized.barcode);
  const nutrientsJson = JSON.stringify(normalized.nutrients);
  const keysJson = JSON.stringify(normalized.nutrientKeysPresent);
  const now = new Date();

  await db
    .insert(offFoodCache)
    .values({
      barcode: normalized.barcode,
      sourceId: normalized.sourceId,
      name: normalized.name,
      brand: normalized.brand,
      servingSize: normalized.servingSize,
      servingUnit: normalized.servingUnit,
      nutritionBasis: normalized.nutritionBasis,
      nutrients: nutrientsJson,
      cachedAt: now,
      productUrl: normalized.productUrl,
      nutrientKeysPresent: keysJson,
    })
    .onConflictDoUpdate({
      target: offFoodCache.barcode,
      set: {
        sourceId: normalized.sourceId,
        name: normalized.name,
        brand: normalized.brand,
        servingSize: normalized.servingSize,
        servingUnit: normalized.servingUnit,
        nutritionBasis: normalized.nutritionBasis,
        nutrients: nutrientsJson,
        cachedAt: now,
        productUrl: normalized.productUrl,
        nutrientKeysPresent: keysJson,
      },
    });

  const foodValues = {
    id,
    sourceId: normalized.sourceId,
    name: normalized.name,
    description: normalized.brand ? normalized.brand : null,
    source: 'open_food_facts' as const,
    barcode: normalized.barcode,
    gtin: normalized.barcode,
    brand: normalized.brand,
    servingSize: normalized.servingSize,
    servingUnit: normalized.servingUnit,
    nutritionBasis: normalized.nutritionBasis,
    nutrients: nutrientsJson,
  };

  await db
    .insert(foods)
    .values(foodValues)
    .onConflictDoUpdate({
      target: foods.id,
      set: {
        sourceId: foodValues.sourceId,
        name: foodValues.name,
        description: foodValues.description,
        source: foodValues.source,
        barcode: foodValues.barcode,
        gtin: foodValues.gtin,
        brand: foodValues.brand,
        servingSize: foodValues.servingSize,
        servingUnit: foodValues.servingUnit,
        nutritionBasis: foodValues.nutritionBasis,
        nutrients: foodValues.nutrients,
      },
    });

  const rows = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
  return rows[0]!;
}

async function findUsdaByBarcode(barcode: string): Promise<Food | null> {
  const rows = await db
    .select()
    .from(foods)
    .where(
      and(
        inArray(foods.source, [...USDA_SOURCES]),
        or(eq(foods.barcode, barcode), eq(foods.gtin, barcode))
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findOffCacheByBarcode(barcode: string): Promise<{
  food: Food;
  nutrientKeysPresent: string[];
  productUrl: string | null;
} | null> {
  const cached = await db
    .select()
    .from(offFoodCache)
    .where(eq(offFoodCache.barcode, barcode))
    .limit(1);

  if (cached[0]) {
    const food = await cacheOffFood(cacheRowToNormalized(cached[0]));
    let keys: string[] = [];
    try {
      keys = JSON.parse(cached[0].nutrientKeysPresent || '[]');
    } catch {
      keys = [];
    }
    return { food, nutrientKeysPresent: keys, productUrl: cached[0].productUrl };
  }

  const existing = await db
    .select()
    .from(foods)
    .where(
      and(
        eq(foods.source, 'open_food_facts'),
        or(eq(foods.barcode, barcode), eq(foods.gtin, barcode), eq(foods.id, offId(barcode)))
      )
    )
    .limit(1);
  if (!existing[0]) return null;
  return { food: existing[0], nutrientKeysPresent: [], productUrl: null };
}

/**
 * Local-first barcode lookup:
 * 1) USDA foods by barcode/gtin
 * 2) local OFF cache
 * 3) Open Food Facts v2 API (then cache)
 * 4) miss → caller shows custom food form
 */
export async function lookupBarcode(rawBarcode: string): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    return { status: 'miss', barcode: '', message: 'Enter a valid barcode.' };
  }

  const usda = await findUsdaByBarcode(barcode);
  if (usda) {
    return {
      status: 'hit',
      source: 'usda',
      food: usda,
      nutrientKeysPresent: [],
      productUrl: null,
    };
  }

  const cached = await findOffCacheByBarcode(barcode);
  if (cached) {
    return {
      status: 'hit',
      source: 'off_cache',
      food: cached.food,
      nutrientKeysPresent: cached.nutrientKeysPresent,
      productUrl: cached.productUrl,
    };
  }

  const api = await fetchOpenFoodFactsProduct(barcode);
  if (!api.ok) {
    return {
      status: 'miss',
      barcode,
      message:
        api.reason === 'not_found'
          ? 'No match in USDA or Open Food Facts. Create a custom food.'
          : api.message,
    };
  }

  const food = await cacheOffFood(api.food);
  return {
    status: 'hit',
    source: 'open_food_facts',
    food,
    nutrientKeysPresent: api.food.nutrientKeysPresent,
    productUrl: api.food.productUrl,
  };
}

export type CustomFoodInput = {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  servingSize?: number | null;
  servingUnit?: string | null;
  nutritionBasis?: 'per_100g' | 'per_serving';
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carb?: number | null;
  fiber?: number | null;
  sugars?: number | null;
  saturatedFat?: number | null;
  sodium?: number | null;
};

/** Insert a user-defined food (e.g. barcode miss). */
export async function insertCustomFood(input: CustomFoodInput): Promise<Food> {
  const id = newId('custom');
  const barcode = input.barcode ? normalizeBarcode(input.barcode) || null : null;
  const nutrients = {
    calories: input.calories ?? null,
    protein: input.protein ?? null,
    fat: input.fat ?? null,
    carb: input.carb ?? null,
    fiber: input.fiber ?? null,
    sugars: input.sugars ?? null,
    saturated_fat: input.saturatedFat ?? null,
    sodium: input.sodium ?? null,
  };
  await db.insert(foods).values({
    id,
    sourceId: null,
    name: input.name.trim(),
    description: input.brand?.trim() || null,
    source: 'custom',
    barcode,
    gtin: barcode,
    brand: input.brand?.trim() || null,
    servingSize: input.servingSize ?? 1,
    servingUnit: input.servingUnit ?? 'serving',
    nutritionBasis: input.nutritionBasis ?? 'per_serving',
    nutrients: JSON.stringify(nutrients),
  });
  const rows = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
  return rows[0]!;
}

/** Count only bundled USDA foods (for import checksum). */
export async function countBundledFoods(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(foods)
    .where(sql`coalesce(${foods.source}, '') not in ('open_food_facts', 'custom')`);
  return Number(row?.n ?? 0);
}
