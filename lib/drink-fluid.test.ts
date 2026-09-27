import { describe, expect, it } from 'vitest';
import { drinkFluid, looksLikeDrink } from './drink-fluid';

const log = (name: string, servingSize: number | null, servingUnit: string | null, servings = 1) => ({
  name,
  servingSize,
  servingUnit,
  servings,
});

describe('recognising a drink', () => {
  it('matches whole words, not fragments', () => {
    expect(looksLikeDrink('Green tea')).toBe(true);
    expect(looksLikeDrink('Beef steak')).toBe(false);
    expect(looksLikeDrink('Watermelon')).toBe(false);
    expect(looksLikeDrink('Popcorn')).toBe(false);
  });

  it('leaves out things named after a drink that are not one', () => {
    expect(looksLikeDrink('Milk chocolate')).toBe(false);
    expect(looksLikeDrink('Coffee beans, ground')).toBe(false);
    expect(looksLikeDrink('Fish, tuna, canned in water, drained solids')).toBe(false);
  });
});

describe('fluid from a logged food', () => {
  it('counts a stated volume, times servings', () => {
    expect(drinkFluid(log('Coca-Cola', 330, 'ml', 2))).toEqual({ status: 'counted', ml: 660 });
    expect(drinkFluid(log('Orange juice', 12, 'fl oz'))).toEqual({ status: 'counted', ml: 355 });
  });

  it('counts cups for a drink but never for a solid', () => {
    expect(drinkFluid(log('Whole milk', 1, 'cup'))).toEqual({ status: 'counted', ml: 237 });
    expect(drinkFluid(log('Popcorn', 1, 'cup'))).toEqual({ status: 'not-a-drink' });
    expect(drinkFluid(log('Watermelon', 1, 'cup'))).toEqual({ status: 'not-a-drink' });
  });

  it('reports a drink logged by weight as unmeasured instead of guessing its volume', () => {
    expect(drinkFluid(log('Apple juice, from concentrate', 100, 'g', 2.5))).toEqual({ status: 'unmeasured' });
    expect(drinkFluid(log('Latte', null, null))).toEqual({ status: 'unmeasured' });
  });

  it('ignores ordinary food', () => {
    expect(drinkFluid(log('Chicken breast', 150, 'g'))).toEqual({ status: 'not-a-drink' });
  });
});
