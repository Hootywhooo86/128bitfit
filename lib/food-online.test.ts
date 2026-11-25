import { describe, expect, it } from 'vitest';
import { cleanBrand, offHitToFood, tidyName, usdaHitToFood } from './food-online';

describe('online food results', () => {
  it('tidies brand tags and shouted names', () => {
    expect(cleanBrand(['xx:green-valley-farms', 'xx:walmart'])).toBe('Green Valley Farms');
    expect(cleanBrand('Kirkland Signature, Costco')).toBe('Kirkland Signature');
    expect(cleanBrand([])).toBeNull();
    expect(tidyName('LARGE WHITE EGGS')).toBe('Large White Eggs');
    expect(tidyName('Greek yogurt 0%')).toBe('Greek yogurt 0%');
  });

  it('maps an Open Food Facts search hit, as the search API returns it', () => {
    const f = offHitToFood({
      code: '0605388288004',
      brands: ['xx:sunny-meadow', 'xx:walmart'],
      serving_size: '1 Egg',
      nutriments: { 'energy-kcal_100g': 140, fat_100g: 10, proteins_100g: 12, carbohydrates_100g: 0, sodium_100g: 0.14 },
      product_name: 'Eggs',
    })!;
    expect(f.kind).toBe('off');
    expect(f.name).toBe('Eggs');
    expect(f.brand).toBe('Sunny Meadow');
    expect(f.caloriesText).toBe('140 kcal / 100 g');
    if (f.kind === 'off') {
      expect(f.off.nutrients.protein).toBe(12);
      expect(f.off.nutrients.sodium).toBeCloseTo(140);
    }
  });

  it('drops a hit with no calories rather than showing a zero', () => {
    expect(offHitToFood({ code: '0026855123435', brands: ['xx:green-valley-farms'], product_name: 'LARGE WHITE EGGS' })).toBeNull();
    expect(usdaHitToFood({ fdcId: 1, description: 'X', foodNutrients: [{ nutrientId: 1003, value: 5 }] })).toBeNull();
  });

  it('maps a USDA branded search hit per 100 g with its serving', () => {
    const f = usdaHitToFood({
      fdcId: 2345678,
      description: 'LARGE BROWN EGGS',
      brandOwner: 'Burnbrae Farms Limited',
      gtinUpc: '062628112345',
      servingSize: 50,
      servingSizeUnit: 'GRM',
      foodNutrients: [
        { nutrientId: 1008, value: 140 },
        { nutrientId: 1003, value: 12 },
        { nutrientId: 1004, value: 10 },
        { nutrientId: 1093, value: 140 },
      ],
    })!;
    expect(f.kind).toBe('usda');
    expect(f.name).toBe('Large Brown Eggs');
    expect(f.brand).toBe('Burnbrae Farms Limited');
    if (f.kind === 'usda') {
      expect(f.usda.nutrients).toMatchObject({ calories: 140, protein: 12, fat: 10, sodium: 140 });
      expect(f.usda.servingSize).toBe(50);
      expect(f.usda.servingUnit).toBe('g');
      expect(f.usda.barcode).toBe('062628112345');
    }
  });
});
