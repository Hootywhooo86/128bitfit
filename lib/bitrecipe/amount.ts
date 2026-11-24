/**
 * Reading an ingredient's amount — "2 tbsp", "1/2 cup", "500 g", "1½ lb" —
 * into a number the database can be multiplied by.
 *
 * Only a weight can be multiplied straight into the bundled USDA panel, which
 * is per 100 g. A volume becomes a weight only for liquids whose density is a
 * physical constant (water, milk, stock, oil); a cup of flour or a "2 chicken
 * breasts" has no honest weight here, so it comes back with `grams: null` and
 * the import asks the AI for one — and labels it as estimated.
 *
 * Pure.
 */

export type Amount = {
  /** The number as written, or null for "to taste", "a pinch", none at all. */
  quantity: number | null;
  /** Normalised unit ('g', 'ml', 'cup', 'tbsp', 'clove', …) or null for a bare count. */
  unit: string | null;
  /** The weight, when it can be known without guessing. */
  grams: number | null;
  /** "to taste", "optional", "for garnish" — too little to count, and said so. */
  negligible: boolean;
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
  '⅕': 0.2,
  '⅙': 1 / 6,
};

/** Grams per unit. */
const MASS: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, oz: 28.349523125, lb: 453.59237 };

/** Millilitres per unit (US measures — what recipe sites overwhelmingly mean). */
const VOLUME: Record<string, number> = {
  ml: 1,
  l: 1000,
  cl: 10,
  dl: 100,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  'fl oz': 29.5735,
  pint: 473.176,
  quart: 946.353,
};

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(g|gr|gram|grams|gramme|grammes)$/, 'g'],
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, 'kg'],
  [/^(mg|milligram|milligrams)$/, 'mg'],
  [/^(oz|ounce|ounces)$/, 'oz'],
  [/^(lb|lbs|pound|pounds)$/, 'lb'],
  [/^(ml|millilitre|millilitres|milliliter|milliliters)$/, 'ml'],
  [/^(l|litre|litres|liter|liters)$/, 'l'],
  [/^(cl|centilitre|centilitres)$/, 'cl'],
  [/^(dl|decilitre|decilitres)$/, 'dl'],
  [/^(t|tsp|tsps|teaspoon|teaspoons)$/, 'tsp'],
  [/^(T|tbsp|tbsps|tbs|tbl|tablespoon|tablespoons)$/, 'tbsp'],
  [/^(c|cup|cups)$/, 'cup'],
  [/^(pint|pints|pt)$/, 'pint'],
  [/^(quart|quarts|qt)$/, 'quart'],
  [/^(clove|cloves)$/, 'clove'],
  [/^(can|cans|tin|tins)$/, 'can'],
  [/^(packet|packets|pack|packs|package|packages|sachet|sachets)$/, 'packet'],
  [/^(slice|slices)$/, 'slice'],
  [/^(pinch|pinches|dash|dashes)$/, 'pinch'],
  [/^(bunch|bunches|handful|handfuls|sprig|sprigs|stick|sticks)$/, 'bunch'],
];

/**
 * Liquids with a known density, g per ml. Matched against the ingredient
 * name. Anything else measured by volume needs a weight from somewhere else.
 */
const DENSITIES: [RegExp, number][] = [
  [/\b(oil)\b/, 0.92],
  // Table salt, 5.7 g a teaspoon.
  [/^(table |sea |kosher )?salt$/, 1.2],
  [/\b(water|stock|broth|milk|juice|vinegar|wine|beer)\b/, 1.0],
  [/\b(cream)\b(?!\s*cheese)/, 1.0],
  // Grams per US cup, the same table bitrecipe converts with (app/js/units.js),
  // so a recipe weighs the same in both apps. Longest names first.
  ...(
    [
      [/powdered sugar|icing sugar/, 120],
      [/brown sugar/, 213],
      [/chocolate chips/, 170],
      [/cocoa/, 85],
      [/flour/, 120],
      [/sugar/, 200],
      [/butter/, 227],
      [/yogh?urt/, 245],
      [/honey/, 340],
      [/oats/, 90],
      [/rice/, 185],
      [/parmesan/, 90],
      [/cheese/, 113],
    ] as [RegExp, number][]
  ).map(([re, perCup]): [RegExp, number] => [re, perCup / 236.588]),
];

