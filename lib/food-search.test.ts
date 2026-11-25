import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, editDistance, searchIndex, singular, words } from './food-search';

type Raw = { id: number | string; name: string; brand: string | null; source: string };
const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'assets/data/foods.json'), 'utf8')) as Raw[];
const index = buildIndex(raw.map((f) => ({ id: String(f.id), name: f.name, brand: f.brand, source: f.source })));
const nameOf = new Map(raw.map((f) => [String(f.id), f.name]));
const top = (q: string, n = 5, opts = {}) => searchIndex(index, q, { limit: n, ...opts }).map((id) => nameOf.get(id) ?? id);

describe('food search, on the real bundled catalogue', () => {
  it('finds a large egg from "egg large" and "large egg", any order', () => {
    for (const q of ['egg large', 'large egg', 'eggs large', 'LARGE  EGGS']) {
      expect(top(q, 5).some((n) => /large/i.test(n) && /egg/i.test(n)), q).toBe(true);
    }
  });

  it('puts the plain food first, not dishes that mention it', () => {
    expect(top('egg', 3).every((n) => /^egg/i.test(n))).toBe(true);
    expect(top('banana', 1)[0]).toMatch(/^banana/i);
    expect(top('chicken breast', 3).some((n) => /chicken/i.test(n) && /breast/i.test(n))).toBe(true);
  });

  it('forgives a typo when nothing matches exactly', () => {
    expect(top('bananna', 3).some((n) => /banana/i.test(n))).toBe(true);
    expect(top('chiken breast', 3).some((n) => /chicken/i.test(n))).toBe(true);
    expect(top('brocolli', 3).some((n) => /broccoli/i.test(n))).toBe(true);
  });

  it('understands UK and US names', () => {
    expect(top('greek yoghurt', 5).some((n) => /yogurt/i.test(n))).toBe(true);
    expect(top('prawns', 5).some((n) => /shrimp/i.test(n))).toBe(true);
    expect(top('courgette', 3).some((n) => /zucchini/i.test(n))).toBe(true);
  });

  it('finds everyday dishes from the survey foods', () => {
    expect(top('fried egg', 5).some((n) => /egg, whole, fried/i.test(n))).toBe(true);
    expect(top('cheese pizza', 5).some((n) => /pizza/i.test(n) && /cheese/i.test(n))).toBe(true);
  });

  it('sinks baby food unless asked for', () => {
    expect(top('carrots', 5).some((n) => /babyfood/i.test(n))).toBe(false);
    expect(top('babyfood carrot', 3).some((n) => /babyfood/i.test(n))).toBe(true);
  });

  it('lifts foods you log often', () => {
    const plain = searchIndex(index, 'egg', { limit: 40 });
    const pick = plain[25];
    const boosted = searchIndex(index, 'egg', { limit: 40, logged: new Map([[pick, 5]]) });
    expect(boosted.indexOf(pick)).toBeLessThan(25);
  });

  it('says nothing for an empty query or one of only filler words', () => {
    expect(searchIndex(index, '   ')).toEqual([]);
    expect(searchIndex(index, 'the of and')).toEqual([]);
  });
});

describe('food search helpers', () => {
  it('makes words singular', () => {
    expect(['eggs', 'berries', 'tomatoes', 'peaches', 'leaves', 'hummus', 'glass'].map(singular)).toEqual([
      'egg', 'berry', 'tomato', 'peach', 'leaf', 'hummus', 'glass',
    ]);
    expect(words('Crème Fraîche, 2%')).toEqual(['creme', 'fraiche', '2%']);
  });

  it('counts edits, with a swap as one', () => {
    expect(editDistance('chicken', 'chiken', 2)).toBe(1);
    expect(editDistance('chicken', 'chciken', 2)).toBe(1);
    expect(editDistance('egg', 'eggplant', 1)).toBeGreaterThan(1);
  });
});
