import { describe, expect, it } from 'vitest';
import { inbox, mergeRows, pagePath, recipeFromRow } from './source';

const row = (id: string, data: unknown, modified = 1, deleted = false) => ({ id, data, deleted, modified, updated_at: 't' });

describe('bitrecipe rows', () => {
  it('keeps what is needed to price a recipe', () => {
    const r = recipeFromRow(
      row('r1', {
        title: ' Tea Cookies ',
        servings: 24,
        steps: [{ text: 'bake' }],
        ingredients: [
          { id: 'i1', qty: 2, unit: 'cup', item: 'flour', prep: '', raw: '2 cups flour' },
          { id: 'i2', qty: null, unit: '', item: 'vanilla', missing: true, raw: 'vanilla' },
          { id: 'i3', qty: 'x', item: '' },
          'junk',
        ],
      }, 5)
    );
    expect(r).toEqual({
      id: 'r1',
      title: 'Tea Cookies',
      servings: 24,
      modified: 5,
      ingredients: [
        { qty: 2, qty2: null, unit: 'cup', item: 'flour', prep: null, raw: '2 cups flour', loose: null, missing: false },
        { qty: null, qty2: null, unit: null, item: 'vanilla', prep: null, raw: 'vanilla', loose: null, missing: true },
      ],
    });
  });

  it('applies edits and tombstones, newest first', () => {
    let have = mergeRows([], [row('a', { title: 'A', ingredients: [] }, 1), row('b', { title: 'B', ingredients: [] }, 2)]);
    expect(have.map((r) => r.id)).toEqual(['b', 'a']);
    have = mergeRows(have, [row('a', { title: 'A2', ingredients: [] }, 3), row('b', null, 4, true)]);
    expect(have.map((r) => r.title)).toEqual(['A2']);
  });

  it('pages by the server clock, recipes only', () => {
    expect(pagePath(null)).toBe('bitrecipe_items?select=id,data,deleted,modified,updated_at&kind=eq.recipe&order=updated_at.asc&limit=200');
    expect(pagePath('2026-11-24T10:00:00+00:00')).toContain('&updated_at=gt.2026-11-24T10%3A00%3A00%2B00%3A00&');
  });

  it('knows what is new, added, or changed since adding', () => {
    const recipes = mergeRows([], [row('a', { title: 'A' }, 10), row('b', { title: 'B' }, 10), row('c', { title: 'C' }, 30), row('d', { title: 'D' }, 10)]);
    const got = inbox(recipes, { b: { foodId: 'f1', modified: 10 }, c: { foodId: 'f2', modified: 20 }, d: { foodId: 'gone', modified: 10 } }, new Set(['f1', 'f2']));
    const by = Object.fromEntries(got.map((e) => [e.recipe.id, e.status]));
    expect(by).toEqual({ a: 'new', b: 'added', c: 'changed', d: 'new' });
  });
});
