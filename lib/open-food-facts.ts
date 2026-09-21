/**
 * Open Food Facts v2 client + normalization for 128BIT FIT.
 * Public API only; per-barcode lookups (no bulk import).
 * Data © Open Food Facts contributors — ODbL.
 */
import { LOOKUP_TIMEOUT_MS, NetworkTimeoutError, fetchWithTimeout } from './net';

export const OFF_USER_AGENT =
  '128BIT-FIT/0.1 (https://github.com/Hootywhooo86/128bitfit)';

export const OFF_LICENSE_NOTE =
  'Product data from Open Food Facts, available under the Open Database License (ODbL).';

const OFF_PRODUCT_URL = (barcode: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;

/** Core nutrient keys we always try to map from OFF. */
export const OFF_NUTRIENT_KEYS = [
  'calories',
  'protein',
  'fat',
  'carb',
  'fiber',
  'sugars',
  'saturated_fat',
  'sodium',
] as const;

export type OffNutrientKey = (typeof OFF_NUTRIENT_KEYS)[number];

export type NormalizedOffFood = {
  barcode: string;
  sourceId: string;
  name: string;
  brand: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  /** Prefer per_100g; per_serving only when that is the only usable basis. */
  nutritionBasis: 'per_100g' | 'per_serving';
  nutrients: Record<string, number | null>;
  /** Keys that had an explicit numeric value in the OFF payload (not inferred as 0). */
  nutrientKeysPresent: OffNutrientKey[];
  productUrl: string | null;
  source: 'open_food_facts';
};

export type OffLookupResult =
  | { ok: true; food: NormalizedOffFood }
  | { ok: false; reason: 'not_found' | 'network' | 'timeout' | 'malformed'; message: string };

type OffNutriments = Record<string, unknown>;

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function pickNutrient(
  n: OffNutriments,
  keys: string[],
  opts?: { scale?: number }
): number | null {
  for (const key of keys) {
    const raw = asNumber(n[key]);
    if (raw != null) return raw * (opts?.scale ?? 1);
  }
  return null;
}

/**
 * Prefer explicit *_100g nutriments. Fall back to serving / bare keys only when
 * no per-100g macros exist, and mark basis as per_serving.
 */
export function normalizeOffProduct(
  barcode: string,
  product: Record<string, unknown>
): NormalizedOffFood | null {
  const code = firstString(product.code, barcode) ?? barcode;
  const name =
    firstString(
      product.product_name,
      product.product_name_en,
      product.generic_name,
      product.abbreviated_product_name
    ) ?? null;
  if (!name) return null;

  const brand = firstString(product.brands, product.brand);
  const nutriments = (product.nutriments ?? {}) as OffNutriments;

  const use100g =
    asNumber(nutriments['energy-kcal_100g']) != null ||
    asNumber(nutriments['proteins_100g']) != null ||
    asNumber(nutriments['fat_100g']) != null ||
    asNumber(nutriments['carbohydrates_100g']) != null ||
    asNumber(nutriments['energy-kj_100g']) != null;

  let nutritionBasis: 'per_100g' | 'per_serving';
  let calories: number | null;
  let protein: number | null;
  let fat: number | null;
  let carb: number | null;
  let fiber: number | null;
  let sugars: number | null;
  let saturatedFat: number | null;
  let sodiumMg: number | null;

  if (use100g) {
    nutritionBasis = 'per_100g';
    calories = pickNutrient(nutriments, ['energy-kcal_100g']);
    if (calories == null) {
      const kj = pickNutrient(nutriments, ['energy-kj_100g', 'energy_100g']);
      if (kj != null) calories = kj / 4.184;
    }
    protein = pickNutrient(nutriments, ['proteins_100g']);
    fat = pickNutrient(nutriments, ['fat_100g']);
    carb = pickNutrient(nutriments, ['carbohydrates_100g']);
    fiber = pickNutrient(nutriments, ['fiber_100g']);
    sugars = pickNutrient(nutriments, ['sugars_100g']);
    saturatedFat = pickNutrient(nutriments, ['saturated-fat_100g']);
    sodiumMg = pickNutrient(nutriments, ['sodium_100g'], { scale: 1000 });
    if (sodiumMg == null) {
      const saltG = pickNutrient(nutriments, ['salt_100g']);
      if (saltG != null) sodiumMg = (saltG / 2.5) * 1000;
    }
  } else {
    nutritionBasis = 'per_serving';
    calories = pickNutrient(nutriments, ['energy-kcal_serving', 'energy-kcal']);
    if (calories == null) {
      const kj = pickNutrient(nutriments, ['energy-kj_serving', 'energy']);
      if (kj != null) calories = kj / 4.184;
    }
    protein = pickNutrient(nutriments, ['proteins_serving', 'proteins']);
    fat = pickNutrient(nutriments, ['fat_serving', 'fat']);
    carb = pickNutrient(nutriments, ['carbohydrates_serving', 'carbohydrates']);
    fiber = pickNutrient(nutriments, ['fiber_serving', 'fiber']);
    sugars = pickNutrient(nutriments, ['sugars_serving', 'sugars']);
    saturatedFat = pickNutrient(nutriments, ['saturated-fat_serving', 'saturated-fat']);
    sodiumMg = pickNutrient(nutriments, ['sodium_serving', 'sodium'], { scale: 1000 });
    if (sodiumMg == null) {
      const saltG = pickNutrient(nutriments, ['salt_serving', 'salt']);
      if (saltG != null) sodiumMg = (saltG / 2.5) * 1000;
    }
  }

  const nutrients: Record<string, number | null> = {
    calories,
    protein,
    fat,
    carb,
    fiber,
    sugars,
    saturated_fat: saturatedFat,
    sodium: sodiumMg,
  };

  const nutrientKeysPresent = OFF_NUTRIENT_KEYS.filter((k) => nutrients[k] != null);

  let servingSize: number | null = null;
  let servingUnit: string | null = null;
  const sq = asNumber(product.serving_quantity);
  const servingSizeStr = firstString(product.serving_size);

  if (nutritionBasis === 'per_100g') {
    if (sq != null && sq > 0) {
      servingSize = sq;
      servingUnit = 'g';
    } else if (servingSizeStr) {
      const m = servingSizeStr.match(/([\d.]+)\s*([a-zA-Z]+)?/);
      if (m) {
        servingSize = Number(m[1]);
        servingUnit = (m[2] || 'g').toLowerCase();
      } else {
        servingSize = 100;
        servingUnit = 'g';
      }
    } else {
      servingSize = 100;
      servingUnit = 'g';
    }
  } else if (sq != null && sq > 0) {
    servingSize = sq;
    servingUnit = 'g';
  } else if (servingSizeStr) {
    const m = servingSizeStr.match(/([\d.]+)\s*([a-zA-Z]+)?/);
    if (m) {
      servingSize = Number(m[1]);
      servingUnit = (m[2] || 'serving').toLowerCase();
    } else {
      servingSize = 1;
      servingUnit = 'serving';
    }
  } else {
    servingSize = 1;
    servingUnit = 'serving';
  }

  const productUrl =
    firstString(product.url) ??
    `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`;

  return {
    barcode: code,
    sourceId: code,
    name,
    brand,
    servingSize,
    servingUnit,
    nutritionBasis,
    nutrients,
    nutrientKeysPresent,
    productUrl,
    source: 'open_food_facts',
  };
}

export async function fetchOpenFoodFactsProduct(barcode: string): Promise<OffLookupResult> {
  const cleaned = barcode.replace(/\D/g, '');
  if (!cleaned) {
    return { ok: false, reason: 'malformed', message: 'Barcode is empty.' };
  }

  let res: Response;
  try {
    // A deadline, not just error handling: a hung request never rejects, so
    // without this the scan screen waits on a dead connection indefinitely.
    res = await fetchWithTimeout(
      OFF_PRODUCT_URL(cleaned),
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': OFF_USER_AGENT,
        },
      },
      { timeoutMs: LOOKUP_TIMEOUT_MS, label: 'Barcode lookup' }
    );
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof NetworkTimeoutError ? 'timeout' : 'network',
      message: e instanceof Error ? e.message : 'Network request failed',
    };
  }

  if (!res.ok) {
    if (res.status === 404) {
      return { ok: false, reason: 'not_found', message: 'Product not found on Open Food Facts.' };
    }
    return {
      ok: false,
      reason: 'network',
      message: `Open Food Facts returned HTTP ${res.status}`,
    };
  }

  let data: { status?: number; product?: Record<string, unknown>; status_verbose?: string };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, reason: 'malformed', message: 'Invalid JSON from Open Food Facts.' };
  }

  if (data.status !== 1 || !data.product) {
    return {
      ok: false,
      reason: 'not_found',
      message: data.status_verbose ?? 'Product not found on Open Food Facts.',
    };
  }

  const food = normalizeOffProduct(cleaned, data.product);
  if (!food) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Product is missing a usable name or nutrition fields.',
    };
  }

  return { ok: true, food };
}

/** Digits-only barcode normalization for lookups. */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, '');
}
