/**
 * bitrecipe recipes on this phone, and their ingredients looked up in the
 * bundled food database.
 *
 * The pulled recipes and the "already added" map live in settings keys, so
 * they export and restore with everything else and need no migration. A
 * recipe added to FIT becomes an ordinary `foods` row with source 'recipe' —
 * it is in Custom → My recipes like any other, and stays there if bitrecipe
 * later deletes it.
 */
import { and, inArray, like } from 'drizzle-orm';
import { db } from './client';
import { foods } from './schema';
import { getSetting, setSetting } from './settings-store';
import { ingredientStems, pickMatch } from '@/lib/bitrecipe/match';
import type { DbMatch, Per100 } from '@/lib/bitrecipe/build';
import type { AddedMap, BitRecipe } from '@/lib/bitrecipe/source';

const RECIPES = 'bitrecipe_recipes';
const CURSOR = 'bitrecipe_cursor';
const ADDED = 'bitrecipe_added';
const LAST_PULL = 'bitrecipe_last_pull';
const LAST_ERROR = 'bitrecipe_last_error';

/** The bundled USDA sources: the only rows whose panel is a measured per-100 g figure. */
const DATABASE_SOURCES = ['foundation', 'sr_legacy'];

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export type BitrecipeState = {
  recipes: BitRecipe[];
  cursor: string | null;
  added: AddedMap;
  lastPull: string | null;
  lastError: string | null;
};

export async function getBitrecipeState(): Promise<BitrecipeState> {
  const [r, c, a, p, e] = await Promise.all([
    getSetting(RECIPES),
    getSetting(CURSOR),
    getSetting(ADDED),
    getSetting(LAST_PULL),
    getSetting(LAST_ERROR),
  ]);
  return {
    recipes: parseJson<BitRecipe[]>(r, []),
    cursor: c || null,
    added: parseJson<AddedMap>(a, {}),
    lastPull: p || null,
    lastError: e || null,
  };
}

export async function saveBitrecipePull(recipes: BitRecipe[], cursor: string | null): Promise<void> {
  await setSetting(RECIPES, JSON.stringify(recipes));
  await setSetting(CURSOR, cursor ?? '');
  await setSetting(LAST_PULL, new Date().toISOString());
  await setSetting(LAST_ERROR, '');
}

export async function setBitrecipeError(message: string): Promise<void> {
  await setSetting(LAST_ERROR, message);
}

export async function markBitrecipeAdded(recipeId: string, foodId: string, modified: number): Promise<void> {
  const added = parseJson<AddedMap>(await getSetting(ADDED), {});
  added[recipeId] = { foodId, modified };
  await setSetting(ADDED, JSON.stringify(added));
}

/** Which of these food ids still exist (a recipe deleted in FIT can be added again). */
export async function existingFoodIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.select({ id: foods.id }).from(foods).where(inArray(foods.id, ids));
  return new Set(rows.map((r) => r.id));
}

function per100(nutrientsJson: string): Per100 {
  const n = parseJson<Record<string, unknown>>(nutrientsJson, {});
  const v = (k: string) => (typeof n[k] === 'number' && Number.isFinite(n[k]) ? (n[k] as number) : null);
  return { calories: v('calories'), protein: v('protein'), fat: v('fat'), carb: v('carb') };
}

/** The bundled food for an ingredient, or null when there is no confident match. */
export async function matchIngredient(item: string): Promise<DbMatch | null> {
  const stems = ingredientStems(item);
  if (stems.length === 0) return null;
  const rows = await db
    .select({ id: foods.id, name: foods.name, source: foods.source, nutrients: foods.nutrients })
    .from(foods)
    .where(and(inArray(foods.source, DATABASE_SOURCES), ...stems.map((s) => like(foods.name, `%${s}%`))))
    .limit(500);
  const pick = pickMatch(item, rows);
  if (!pick) return null;
  const row = rows.find((r) => r.id === pick.id)!;
  return { id: row.id, name: row.name, per100: per100(row.nutrients) };
}
