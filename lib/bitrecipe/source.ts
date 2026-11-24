/**
 * Reading bitrecipe's saved recipes off the 128bit family account.
 *
 * bitrecipe syncs every recipe as one row of `bitrecipe_items` (kind
 * 'recipe') on the family Supabase project — its supabase/bitrecipe-sync.sql
 * and app/js/sync.js. Row-level security limits a sign-in to its own rows, so
 * FIT, signed in to the same account, reads exactly the cookbook bitrecipe
 * shows. FIT only reads; it never writes there.
 *
 * Rows are pulled by the server's `updated_at`, the same cursor bitrecipe
 * uses, so a deleted recipe arrives as a tombstone and an edited one again.
 *
 * Pure.
 */
import type { BitrecipeIngredient } from './amount';

export type BitRecipe = {
  id: string;
  title: string;
  /** As bitrecipe has it; it defaults unknown servings to 2 and flags that itself. */
  servings: number;
  ingredients: BitrecipeIngredient[];
  /** When bitrecipe last changed it (ms), to notice edits after adding. */
  modified: number;
};

export type ItemRow = {
  id?: unknown;
  data?: unknown;
  deleted?: unknown;
  modified?: unknown;
  updated_at?: unknown;
};

/** What FIT keeps of a recipe: enough to price it, not its steps or photos. */
export function recipeFromRow(row: ItemRow): BitRecipe | null {
  if (typeof row.id !== 'string' || !row.id || row.deleted === true) return null;
  const d = row.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const ings = Array.isArray(d.ingredients) ? d.ingredients : [];
  const ingredients: BitrecipeIngredient[] = [];
  for (const raw of ings) {
    if (!raw || typeof raw !== 'object') continue;
    const i = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const item = str(i.item);
    const line = str(i.raw);
    if (!item && !line) continue;
    ingredients.push({
      qty: num(i.qty),
      qty2: num(i.qty2),
      unit: str(i.unit),
      item,
      prep: str(i.prep),
      raw: line,
      loose: str(i.loose),
      missing: i.missing === true,
    });
  }
  const servings = typeof d.servings === 'number' && d.servings > 0 ? d.servings : 1;
  const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim() : 'Untitled recipe';
  const modified = typeof row.modified === 'number' ? row.modified : Number(row.modified) || 0;
  return { id: row.id, title, servings, ingredients, modified };
}

/**
 * Folds a page of rows into what FIT already had: newer rows replace, a
 * tombstone removes. Newest change first, the order the screen lists them.
 */
export function mergeRows(had: readonly BitRecipe[], rows: readonly ItemRow[]): BitRecipe[] {
  const byId = new Map(had.map((r) => [r.id, r]));
  for (const row of rows) {
    if (typeof row.id !== 'string') continue;
    const r = recipeFromRow(row);
    if (r) byId.set(r.id, r);
    else byId.delete(row.id);
  }
  return [...byId.values()].sort((a, b) => b.modified - a.modified);
}

/** The REST path for one page of recipe rows changed after `cursor`. */
export function pagePath(cursor: string | null, limit = 200): string {
  const since = cursor ? `&updated_at=gt.${encodeURIComponent(cursor)}` : '';
  return `bitrecipe_items?select=id,data,deleted,modified,updated_at&kind=eq.recipe${since}&order=updated_at.asc&limit=${limit}`;
}

/** Saved as a FIT recipe: which food, and from which bitrecipe edit. */
export type AddedMap = Record<string, { foodId: string; modified: number }>;

export type InboxEntry = { recipe: BitRecipe; status: 'new' | 'changed' | 'added'; foodId: string | null };

/**
 * Every bitrecipe recipe with whether FIT has it yet. "changed" means it was
 * edited in bitrecipe after you added it; adding again makes a fresh food and
 * leaves the old one, which past logs point at.
 */
export function inbox(recipes: readonly BitRecipe[], added: AddedMap, liveFoodIds: ReadonlySet<string>): InboxEntry[] {
  return recipes.map((recipe) => {
    const a = added[recipe.id];
    if (!a || !liveFoodIds.has(a.foodId)) return { recipe, status: 'new', foodId: null };
    return { recipe, status: recipe.modified > a.modified ? 'changed' : 'added', foodId: a.foodId };
  });
}
