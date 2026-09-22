import { describe, expect, it } from 'vitest';
import { describeReading, parseNutritionLabel } from './nutrition-label';

/** A US Nutrition Facts panel as ML Kit reads it: one line per visual row. */
const US_PANEL = `
Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%
`;

describe('reading a nutrition panel', () => {
  const r = parseNutritionLabel(US_PANEL);

  it('reads the amounts, not the % daily value column', () => {
    expect(r.fields).toEqual({
      calories: 230,
      fat: 8,
      saturatedFat: 1,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      carb: 37,
      fiber: 4,
      sugars: 12,
      addedSugars: 10,
      protein: 3,
    });
  });

  it('reads the serving size and count', () => {
    expect(r.servingSize).toBe(55);
    expect(r.servingUnit).toBe('g');
    expect(r.servingsPerContainer).toBe(8);
  });

  it('does not let a general row swallow a specific one', () => {
    // "Saturated Fat 1g" must not be read as fat, and "Added Sugars 10g" must
    // not be read as sugars.
    expect(r.fields.fat).toBe(8);
    expect(r.fields.saturatedFat).toBe(1);
    expect(r.fields.sugars).toBe(12);
    expect(r.fields.addedSugars).toBe(10);
  });
});

describe('a number that cannot be read stays missing', () => {
  it('never defaults a missing row to zero', () => {
    const r = parseNutritionLabel('Calories 150\nProtein 9g');
    expect(r.fields.calories).toBe(150);
    expect(r.fields.protein).toBe(9);
    // Not on the label at all.
    expect(r.fields.fiber).toBeUndefined();
    expect(r.fields.sodium).toBeUndefined();
    expect('fiber' in r.fields).toBe(false);
  });

  it('distinguishes a stated zero from an unread row', () => {
    const stated = parseNutritionLabel('Trans Fat 0g');
    expect(stated.fields.transFat).toBe(0);

    const smudged = parseNutritionLabel('Trans Fat --g');
    expect(smudged.fields.transFat).toBeUndefined();
    expect(smudged.unread).toContain('Trans Fat --g');
  });

  it('reports a row it recognised but could not read a number from', () => {
    const r = parseNutritionLabel('Sodium ???mg 7%');
    expect(r.fields.sodium).toBeUndefined();
    expect(r.unread).toEqual(['Sodium ???mg 7%']);
  });

  it('does not take a % daily value as the amount', () => {
    // Some panels print only the percentage for a row.
    const r = parseNutritionLabel('Calcium 20%\nIron 45%\nSodium 7%');
    expect(r.fields.sodium).toBeUndefined();
    expect(r.unread).toContain('Sodium 7%');
  });

  it('does not read a reference amount out of a %DV row', () => {
    // "7% of 2300mg" would otherwise read as 2300 mg of sodium — a number that
    // is on the label but is not this food's amount.
    const r = parseNutritionLabel('Sodium 7% of 2300');
    expect(r.fields.sodium).toBeUndefined();
    expect(r.unread).toContain('Sodium 7% of 2300');
  });
});

describe('units', () => {
  it('keeps sodium and cholesterol in milligrams', () => {
    const r = parseNutritionLabel('Sodium 160mg\nCholesterol 30mg');
    expect(r.fields.sodium).toBe(160);
    expect(r.fields.cholesterol).toBe(30);
  });

  it('converts a sodium row printed in grams', () => {
    // European panels state salt in grams.
    const r = parseNutritionLabel('Sodium 1.2g');
    expect(r.fields.sodium).toBe(1200);
  });

  it('converts a gram-field row printed in milligrams', () => {
    const r = parseNutritionLabel('Protein 500mg');
    expect(r.fields.protein).toBe(0.5);
  });

  it('accepts a decimal comma', () => {
    const r = parseNutritionLabel('Total Fat 0,5g');
    expect(r.fields.fat).toBe(0.5);
  });
});

describe('serving size', () => {
  it('prefers the gram weight in parentheses over the household measure', () => {
    const r = parseNutritionLabel('Serving size 2/3 cup (55g)');
    expect(r.servingSize).toBe(55);
    expect(r.servingUnit).toBe('g');
  });

  it('reads a serving size with no parenthetical', () => {
    const r = parseNutritionLabel('Serving Size: 100 g');
    expect(r.servingSize).toBe(100);
    expect(r.servingUnit).toBe('g');
  });

  it('reads millilitres', () => {
    const r = parseNutritionLabel('Serving size 1 bottle (500ml)');
    expect(r.servingSize).toBe(500);
    expect(r.servingUnit).toBe('ml');
  });

  it('leaves the serving unknown rather than assuming one', () => {
    const r = parseNutritionLabel('Calories 100');
    expect(r.servingSize).toBeNull();
    expect(r.servingUnit).toBeNull();
    expect(r.servingsPerContainer).toBeNull();
  });
});

describe('panel quirks', () => {
  it('takes the per-serving column when a label prints two', () => {
    // Per serving first, per container second — first match wins.
    const r = parseNutritionLabel('Calories 230\nCalories 1840');
    expect(r.fields.calories).toBe(230);
  });

  it('handles a label written in lower case', () => {
    const r = parseNutritionLabel('total fat 8g\nprotein 3g');
    expect(r.fields.fat).toBe(8);
    expect(r.fields.protein).toBe(3);
  });

  it('reads an energy row labelled kcal', () => {
    const r = parseNutritionLabel('Energy 230 kcal');
    expect(r.fields.calories).toBe(230);
  });

  it('ignores lines that are not nutrition rows', () => {
    const r = parseNutritionLabel(
      'ACME BRAND OATS\nBest before 09/2027\nINGREDIENTS: OATS, SUGAR\nProtein 5g'
    );
    expect(r.fields).toEqual({ protein: 5 });
    expect(r.unread).toEqual([]);
  });

  it('returns nothing at all for text with no panel in it', () => {
    const r = parseNutritionLabel('hello world\n12345');
    expect(r.fields).toEqual({});
    expect(r.servingSize).toBeNull();
  });
});

describe('describeReading', () => {
  it('names what is still missing so the screen can say so', () => {
    const d = describeReading(parseNutritionLabel('Calories 100\nProtein 5g'));
    expect(d.read).toBe(2);
    expect(d.missing).toContain('fiber');
    expect(d.missing).toContain('sodium');
    expect(d.missing).not.toContain('calories');
  });
});
