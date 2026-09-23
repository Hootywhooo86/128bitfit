import { describe, expect, it } from 'vitest';
import { describeIngredients, fallbackRecipeName, recipeTotals } from './recipe';

const ing = (
  name: string,
  calories: number,
  protein: number | null,
  fat: number | null,
  carb: number | null
) => ({ name, portion: '100 g', calories, protein, fat, carb });

describe('recipeTotals', () => {
  it('sums a serving', () => {
    const t = recipeTotals([ing('Chicken', 200, 30, 8, 0), ing('Rice', 150, 3, 1, 33)]);
    expect(t).toMatchObject({ calories: 350, protein: 33, fat: 9, carb: 33 });
    expect(t.partial).toEqual({ protein: false, fat: false, carb: false });
  });

  it('treats an unknown macro as unknown, not as zero', () => {
    // Summing null as zero would quietly under-report every recipe with one
    // unrecognised ingredient in it, and present the result as a measurement.
    const t = recipeTotals([ing('Chicken', 200, 30, 8, 0), ing('Sauce', 90, null, 4, 6)]);
    expect(t.protein).toBe(30);
    expect(t.partial.protein).toBe(true);
    expect(t.partial.fat).toBe(false);
  });

  it('leaves a macro null when nothing knew it', () => {
    const t = recipeTotals([ing('Mystery', 100, null, null, null)]);
    expect(t.protein).toBeNull();
    expect(t.fat).toBeNull();
    expect(t.carb).toBeNull();
    expect(t.partial).toEqual({ protein: true, fat: true, carb: true });
  });

  it('has an empty but honest answer for no ingredients', () => {
    const t = recipeTotals([]);
    expect(t.calories).toBe(0);
    expect(t.protein).toBeNull();
    expect(t.partial.protein).toBe(false);
  });

  it('rounds without accumulating drift', () => {
    const t = recipeTotals([ing('A', 100.4, 1.11, 0.55, 2.22), ing('B', 100.4, 1.11, 0.55, 2.22)]);
    expect(t.calories).toBe(201);
    expect(t.protein).toBe(2.2);
  });
});

describe('describeIngredients', () => {
  it('lists what it is made of, and how many servings', () => {
    const text = describeIngredients([ing('Chicken', 200, 30, 8, 0)], 4);
    expect(text).toContain('makes 4');
    expect(text).toContain('Chicken — 100 g');
  });

  it('does not say "makes 1"', () => {
    expect(describeIngredients([ing('Chicken', 200, 30, 8, 0)], 1)).not.toContain('makes');
  });
});

describe('fallbackRecipeName', () => {
  it('names a dish from its ingredients when the model did not', () => {
    expect(fallbackRecipeName([ing('Chicken', 1, 1, 1, 1), ing('Rice', 1, 1, 1, 1)])).toBe(
      'Chicken and Rice'
    );
    expect(
      fallbackRecipeName([ing('Chicken', 1, 1, 1, 1), ing('Rice', 1, 1, 1, 1), ing('Peas', 1, 1, 1, 1)])
    ).toBe('Chicken and 2 more');
  });

  it('falls back to something rather than an empty name', () => {
    expect(fallbackRecipeName([])).toBe('Recipe');
    expect(fallbackRecipeName([ing('  ', 1, 1, 1, 1)])).toBe('Recipe');
  });
});
