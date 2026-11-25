/**
 * Food search that finds what you meant, not only exact substrings.
 *
 * "egg large" finds "Eggs, Grade A, Large, egg whole": every word has to
 * appear, in any order, plurals count as the singular, a few common
 * synonyms are understood (yoghurt / yogurt, prawn / shrimp), and a typo of a
 * letter or two still matches when nothing matches exactly.
 *
 * Ranking puts the plain version of a food above prepared dishes that only
 * mention it: words matched whole and early in the name score higher, long
 * names score lower, baby food and dry mixes sink unless asked for, and foods
 * you made or log often rise.
 *
 * Pure: an index and a query in, ranked ids out. The index is built once per
 * catalogue (db/food-queries.ts), so a keystroke is one pass over ~14k names.
 */

export type IndexedFood = {
  id: string;
  name: string;
  brand: string | null;
  source: string | null;
};

type Entry = IndexedFood & {
  /** Lower-cased, accents and punctuation gone, singular words. */
  words: string[];
  /** The words joined, for substring tests. */
  text: string;
  /** The name before its first comma — "Eggs" in "Eggs, Grade A, Large". */
  head: string[];
  /** The second part — "salmon" in "Fish, salmon, Atlantic, raw". */
  second: string;
  segments: number;
};

export type FoodIndex = Entry[];

const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'with', 'in', 'or', 'for', 'to']);

/** Plural → singular, near enough for food names. */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(ch|sh|ss|x|z|o)es$/.test(word)) return word.slice(0, -2);
  if (/ves$/.test(word) && word.length > 4) return word.slice(0, -3) + 'f';
  if (/s$/.test(word) && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%.]+/g, ' ')
    .split(' ')
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
    .map(singular);
}

/**
 * Words that mean the same food. Each group is matched as a whole: any one of
 * them in the query finds any one of them in a name. US and UK names both,
 * because the database is American and the user may not be.
 */
const SYNONYMS: string[][] = [
  ['yogurt', 'yoghurt'],
  ['shrimp', 'prawn'],
  ['zucchini', 'courgette'],
  ['eggplant', 'aubergine'],
  ['cilantro', 'coriander'],
  ['arugula', 'rocket'],
  ['chickpea', 'garbanzo'],
  ['scallion', 'spring onion', 'green onion'],
  ['oatmeal', 'porridge', 'oat'],
  ['ground', 'mince', 'minced'],
  ['soda', 'pop', 'soft drink', 'carbonated'],
  ['cookie', 'biscuit'],
  ['candy', 'sweet', 'confectionery'],
  ['fry', 'chip', 'french fry'],
  ['potato chip', 'crisp'],
  ['pb', 'peanut butter'],
  ['oj', 'orange juice'],
  ['bbq', 'barbecue', 'barbecued'],
  ['pop', 'soda'],
  ['ketchup', 'catsup'],
  ['hamburger', 'burger'],
  ['donut', 'doughnut'],
  ['bell pepper', 'capsicum', 'sweet pepper'],
  ['powdered sugar', 'icing sugar'],
  ['whey', 'protein powder'],
].map((g) => g.map((w) => words(w).join(' ')));

/** Every way a query word may appear in a name: itself, or its synonyms. */
function variants(word: string): string[] {
  const out = new Set([word]);
  for (const group of SYNONYMS) if (group.includes(word)) for (const w of group) out.add(w);
  return [...out];
}

/** Variants of the query: single words, with "oj" or "pb" standing in for their phrases. */
function queryTerms(query: string): string[][] {
  const ws = words(query).filter((w) => !STOP.has(w));
  return ws.map(variants);
}

export function buildIndex(foods: readonly IndexedFood[]): FoodIndex {
  return foods.map((f) => {
    const w = words(`${f.name} ${f.brand ?? ''}`);
    return {
      ...f,
      words: w,
      text: ` ${w.join(' ')} `,
      head: words(f.name.split(',')[0] ?? ''),
      second: words(f.name.split(',')[1] ?? '').join(' '),
      segments: f.name.split(',').length,
    };
  });
}

/** Edits to turn a into b (a swapped pair of letters is one), giving up past `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1);
      cur[j] = d;
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** How well one query word (any of its variants) fits a food; 0 is no match. */
function termScore(e: Entry, variantsOfTerm: string[], fuzzy: boolean): number {
  let best = 0;
  for (const v of variantsOfTerm) {
    if (e.text.includes(` ${v} `)) best = Math.max(best, 10 + (e.head.join(' ').includes(v) ? 4 : 0));
    else if (e.text.includes(` ${v}`)) best = Math.max(best, 6 + (e.head.some((h) => h.startsWith(v)) ? 3 : 0));
    else if (!v.includes(' ') && v.length >= 3 && e.text.includes(v)) best = Math.max(best, 2);
  }
  if (best === 0 && fuzzy) {
    for (const v of variantsOfTerm) {
      if (v.includes(' ') || v.length < 4) continue;
      const max = v.length >= 7 ? 2 : 1;
      if (e.words.some((w) => editDistance(v, w, max) <= max)) best = Math.max(best, 3);
    }
  }
  return best;
}

/** The everyday form of a food: nudged up when the query does not say otherwise. */
const COMMON = ['whole', 'raw', 'plain', 'nfs', 'regular', 'fresh'];

/** Kinds of entry most people do not mean, unless the query says so. */
const NICHE = ['babyfood', 'infant', 'formula', 'dry mix', 'dehydrated', 'powder', 'freeze dried', 'school lunch'];

export type SearchOptions = {
  /** How often each food id was logged recently; frequent ones rise. */
  logged?: ReadonlyMap<string, number>;
  limit?: number;
};

function rank(index: FoodIndex, terms: string[][], fuzzy: boolean, query: string, opts: SearchOptions) {
  const typedWords = words(query).filter((w) => !STOP.has(w));
  const typed = typedWords.join(' ');
  const asked = ` ${typedWords.join(' ')} `;
  const scored: { id: string; score: number; name: string }[] = [];
  for (const e of index) {
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const s = termScore(e, t, fuzzy);
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;
    // The plain food above long prepared dishes that mention it.
    score -= e.words.length * 0.6;
    score -= Math.max(0, e.segments - 3) * 1.5;
    // "Egg, whole, raw" for "egg", not "Egg burrito": a name whose first part
    // is exactly what was typed is the thing itself, not a dish containing it.
    const head = e.head.join(' ');
    if (head === typed) score += 9;
    else if (terms[0].some((v) => head === v)) score += 6;
    else if (e.second === typed) score += 6;
    for (const c of COMMON) if (e.text.includes(` ${c} `) && !asked.includes(` ${c} `)) score += 2;
    for (const n of NICHE) if (e.text.includes(` ${n}`) && !asked.includes(` ${n}`)) score -= 8;
    if (e.source === 'custom' || e.source === 'recipe') score += 8;
    const times = opts.logged?.get(e.id) ?? 0;
    if (times > 0) score += 6 + Math.min(times, 10);
    scored.push({ id: e.id, score, name: e.name });
  }
  return scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
}

/**
 * Ranked ids for a query. Exact words first; only when that finds nothing
 * are near-misses allowed, so a correct spelling never drowns in typo
 * matches.
 */
export function searchIndex(index: FoodIndex, query: string, opts: SearchOptions = {}): string[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const limit = opts.limit ?? 40;
  let hits = rank(index, terms, false, query, opts);
  if (hits.length === 0) hits = rank(index, terms, true, query, opts);
  return hits.slice(0, limit).map((h) => h.id);
}
