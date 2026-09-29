import { describe, expect, it } from 'vitest';
import { optionalNutrientsPerServing, nutrientsPerServing, scaleLoggedPortion } from './nutrition';

function food(nutrients: Record<string, number | null>, over: Partial<{ servingSize: number; nutritionBasis: string }> = {}) {
  return {
    servingSize: over.servingSize ?? 1,
    nutritionBasis: (over.nutritionBasis ?? 'per_serving') as 'per_100g' | 'per_serving',
    nutrients: JSON.stringify(nutrients),
  };
}

describe('optionalNutrientsPerServing', () => {
  it('keeps a recorded zero apart from a nutrient that was never entered', () => {
    const p = optionalNutrientsPerServing(food({ calories: 90, protein: 0, fat: null }));
    expect(p.protein).toBe(0);
    expect(p.fat).toBeNull();
    // The summing helper cannot tell them apart, which is why this exists.
    const summed = nutrientsPerServing(food({ calories: 90, protein: 0, fat: null }));
    expect(summed.fat).toBe(0);
  });

  it('returns null for every macro when the food has no nutrition at all', () => {
    const p = optionalNutrientsPerServing(food({}));
    expect(p).toEqual({ calories: null, protein: null, fat: null, carb: null });
  });

  it('scales per_100g figures by the serving size and leaves nulls alone', () => {
    const p = optionalNutrientsPerServing(
      food({ calories: 200, protein: 10, carb: null }, { servingSize: 50, nutritionBasis: 'per_100g' })
    );
    expect(p.calories).toBe(100);
    expect(p.protein).toBe(5);
    expect(p.carb).toBeNull();
  });

  it('does not scale a per_serving food', () => {
    const p = optionalNutrientsPerServing(
      food({ calories: 200 }, { servingSize: 50, nutritionBasis: 'per_serving' })
    );
    expect(p.calories).toBe(200);
  });

  it('treats a non-finite stored value as missing, not as a number', () => {
    const p = optionalNutrientsPerServing({
      servingSize: 1,
      nutritionBasis: 'per_serving',
      nutrients: '{"calories":"120","protein":null}',
    } as never);
    expect(p.calories).toBeNull();
    expect(p.protein).toBeNull();
  });
});

describe('logging a past meal again', () => {
  const meal = { servings: 1.5, calories: 650, protein: 40, fat: null, carb: 70 };

  it('is the same meal at 1 portion', () => {
    expect(scaleLoggedPortion(meal, 1)).toEqual(meal);
  });

  it('scales what is known and keeps unknown unknown', () => {
    expect(scaleLoggedPortion(meal, 0.5)).toEqual({ servings: 0.75, calories: 325, protein: 20, fat: null, carb: 35 });
  });

  it('is nothing for a nonsense amount', () => {
    expect(scaleLoggedPortion(meal, Number.NaN).calories).toBe(0);
  });
});
