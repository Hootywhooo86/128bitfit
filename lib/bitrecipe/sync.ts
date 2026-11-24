/**
 * Pulls bitrecipe's saved recipes onto this phone.
 *
 * Read-only, and only when signed in to the 128bit family account — signing
 * in is the consent; nothing is sent. The cookbook is kept in SQLite, so the
 * list still shows offline and the review screen never waits on the network.
 * Never throws: a failure is stored as one sentence for the screen.
 */
import { getBitrecipeState, saveBitrecipePull, setBitrecipeError } from '@/db/bitrecipe-queries';
import { family, FamilyError } from '@/lib/family';
import { mergeRows, pagePath, type ItemRow } from './source';

const PAGE = 200;
/** 40 × 200 recipes, the same ceiling bitrecipe's own sync uses. */
const MAX_PAGES = 40;

export type PullResult = { status: 'ok'; changed: number } | { status: 'signed-out' } | { status: 'failed'; message: string };

export async function pullBitrecipe(): Promise<PullResult> {
  try {
    const { signedIn } = await family.status();
    if (!signedIn) return { status: 'signed-out' };
    const state = await getBitrecipeState();
    let recipes = state.recipes;
    let cursor = state.cursor;
    let changed = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = await family.select<(ItemRow & { updated_at: string })[]>(pagePath(cursor, PAGE));
      if (!Array.isArray(rows) || rows.length === 0) break;
      recipes = mergeRows(recipes, rows);
      cursor = rows[rows.length - 1].updated_at;
      changed += rows.length;
      if (rows.length < PAGE) break;
    }
    await saveBitrecipePull(recipes, cursor);
    return { status: 'ok', changed };
  } catch (e) {
    const message =
      e instanceof FamilyError && e.code === 'missing-feed'
        ? 'bitrecipe has not synced any recipes to this 128bit account yet. Sign in to the same account in bitrecipe.'
        : e instanceof Error
          ? e.message
          : String(e);
    await setBitrecipeError(message).catch(() => undefined);
    return { status: 'failed', message };
  }
}
