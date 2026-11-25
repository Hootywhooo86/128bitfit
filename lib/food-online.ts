/**
 * Searching for foods online, when the bundled catalogue does not have it.
 *
 * Two sources, asked side by side, only when the user taps Search online —
 * never per keystroke, and never as a bulk download:
 *
 * - Open Food Facts: millions of barcoded products, worldwide, Canada
 *   included. ODbL: a food is fetched because someone is looking for it, and
 *   only the one they pick is kept, exactly like the barcode lookup.
 * - USDA FoodData Central, branded foods: US packaged products, public
 *   domain. Needs an api.data.gov key; the shared DEMO_KEY works until it is
 *   rate-limited, and a free personal key never is in normal use.
 *
 * Each source fails on its own: no signal, a timeout or a rate limit says so
 * in one sentence and the other source's results still show.
 */
import { fetchWithTimeout, LOOKUP_TIMEOUT_MS } from './net';
import { normalizeOffProduct, OFF_USER_AGENT, type NormalizedOffFood } from './open-food-facts';
import { describeNetworkFailure } from './net-errors';

export type OnlineFood =
  | { kind: 'off'; key: string; name: string; brand: string | null; caloriesText: string; off: NormalizedOffFood }
  | { kind: 'usda'; key: string; name: string; brand: string | null; caloriesText: string; usda: UsdaBrandedFood };

export type UsdaBrandedFood = {
  fdcId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  /** Per 100 g (or ml), as FoodData Central's search reports branded foods. */
  nutrients: Record<string, number | null>;
};

export type SourceResult = { foods: OnlineFood[]; error: string | null; rateLimited?: boolean };

/** "xx:green-valley-farms" → "Green Valley Farms". */
export function cleanBrand(raw: unknown): string | null {
  const first = Array.isArray(raw) ? raw[0] : typeof raw === 'string' ? raw.split(',')[0] : null;
  if (typeof first !== 'string' || !first.trim()) return null;
  return first
    .replace(/^[a-z]{2}:/, '')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** USDA names are often shouted: "LARGE WHITE EGGS" → "Large White Eggs". */
export function tidyName(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters && letters === letters.toUpperCase()) {
    return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return name;
}

function kcalText(kcal: number | null, per: string): string {
  return kcal == null ? 'calories unknown' : `${Math.round(kcal)} kcal / ${per}`;
}

/** An Open Food Facts search hit, mapped like a barcode lookup. Null when it has no calories. */
export function offHitToFood(hit: Record<string, unknown>): OnlineFood | null {
  const code = typeof hit.code === 'string' ? hit.code : null;
  if (!code) return null;
  const norm = normalizeOffProduct(code, { ...hit, brands: cleanBrand(hit.brands) ?? undefined });
  if (!norm || norm.nutrients.calories == null) return null;
  const per = norm.nutritionBasis === 'per_100g' ? '100 g' : 'serving';
  return {
    kind: 'off',
    key: `off-${code}`,
    name: tidyName(norm.name),
    brand: norm.brand,
    caloriesText: kcalText(norm.nutrients.calories, per),
    off: { ...norm, name: tidyName(norm.name) },
  };
}

const USDA_NUTRIENTS: Record<number, string> = {
  1008: 'calories',
  1003: 'protein',
  1004: 'fat',
  1005: 'carb',
  1079: 'fiber',
  2000: 'sugars',
  1258: 'saturated_fat',
  1093: 'sodium',
  1253: 'cholesterol',
  1087: 'calcium',
  1089: 'iron',
  1092: 'potassium',
};

/** FoodData Central's unit codes. */
const UNIT: Record<string, string> = { GRM: 'g', G: 'g', MLT: 'ml', ML: 'ml', MG: 'mg' };

/** A FoodData Central search hit. Null when it has no calories. */
export function usdaHitToFood(hit: Record<string, unknown>): OnlineFood | null {
  const fdcId = hit.fdcId != null ? String(hit.fdcId) : null;
  const rawName = typeof hit.description === 'string' ? hit.description : null;
  if (!fdcId || !rawName) return null;
  const nutrients: Record<string, number | null> = {};
  for (const n of (hit.foodNutrients as { nutrientId?: number; value?: number }[] | undefined) ?? []) {
    const key = n.nutrientId != null ? USDA_NUTRIENTS[n.nutrientId] : undefined;
    if (key && typeof n.value === 'number' && Number.isFinite(n.value) && nutrients[key] == null) nutrients[key] = n.value;
  }
  if (nutrients.calories == null) return null;
  const brand = cleanBrand(hit.brandName ?? hit.brandOwner);
  const usda: UsdaBrandedFood = {
    fdcId,
    name: tidyName(rawName),
    brand: brand ? tidyName(brand) : null,
    barcode: typeof hit.gtinUpc === 'string' ? hit.gtinUpc : null,
    servingSize: typeof hit.servingSize === 'number' ? hit.servingSize : null,
    servingUnit: typeof hit.servingSizeUnit === 'string' ? (UNIT[hit.servingSizeUnit.toUpperCase()] ?? hit.servingSizeUnit.toLowerCase()) : null,
    nutrients,
  };
  return { kind: 'usda', key: `usda-${fdcId}`, name: usda.name, brand: usda.brand, caloriesText: kcalText(nutrients.calories, '100 g'), usda };
}

export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<SourceResult> {
  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=24` +
    '&fields=code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity';
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': OFF_USER_AGENT }, signal }, { timeoutMs: LOOKUP_TIMEOUT_MS, label: 'Open Food Facts search' });
    if (!res.ok) return { foods: [], error: `Open Food Facts answered ${res.status}. Try again in a moment.` };
    const data = (await res.json()) as { hits?: Record<string, unknown>[] };
    return { foods: (data.hits ?? []).map(offHitToFood).filter((f): f is OnlineFood => !!f), error: null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { foods: [], error: describeNetworkFailure(e, 'Open Food Facts') };
  }
}

export async function searchUsdaBranded(query: string, apiKey: string | null, signal?: AbortSignal): Promise<SourceResult> {
  const key = apiKey?.trim() || 'DEMO_KEY';
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(query)}&dataType=Branded&pageSize=24`;
  try {
    const res = await fetchWithTimeout(url, { signal }, { timeoutMs: LOOKUP_TIMEOUT_MS, label: 'USDA search' });
    if (res.status === 429 || res.status === 403) {
      return {
        foods: [],
        rateLimited: true,
        error:
          key === 'DEMO_KEY'
            ? "USDA's shared key is busy right now. Add your own free key below to search it any time."
            : 'USDA refused that key. Check it, or get a new free one at api.data.gov.',
      };
    }
    if (!res.ok) return { foods: [], error: `USDA answered ${res.status}. Try again in a moment.` };
    const data = (await res.json()) as { foods?: Record<string, unknown>[] };
    return { foods: (data.foods ?? []).map(usdaHitToFood).filter((f): f is OnlineFood => !!f), error: null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { foods: [], error: describeNetworkFailure(e, 'USDA') };
  }
}
