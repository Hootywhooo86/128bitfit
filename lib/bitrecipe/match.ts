/**
 * Finding a recipe ingredient in the bundled USDA database.
 *
 * USDA names put the food first and the details after commas — "Cream,
 * heavy", "Chicken, broiler or fryers, breast, skinless, boneless, meat only,
 * raw" — while recipes say "heavy cream" and "chicken breasts, sliced". This
 * turns the recipe's words into a few stems, the database query asks for foods
 * containing all of them, and `pickMatch` scores what comes back.
 *
 * A match must contain every word that matters and lead with one of them. A
 * near miss is no match: the import then asks the AI, which says it is
 * estimating. A confident wrong match ("butter" → "Peanut butter") would be
 * worse than none, because it would be presented as a database figure.
 *
 * Pure.
 */

export type MatchCandidate = { id: string; name: string; source: string | null };

/** Words that describe preparation or size, not the food. */
const DESCRIPTORS = new Set(
  (
    'a an and of the or with for to into in on about approx approximately ' +
    'chopped diced minced sliced grated shredded crushed peeled cubed halved quartered ' +
    'finely roughly thinly thickly coarsely freshly lightly ' +
    'fresh large small medium big extra plus heaping level rounded packed ' +
    'softened melted room temperature cold warm hot ' +
    'boneless skinless trimmed whole ' +
    'divided taste optional garnish serving needed unsalted ' +
    'organic good quality'
  ).split(/\s+/)
);

/** Recipe words for which USDA uses another name. */
const SYNONYMS: Record<string, string[]> = {
  penne: ['pasta'],
  spaghetti: ['pasta'],
  fusilli: ['pasta'],
  rigatoni: ['pasta'],
  linguine: ['pasta'],
  fettuccine: ['pasta'],
  farfalle: ['pasta'],
  macaroni: ['pasta'],
  parmesan: ['cheese', 'parmesan'],
  cheddar: ['cheese', 'cheddar'],
  mozzarella: ['cheese', 'mozzarella'],
  feta: ['cheese', 'feta'],
  ricotta: ['cheese', 'ricotta'],
  scallion: ['onion', 'spring'],
  courgette: ['squash', 'zucchini'],
  zucchini: ['squash', 'zucchini'],
  aubergine: ['eggplant'],
  coriander: ['coriander'],
  cilantro: ['coriander'],
  mince: ['ground'],
  minced: [],
};

/** States the database distinguishes; one the recipe did not ask for is a worse match. */
const STATES = [
  'cooked',
  'canned',
  'frozen',
  'dried',
  'dehydrated',
  'prepared',
  'fried',
  'boiled',
  'roasted',
  'baked',
  'braised',
  'grilled',
  'broiled',
  'stewed',
  'smoked',
  'toasted',
  'salted',
  'sweetened',
  'drained',
  'mix',
  'powder',
  'solution',
  // Variants and parts: a recipe that says "eggs" or "milk" means the plain, whole thing.
  'reduced',
  'low',
  'lowfat',
  'nonfat',
  'skim',
  'free',
  'light',
  'lite',
  'imitation',
  'substitute',
  'yolk',
  'calcium',
  'fortified',
  'dry',
  'whipped',
];

/** Foods a recipe uses dry, where the database's "dry" row is the right one. */
const DRY_FOODS = new Set(['pasta', 'rice', 'bean', 'lentil', 'oat', 'quinoa', 'couscous', 'noodle']);

/** One word too broad to pick a single food for: "cheese" could be any of 300. */
const TOO_BROAD = new Set(['cheese', 'oil', 'meat', 'fish', 'nut', 'pepper', 'seasoning', 'spice', 'sauce']);

