import { describe, expect, it } from 'vitest';
import { amountText, parseAmount } from './amount';

describe('parseAmount', () => {
  it('turns weights into grams', () => {
    expect(parseAmount('500 g', 'pasta').grams).toBe(500);
    expect(parseAmount('1½ lb', 'beef').grams).toBe(680.4);
    expect(parseAmount('1 1/2 kg', 'flour').grams).toBe(1500);
    expect(parseAmount('8 oz', 'cheese').grams).toBe(226.8);
  });

  it('converts a volume only where the density is known', () => {
    expect(parseAmount('1 cup', 'milk').grams).toBe(236.6);
    expect(parseAmount('2 tbsp', 'olive oil').grams).toBe(27.2);
    expect(parseAmount('1 cup', 'all-purpose flour').grams).toBe(120);
    // No density for chopped onion: no grams, so the AI is asked and says it is estimating.
    expect(parseAmount('1 cup', 'chopped onion').grams).toBeNull();
  });

  it('leaves counts without a weight', () => {
    const a = parseAmount('2', 'chicken breasts');
    expect(a).toMatchObject({ quantity: 2, unit: null, grams: null, negligible: false });
    expect(parseAmount('2-3 cloves', 'garlic')).toMatchObject({ quantity: 2.5, unit: 'clove', grams: null });
  });

  it('marks to-taste lines as not counted', () => {
    expect(parseAmount('to taste', 'salt').negligible).toBe(true);
    expect(parseAmount(null, 'basil, for garnish').negligible).toBe(true);
    expect(parseAmount('1 pinch', 'salt').negligible).toBe(true);
    expect(parseAmount('1 cup', 'milk').negligible).toBe(false);
  });

  it('rebuilds an amount from bitrecipe fields', () => {
    expect(amountText({ qty: 2, unit: 'tbsp', item: 'butter' })).toBe('2 tbsp');
    expect(amountText({ qty: 2, qty2: 3, unit: 'clove', item: 'garlic' })).toBe('2-3 clove');
    expect(amountText({ qty: 2, item: 'eggs' })).toBe('2');
    expect(amountText({ qty: null, item: 'salt', loose: 'to taste' })).toBe('to taste');
    expect(amountText({ qty: null, item: 'vanilla', missing: true })).toBeNull();
  });
});

describe('parseAmount, salt', () => {
  it('weighs a teaspoon of salt but not of salted butter', () => {
    expect(parseAmount('1 tsp', 'salt').grams).toBe(5.9);
    expect(parseAmount('1 tsp', 'kosher salt').grams).toBe(5.9);
    expect(parseAmount('1 tbsp', 'salted butter').grams).toBe(14.2);
  });
});
