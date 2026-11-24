/**
 * A bitrecipe recipe turned into one FIT food, line by line.
 *
 * Each ingredient line ends up in exactly one of these states, and the review
 * screen says which:
 *
 * - **database** — found in the bundled USDA foods, and the recipe gave a
 *   weight (or a volume with a known density). A real figure.
 * - **database-ai-weight** — found in the database, but the amount was a count
 *   or a cup of something without a density ("2 chicken breasts"). USDA's
 *   figures, times a weight the AI estimated. Labelled as estimated.
 * - **ai** — not in the database. The AI estimated the whole line. Labelled.
 * - **negligible** — "to taste", "for serving". Not counted, and said so.
 * - **needs-ai** — waiting for the AI. A recipe with any of these cannot be
 *   saved: leaving a line out silently would under-report the recipe.
 * - **excluded** — the user took it out.
 *
 * Pure.
 */
import { recipeTotals, type RecipeTotals } from '@/lib/recipe';
import { amountText, parseAmount, type Amount, type BitrecipeIngredient } from './amount';

/** Per 100 g, from the database. A null macro is unknown, not zero. */
export type Per100 = { calories: number | null; protein: number | null; fat: number | null; carb: number | null };

export type DbMatch = { id: string; name: string; per100: Per100 };

/** The AI's figures for the whole amount on one line. */
export type AiLine = {
  grams: number | null;
  calories: number;
  protein: number | null;
  fat: number | null;
  carb: number | null;
};

export type Line = {
  /** As the recipe wrote it, for the screen. */
  text: string;
  /** The ingredient alone: "butter". */
  item: string;
  amount: Amount;
  match: DbMatch | null;
  ai: AiLine | null;
  excluded: boolean;
  /** The user chose the AI over the database match. */
  skipMatch: boolean;
};

export type LineState = 'database' | 'database-ai-weight' | 'ai' | 'negligible' | 'needs-ai' | 'excluded';

export function toLine(ing: BitrecipeIngredient): Line | null {
  const item = (ing.item ?? '').trim();
  const raw = (ing.raw ?? '').trim();
  if (!item && !raw) return null;
  const amountStr = amountText(ing);
  const amount = parseAmount(amountStr, item || raw);
  if (ing.loose) amount.negligible = true;
  const text = raw || [amountStr, item].filter(Boolean).join(' ');
  return { text, item: item || raw, amount, match: null, ai: null, excluded: false, skipMatch: false };
}

export function lineState(l: Line): LineState {
  if (l.excluded) return 'excluded';
  const match = usableMatch(l);
  if (match && l.amount.grams != null) return 'database';
  if (match && l.ai?.grams != null) return 'database-ai-weight';
  if (l.ai) return 'ai';
  if (l.amount.negligible) return 'negligible';
  return 'needs-ai';
}

/** The database match, unless the user turned it down or it has no calorie figure to count. */
function usableMatch(l: Line): DbMatch | null {
  if (l.skipMatch || !l.match || l.match.per100.calories == null) return null;
  return l.match;
}

const scale = (v: number | null, f: number) => (v == null ? null : v * f);

/** Grams and figures for the whole amount on a line, or null when it is not counted. */
export function lineFigures(
  l: Line
): { grams: number | null; calories: number; protein: number | null; fat: number | null; carb: number | null } | null {
  const st = lineState(l);
  if (st === 'database' || st === 'database-ai-weight') {
    const grams = st === 'database' ? l.amount.grams! : l.ai!.grams!;
    const f = grams / 100;
    const p = l.match!.per100;
    return { grams, calories: p.calories! * f, protein: scale(p.protein, f), fat: scale(p.fat, f), carb: scale(p.carb, f) };
  }
  if (st === 'ai') return { ...l.ai!, grams: l.ai!.grams };
  return null;
}

/** Positions of the lines the AI still has to fill in. */
export function linesNeedingAi(lines: readonly Line[]): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (lineState(l) === 'needs-ai') out.push(i);
  });
  return out;
}

export type Basis = 'per_serving' | 'per_100g';

export type Built = {
  /** False while any line is waiting for the AI. */
  ready: boolean;
  waiting: number;
  /** The whole pot. */
  whole: RecipeTotals;
  /** Sum of the counted lines' weights; null when any counted line has none. */
  ingredientGrams: number | null;
  /** True when any counted figure came from the AI. */
  estimated: boolean;
  /** What one unit of the saved food holds: a serving, or 100 g. */
  panel: RecipeTotals | null;
  /** Why `panel` is null. */
  panelProblem: string | null;
};

