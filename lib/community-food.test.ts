import { describe, expect, it } from 'vitest';
import type { Food } from '@/db/schema';
import { buildFoodSubmission, isShareable } from './community-food';

const food = {
  id: 'custom_1',
  sourceId: null,
  name: 'Nan’s flapjack',
  description: null,
  source: 'custom',
  barcode: '5012345678900',
  gtin: '5012345678900',
  brand: 'Homemade',
  servingSize: 60,
  servingUnit: 'g',
  nutritionBasis: 'per_serving',
  nutrients: JSON.stringify({ calories: 280, protein: 4, fat: 12, carb: 38, fiber: null }),
  photoUri: 'file:///data/user/0/com.app/files/food-photos/custom_1.jpg',
} as Food;

describe('building a submission', () => {
  const sub = buildFoodSubmission(food, 'owner/repo');

  it('names the food and the brand in the title', () => {
    expect(sub.title).toBe('Food: Nan’s flapjack (Homemade)');
  });

  it('carries the facts', () => {
    expect(sub.body).toContain('"calories": 280');
    expect(sub.body).toContain('"serving_size": 60');
    expect(sub.body).toContain('"barcode": "5012345678900"');
  });

  it('keeps an unknown nutrient null rather than sending a zero', () => {
    expect(sub.body).toContain('"fiber": null');
  });

  it('asks the reviewer to check it, because nobody verified these numbers', () => {
    expect(sub.body).toMatch(/have not been verified/);
  });

  it('opens a prefilled issue on the right repo', () => {
    expect(sub.url.startsWith('https://github.com/owner/repo/issues/new?')).toBe(true);
    expect(sub.url).toContain('labels=food-submission');
  });

  it('escapes the title and body into the query string', () => {
    // A raw & would end the parameter and a raw # would end the URL, either
    // way truncating the submission without saying so.
    const sharp = buildFoodSubmission({ ...food, name: 'Tea & toast #2' } as Food, 'o/r');
    const params = new URL(sharp.url).searchParams;
    expect(params.get('title')).toBe('Food: Tea & toast #2 (Homemade)');
    expect(params.get('body')).toContain('Tea & toast #2');
    // The raw title segment carries no unescaped delimiter of its own.
    const segment = sharp.url.slice(sharp.url.indexOf('?title=') + 7, sharp.url.indexOf('&body='));
    expect(segment).not.toMatch(/[&#]/);
  });
});

describe('what must never be shared', () => {
  const body = buildFoodSubmission(food, 'o/r').body;

  it('does not include the local photo path', () => {
    // It is a path on that person's phone and means nothing to anyone else.
    expect(body).not.toContain('file:///');
    expect(body).not.toContain('food-photos');
  });

  it('does not include internal ids', () => {
    expect(body).not.toContain('custom_1');
  });

  it('copies only known nutrient keys, so a new column cannot leak', () => {
    const sneaky = {
      ...food,
      nutrients: JSON.stringify({ calories: 100, user_email: 'someone@example.com' }),
    } as Food;
    expect(buildFoodSubmission(sneaky, 'o/r').body).not.toContain('someone@example.com');
  });
});

describe('what is shareable', () => {
  it('is a food the user made', () => {
    expect(isShareable(food)).toBe(true);
  });

  it('is not a catalog food, which is already in the database', () => {
    expect(isShareable({ ...food, source: 'foundation' } as Food)).toBe(false);
    expect(isShareable({ ...food, source: 'open_food_facts' } as Food)).toBe(false);
  });

  it('is not an unnamed one', () => {
    expect(isShareable({ ...food, name: '   ' } as Food)).toBe(false);
  });
});
