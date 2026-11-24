import { describe, expect, it } from 'vitest';
import { ingredientStems, pickMatch, stem, type MatchCandidate } from './match';

const c = (name: string, source = 'sr_legacy'): MatchCandidate => ({ id: name, name, source });

describe('ingredientStems', () => {
  it('keeps the food and drops preparation', () => {
    expect(ingredientStems('garlic, minced')).toEqual(['garlic']);
    expect(ingredientStems('large eggs')).toEqual(['egg']);
    expect(ingredientStems('heavy cream (cold)')).toEqual(['heavy', 'cream']);
    expect(ingredientStems('penne pasta')).toEqual(['pasta']);
    expect(ingredientStems('grated parmesan')).toEqual(['cheese', 'parmesan']);
  });

  it('stems plurals', () => {
    expect(stem('tomatoes')).toBe('tomato');
    expect(stem('berries')).toBe('berry');
    expect(stem('oats')).toBe('oat');
  });
});

describe('pickMatch', () => {
  it('prefers the plain raw food', () => {
    const got = pickMatch('eggs', [c('Egg, yolk, raw, fresh'), c('Egg, whole, raw, fresh'), c('Egg, whole, cooked, fried')]);
    expect(got?.name).toBe('Egg, whole, raw, fresh');
  });

  it('does not take a food that only contains the word', () => {
    expect(pickMatch('butter', [c('Peanut butter, creamy'), c('Almond butter, creamy')])).toBeNull();
    expect(pickMatch('butter', [c('Peanut butter, creamy'), c('Butter, without salt')])?.name).toBe('Butter, without salt');
  });

  it('matches the variety the recipe named', () => {
    const oils = [c('Oil, corn, peanut, and olive'), c('Oil, olive, salad or cooking')];
    expect(pickMatch('olive oil', oils)?.name).toBe('Oil, olive, salad or cooking');
    const toms = [c('Tomatoes, grape, raw'), c('Tomatoes, crushed, canned')];
    expect(pickMatch('crushed tomatoes', toms)?.name).toBe('Tomatoes, crushed, canned');
    expect(pickMatch('tomatoes', toms)?.name).toBe('Tomatoes, grape, raw');
  });

  it('skips brands, restaurant dishes and regional specialities', () => {
    expect(pickMatch('lasagna', [c('OLIVE GARDEN, lasagna classico'), c('Fast foods, lasagna')])).toBeNull();
    const got = pickMatch('tortillas', [c('Tortilla, blue corn, Sakwavikaviki (Hopi)'), c('Tortillas, ready-to-bake or -fry, corn')]);
    expect(got?.name).toBe('Tortillas, ready-to-bake or -fry, corn');
  });

  it('gives up on lines that are too broad or hold two foods', () => {
    expect(pickMatch('shredded cheese', [c('Cheese, cheddar'), c('Cheese, dry white, queso seco')])).toBeNull();
    expect(pickMatch('salt & pepper', [c('Peppers, sweet, red, cooked, boiled, drained, with salt')])).toBeNull();
  });

  it('uses dry pasta, but not dry milk', () => {
    expect(pickMatch('spaghetti', [c('Pasta, cooked, enriched'), c('Pasta, dry, enriched')])?.name).toBe('Pasta, dry, enriched');
    const milks = [c('Milk, dry, nonfat, calcium reduced'), c('Milk, whole, 3.25% milkfat, with added vitamin D')];
    expect(pickMatch('milk', milks)?.name).toBe('Milk, whole, 3.25% milkfat, with added vitamin D');
  });
});

describe('pickMatch, named varieties', () => {
  it('wants the named words near the front of the name', () => {
    expect(pickMatch('soy sauce', [c('Sauce, peanut, made from peanut butter, water, soy sauce')])).toBeNull();
    expect(pickMatch('soy sauce', [c('Sauce, peanut, made from peanut butter, water, soy sauce'), c('Soy sauce made from soy and wheat (shoyu)')])?.name).toBe(
      'Soy sauce made from soy and wheat (shoyu)'
    );
  });

  it('reads plain flour as all-purpose', () => {
    expect(pickMatch('flour', [c('Flour, 00'), c('Flour, wheat, all-purpose, enriched, bleached')])?.name).toBe(
      'Flour, wheat, all-purpose, enriched, bleached'
    );
  });
});

describe('pickMatch, one-word foods', () => {
  it('does not read "Butter oil" as butter', () => {
    expect(pickMatch('butter', [c('Butter oil, anhydrous'), c('Butter, without salt')])?.name).toBe('Butter, without salt');
  });
});