/** Rows that are a whole dish or a brand, never a plain ingredient. */
const NOT_INGREDIENTS = /^(babyfood|fast foods?|restaurant|school lunch|snacks?)\b/i;
const BRAND = /\b[A-Z][A-Z'&]{2,}\b/;

/** "tomatoes" → "tomato", "berries" → "berry". Rough, and only for matching. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * The stems that must all be in a matching food's name, in the order written.
 *
 * Everything after the first comma is preparation ("garlic, minced"), and so
 * is anything in brackets.
 */
export function ingredientStems(item: string): string[] {
  const core = item.replace(/\([^)]*\)/g, ' ').split(',')[0];
  const out: string[] = [];
  for (const w of words(core)) {
    if (DESCRIPTORS.has(w)) continue;
    const syn = SYNONYMS[w];
    const list = syn ?? [w];
    for (const s of list.map(stem)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

function need0(item: string): string | null {
  const n = ingredientStems(item);
  return n.length === 1 ? n[0] : null;
}

/**
 * The best database food for the ingredient, or null when nothing is a
 * confident match.
 */
export function pickMatch(itemIn: string, candidates: readonly MatchCandidate[]): MatchCandidate | null {
  // A bare "flour" in a recipe is all-purpose, not Italian 00 or rye.
  const item = need0(itemIn) === 'flour' ? 'all-purpose flour' : itemIn;
  const need = ingredientStems(item);
  if (need.length === 0) return null;
  if (need.length === 1 && TOO_BROAD.has(need[0])) return null;
  // "salt & pepper" is two ingredients on one line; no single food is it.
  if (/\s(&|and|or)\s|\//i.test(item.split(',')[0])) return null;
  const asked = new Set(words(item).map(stem));
  const dryFood = need.some((n) => DRY_FOODS.has(n));

  let best: { c: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    if (NOT_INGREDIENTS.test(c.name) || BRAND.test(c.name)) continue;
    const segments = c.name.split(',').map((seg) => words(seg).map(stem));
    const all = segments.flat();
    const have = new Set(all);
    if (!need.every((n) => have.has(n))) continue;
    // The food is what comes before the first comma. "Peanut butter" leads
    // with peanut; a recipe that said "butter" did not mean it.
    const head = segments[0] ?? [];
    if (!head.some((h) => need.includes(h))) continue;
    // The rest of what the recipe named belongs near the front, as the variety:
    // "Sauce, peanut, made from …, soy sauce" is not soy sauce.
    const front = new Set(segments.slice(0, 3).flat());
    if (!need.every((n) => front.has(n))) continue;
    // Extra words in the head are only fine after the food itself:
    // "Soy sauce made from soy and wheat" is soy sauce; "Peanut butter" is not butter.
    const leads = need.length >= 2 && need.every((n, k) => head[k] === n);
    if (!leads && head.some((h) => !need.includes(h) && !asked.has(h))) continue;

    let score = 100;
    score -= 3 * all.filter((w) => !need.includes(w)).length;
    for (const st of STATES) {
      if (st === 'dry' && dryFood) continue;
      if (have.has(st) && !asked.has(st)) score -= 20;
    }
    // Words the recipe used that the name repeats: "crushed tomatoes" → "Tomatoes, crushed".
    score += 35 * all.filter((w) => asked.has(w) && !need.includes(w) && !STATES.includes(w)).length;
    if (all.some((w) => asked.has(w) && !need.includes(w) && STATES.includes(w))) score += 35;
    // The second part is the variety: "Oil, corn, peanut, and olive" is not olive oil.
    const variety = (segments[1] ?? []).filter((w) => !need.includes(w) && !asked.has(w) && w !== 'whole' && w !== 'raw');
    score -= Math.min(30, 20 * variety.length);
    if (have.has('raw') || have.has('unprepared') || (dryFood && have.has('dry'))) score += 12;
    if (have.has('whole')) score += 8;
    // "(Hopi)", "(Navajo)": a regional speciality, not the everyday food.
    if (c.name.includes('(')) score -= 40;
    if (c.source === 'foundation') score += 2;
    if (!best || score > best.score || (score === best.score && c.name.length < best.c.name.length)) {
      best = { c, score };
    }
  }
  return best?.c ?? null;
}
