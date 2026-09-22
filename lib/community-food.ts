/**
 * Sharing a custom food back to the project's food database.
 *
 * There is no server, and there should not be a secret in a sideloaded app, so
 * this does not post anything itself. It builds a pre-filled GitHub issue and
 * opens it in the browser; the user reviews it and submits it under their own
 * account. Nothing leaves the phone until they press the button on GitHub.
 *
 * What is shared is the food's facts and nothing else. No logs, no name, no
 * settings, no device identifiers — a public issue is the wrong place for any
 * of it, and building the body here rather than at the call site is what makes
 * that testable.
 */
import type { Food } from '@/db/schema';
import { parseNutrients } from './nutrition';

/** Where submissions go. A fork changes this one line. */
export const FOOD_REPO = 'Hootywhooo86/128bitfit';

/** Keys copied from a food's nutrients. Anything else is ignored. */
const NUTRIENT_KEYS = [
  'calories',
  'protein',
  'fat',
  'carb',
  'fiber',
  'sugars',
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'added_sugars',
] as const;

export type FoodSubmission = {
  title: string;
  body: string;
  url: string;
};

/** GitHub rejects very long query strings; a food never needs this much. */
const MAX_BODY = 4000;

export function buildFoodSubmission(food: Food, repo = FOOD_REPO): FoodSubmission {
  const nutrients = parseNutrients(food.nutrients);
  const facts: Record<string, number | null> = {};
  for (const k of NUTRIENT_KEYS) {
    const v = nutrients[k];
    facts[k] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  // Explicitly built, field by field, so a future column on `foods` cannot
  // start leaking into a public issue just by existing.
  const payload = {
    name: food.name,
    brand: food.brand ?? null,
    barcode: food.barcode ?? null,
    serving_size: food.servingSize ?? null,
    serving_unit: food.servingUnit ?? null,
    nutrition_basis: food.nutritionBasis ?? null,
    nutrients: facts,
  };

  const title = `Food: ${food.name}${food.brand ? ` (${food.brand})` : ''}`.slice(0, 120);
  const body = [
    'A custom food from the app, offered for the shared database.',
    '',
    'Please check it before merging — these values were typed or scanned by a',
    'user and have not been verified against a label.',
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ]
    .join('\n')
    .slice(0, MAX_BODY);

  const url =
    `https://github.com/${repo}/issues/new` +
    `?title=${encodeURIComponent(title)}` +
    `&body=${encodeURIComponent(body)}` +
    `&labels=${encodeURIComponent('food-submission')}`;

  return { title, body, url };
}

/** True for a food the user made, which is the only kind worth submitting. */
export function isShareable(food: Pick<Food, 'source' | 'name'>): boolean {
  return food.source === 'custom' && food.name.trim().length > 0;
}
