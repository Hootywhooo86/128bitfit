/**
 * Turning a description or a photo of a meal into food items, via the user's
 * own AI provider.
 *
 * Everything this produces is an **estimate**, and the app says so. A model
 * looking at a photo of a plate is guessing at portion sizes; so is a model
 * reading "some cottage cheese". CLAUDE.md forbids presenting an estimate as a
 * measurement, so nothing here is ever saved without the user seeing the
 * numbers on an editable form first, and the rows carry an `estimated` flag so
 * the UI cannot forget.
 *
 * Pure: builds the prompt, parses the reply. No network, no camera, no
 * database — which is the part worth testing, because a model will eventually
 * return something malformed and the answer must be "I couldn't read that",
 * never a plate of zeroes.
 */
import { defaultMealTypeForHour } from './nutrition';
import type { MealType } from '@/db/schema';

export type AiFoodItem = {
  name: string;
  /** What the user (or the photo) implied, e.g. "2 slices", "50 g". */
  portion: string;
  calories: number;
  protein: number | null;
  fat: number | null;
  carb: number | null;
  /**
   * Where the figures came from, as the model named it — "hellofresh.com".
   * Null when it estimated.
   */
  source: string | null;
  /**
   * False only when the provider reported searching the web *and* the model
   * named a source for this item. The model's own claim of a source is not
   * enough on its own: a model with no search can still write "hellofresh.com".
   */
  estimated: boolean;
};

export type AiFoodResult =
  | { status: 'ok'; items: AiFoodItem[]; mealType: MealType; note: string | null }
  | { status: 'empty'; message: string }
  | { status: 'unreadable'; message: string; raw: string };

const SYSTEM = `You estimate nutrition for a food logging app.

Reply with JSON only. No prose, no markdown fence. The shape is:
{"items":[{"name":"Egg, large","portion":"3 eggs","calories":234,"protein":19,"fat":16,"carb":1}],"note":null}

Rules:
- One entry per distinct food. Combine duplicates.
- calories is required and must be a number of kilocalories for the whole
  portion described, not per 100 g and not per single unit.
- protein, fat and carb are grams for that same portion. Use null, never 0, for
  a macro you genuinely cannot estimate.
- Do not invent foods that were not described or visible.
- If you cannot identify any food at all, reply {"items":[],"note":"<why>"}.
- Put any caveat about portion size in "note". Keep it to one sentence.`;

const WEB = `

You can search the web. Use it — the user wants real figures, not guesses.
- When the user names a brand, a meal kit (HelloFresh, Gousto, Green Chef…), a
  restaurant or chain dish, or a packaged product, search for its published
  nutrition and use those exact figures. Prefer the brand's own site.
- Published figures are per serving or per 100 g. Scale them to the portion
  described; with no portion given, use one published serving and say so in
  "portion".
- A meal kit recipe is one item with the recipe's own per-serving figures, not
  a list of ingredients you estimated.
- Add "source" to each item: the site you took its figures from, e.g.
  "hellofresh.com". Use null when you could not find a published figure and
  estimated instead — and say so in "note".
- Never give a source for a number you did not read there.
Item shape with search: {"name":"…","portion":"1 serving","calories":<number>,"protein":<number>,"fat":<number>,"carb":<number>,"source":"<site>"}`;

export function describePrompt(text: string): string {
  return `Estimate the nutrition for this meal: ${text.trim()}`;
}

export const PHOTO_PROMPT =
  'Estimate the nutrition for the food in this photo. If portion size is unclear, assume a normal serving and say so in "note".';

/**
 * A recipe spread over several photos — a page of a book, a label, the pan.
 * The model is told they are one recipe so it does not return the same
 * ingredient once per photo.
 */
export function recipePhotosPrompt(count: number, servings: number): string {
  return (
    `These ${count} photo${count === 1 ? '' : 's'} are one recipe. Read the ingredients ` +
    `and return one entry per ingredient for a single serving, assuming the recipe ` +
    `makes ${servings} serving${servings === 1 ? '' : 's'}. ` +
    `Do not repeat an ingredient that appears in more than one photo. ` +
    `If the photos do not show a recipe, return no items and say so in "note".`
  );
}

/**
 * A recipe at a URL. The model is asked to use the page if it can reach it and
 * to say so plainly if it cannot, rather than reciting a recipe from memory
 * and presenting it as that page's.
 */
export function recipeLinkPrompt(url: string, servings: number): string {
  return (
    `Read the recipe at ${url.trim()} and return one entry per ingredient for a ` +
    `single serving, assuming it makes ${servings} serving${servings === 1 ? '' : 's'}. ` +
    `If you cannot open that page, return no items and put "could not open the link" ` +
    `in "note" — do not answer from memory of a similar recipe.`
  );
}

export function systemPrompt(webSearch = false): string {
  return webSearch ? SYSTEM + WEB : SYSTEM;
}

/** Strips a ```json fence, which models add despite being asked not to. */
function unfence(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) return fence[1].trim();
  // Some models prepend a sentence. Take the outermost JSON object.
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) return t.slice(first, last + 1);
  return t;
}

/** A macro is a non-negative finite number, or genuinely absent. */
function macro(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 10) / 10;
}

function calories(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  // A single logged item above this is a model error, not a meal.
  if (v > 20000) return null;
  return Math.round(v);
}

/**
 * @param searched Whether the provider reported actually searching the web on
 *   this call. Without it no item can be marked as looked up.
 */
export function parseAiFood(
  raw: string,
  now: Date = new Date(),
  searched = false
): AiFoodResult {
  const text = unfence(raw);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      status: 'unreadable',
      message: 'The model did not reply with usable JSON. Try again, or add the food by hand.',
      raw,
    };
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items)) {
    return {
      status: 'unreadable',
      message: 'The model replied in an unexpected shape. Try again, or add the food by hand.',
      raw,
    };
  }

  const obj = data as { items: unknown[]; note?: unknown };
  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : null;

  const items: AiFoodItem[] = [];
  for (const entry of obj.items) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const kcal = calories(e.calories);
    // A row with no name or no calories is not a food log line. Dropping it
    // beats saving a blank or a zero that claims to be a reading.
    if (!name || kcal == null) continue;
    const source = typeof e.source === 'string' && e.source.trim() ? e.source.trim() : null;
    items.push({
      name,
      portion: typeof e.portion === 'string' && e.portion.trim() ? e.portion.trim() : '1 serving',
      calories: kcal,
      protein: macro(e.protein),
      fat: macro(e.fat),
      carb: macro(e.carb),
      source,
      estimated: !(searched && source),
    });
  }

  if (items.length === 0) {
    return {
      status: 'empty',
      message: note ?? 'No food was recognised. Describe it in more detail, or add it by hand.',
    };
  }

  return { status: 'ok', items, mealType: defaultMealTypeForHour(now.getHours()), note };
}

/** Totals for the confirmation screen. A null macro stays null, never 0. */
export function totalsOf(items: AiFoodItem[]): {
  calories: number;
  protein: number | null;
  fat: number | null;
  carb: number | null;
} {
  const sum = (pick: (i: AiFoodItem) => number | null): number | null => {
    const vals = items.map(pick).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10;
  };
  return {
    calories: items.reduce((n, i) => n + i.calories, 0),
    protein: sum((i) => i.protein),
    fat: sum((i) => i.fat),
    carb: sum((i) => i.carb),
  };
}