const NEGLIGIBLE = /\b(to taste|optional|for garnish|garnish|for serving|to serve|as needed|a pinch|pinch|dash)\b/i;

function parseNumber(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  // "1½" or "1 ½"
  let total = 0;
  const uni = [...t].find((c) => c in UNICODE_FRACTIONS);
  if (uni) {
    total += UNICODE_FRACTIONS[uni];
    t = t.replace(uni, '').trim();
    if (!t) return total;
  }
  // "1 1/2"
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return total + Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? null : total + Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? total + n : null;
}

function normaliseUnit(raw: string): string | null {
  const t = raw.replace(/\.$/, '');
  // "T" is tablespoon and "t" teaspoon only when written that way exactly.
  for (const [re, unit] of UNIT_ALIASES) {
    if (re.test(t === 'T' || t === 't' ? t : t.toLowerCase())) return unit;
  }
  return null;
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[¼½¾⅓⅔⅛⅜⅝⅞⅕⅙]?|[¼½¾⅓⅔⅛⅜⅝⅞⅕⅙])`;
const LEAD = new RegExp(String.raw`^\s*(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*(fl\.?\s*oz\.?|[a-zA-Z]+\.?)?`);

/**
 * @param amount What bitrecipe put in the amount column ("2 tbsp"), or null.
 * @param item The ingredient itself ("butter"), used for the "to taste" check
 *   and a liquid's density.
 */
export function parseAmount(amount: string | null, item: string): Amount {
  const text = (amount ?? '').trim();
  const negligible = NEGLIGIBLE.test(text) || (!text && NEGLIGIBLE.test(item));
  const m = text.match(LEAD);
  if (!m) return { quantity: null, unit: null, grams: null, negligible };

  const lo = parseNumber(m[1]);
  const hi = m[2] ? parseNumber(m[2]) : null;
  // A range is the middle of it: "2–3 cloves" is 2.5.
  const quantity = lo == null ? null : hi != null && hi > lo ? (lo + hi) / 2 : lo;
  let unit: string | null = null;
  if (m[3]) {
    const u = m[3].replace(/\s+/g, ' ').trim();
    unit = /^fl\.?\s*oz\.?$/i.test(u) ? 'fl oz' : normaliseUnit(u);
  }
  if (quantity == null) return { quantity: null, unit, grams: null, negligible };

  let grams: number | null = null;
  if (unit && unit in MASS) {
    grams = quantity * MASS[unit];
  } else if (unit && unit in VOLUME) {
    const name = item.toLowerCase();
    const density = DENSITIES.find(([re]) => re.test(name))?.[1];
    if (density != null) grams = quantity * VOLUME[unit] * density;
  }
  return {
    quantity,
    unit,
    grams: grams == null ? null : Math.round(grams * 10) / 10,
    negligible: negligible || unit === 'pinch',
  };
}

/** An ingredient as bitrecipe stores it (its app/js/parse.js `parseIngredientLine`). */
export type BitrecipeIngredient = {
  qty?: number | null;
  qty2?: number | null;
  unit?: string | null;
  item?: string | null;
  prep?: string | null;
  raw?: string | null;
  /** "to taste", "for serving" — bitrecipe's own flag. */
  loose?: string | null;
  /** No amount in the source: bitrecipe shows it as "??". */
  missing?: boolean;
};

/** bitrecipe's fields back into an amount string this parser reads. */
export function amountText(ing: BitrecipeIngredient): string | null {
  if (ing.loose) return ing.loose;
  if (ing.qty == null || !Number.isFinite(ing.qty)) return null;
  const range = ing.qty2 != null && Number.isFinite(ing.qty2) ? `-${ing.qty2}` : '';
  return `${ing.qty}${range}${ing.unit ? ` ${ing.unit}` : ''}`;
}