const divide = (t: RecipeTotals, by: number): RecipeTotals => {
  const r = (v: number | null, d: number) => (v == null ? null : Math.round((v / by) * 10 ** d) / 10 ** d);
  return { calories: Math.round(t.calories / by), protein: r(t.protein, 1), fat: r(t.fat, 1), carb: r(t.carb, 1), partial: t.partial };
};

/**
 * @param weightGrams The finished dish's weight, for per 100 g. Defaults to the
 *   ingredients' weight; cooking loses water, so the screen asks for the real one.
 */
export function buildRecipe(
  lines: readonly Line[],
  servings: number,
  basis: Basis,
  weightGrams: number | null = null
): Built {
  const waiting = linesNeedingAi(lines).length;
  const counted: NonNullable<ReturnType<typeof lineFigures>>[] = [];
  let estimated = false;
  for (const l of lines) {
    const f = lineFigures(l);
    if (!f) continue;
    counted.push(f);
    if (lineState(l) !== 'database') estimated = true;
  }
  const whole = recipeTotals(
    counted.map((f) => ({ name: '', portion: '', calories: f.calories, protein: f.protein, fat: f.fat, carb: f.carb }))
  );
  const ingredientGrams = counted.length && counted.every((f) => f.grams != null)
    ? Math.round(counted.reduce((n, f) => n + f.grams!, 0))
    : null;

  let panel: RecipeTotals | null = null;
  let panelProblem: string | null = null;
  if (waiting > 0) {
    panelProblem = `${waiting} ingredient${waiting === 1 ? '' : 's'} still need${waiting === 1 ? 's' : ''} figures.`;
  } else if (counted.length === 0) {
    panelProblem = 'Nothing in this recipe can be counted yet.';
  } else if (basis === 'per_serving') {
    if (servings > 0) panel = divide(whole, servings);
    else panelProblem = 'Set how many servings it makes.';
  } else {
    const w = weightGrams ?? ingredientGrams;
    if (w != null && w > 0) panel = divide(whole, w / 100);
    else panelProblem = 'Per 100 g needs the weight of the finished dish.';
  }
  return { ready: waiting === 0 && panel != null, waiting, whole, ingredientGrams, estimated, panel, panelProblem };
}

/** Where a line's figures came from, in a few words, for the screen and the saved description. */
export function lineSourceLabel(l: Line): string {
  const grams = lineFigures(l)?.grams;
  const g = grams != null ? ` · ${Math.round(grams)} g` : '';
  switch (lineState(l)) {
    case 'database':
      return `USDA: ${l.match!.name}${g}`;
    case 'database-ai-weight':
      return `USDA: ${l.match!.name}${g} (weight estimated)`;
    case 'ai':
      return `AI estimate${g}`;
    case 'negligible':
      return 'Not counted (to taste)';
    case 'excluded':
      return 'Left out';
    case 'needs-ai':
      return usableMatch(l) ? `USDA: ${l.match!.name} — needs a weight` : 'Not in the food database';
  }
}

/** The saved food's description: what went in, and where each figure came from. */
export function describeBuilt(lines: readonly Line[], servings: number): string {
  const head = `From bitrecipe — makes ${servings} serving${servings === 1 ? '' : 's'}.`;
  const body = lines.filter((l) => !l.excluded).map((l) => `${l.text} — ${lineSourceLabel(l)}`);
  return [head, ...body].join('\n');
}

/**
 * Applies the AI's reply to the lines it was asked about. `items[k].line` is
 * the 1-based position in the numbered list the prompt sent, which maps back
 * through `asked`.
 */
export function applyAiLines(
  lines: readonly Line[],
  asked: readonly number[],
  items: readonly ({ line?: number | null } & AiLine)[]
): Line[] {
  const out = lines.map((l) => ({ ...l }));
  for (const it of items) {
    if (it.line == null) continue;
    const idx = asked[it.line - 1];
    if (idx == null) continue;
    out[idx].ai = { grams: it.grams, calories: it.calories, protein: it.protein, fat: it.fat, carb: it.carb };
  }
  return out;
}
