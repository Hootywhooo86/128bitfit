import { describe, expect, it } from 'vitest';
import {
  applyAiLines,
  buildRecipe,
  describeBuilt,
  lineSourceLabel,
  lineState,
  linesNeedingAi,
  toLine,
  type DbMatch,
  type Line,
} from './build';

const butter: DbMatch = { id: 'b', name: 'Butter, without salt', per100: { calories: 717, protein: 0.9, fat: 81, carb: 0.1 } };
const chicken: DbMatch = { id: 'c', name: 'Chicken, breast, boneless, skinless, raw', per100: { calories: 120, protein: 22.5, fat: 2.6, carb: 0 } };

const line = (ing: Parameters<typeof toLine>[0], match: DbMatch | null = null): Line => ({ ...toLine(ing)!, match });

describe('line states', () => {
  it('counts a weighed database food as measured', () => {
    const l = line({ qty: 100, unit: 'g', item: 'butter' }, butter);
    expect(lineState(l)).toBe('database');
    expect(lineSourceLabel(l)).toBe('USDA: Butter, without salt · 100 g');
  });

  it('needs the AI for a database food with no weight, then uses USDA figures × its weight', () => {
    const l = line({ qty: 2, item: 'chicken breasts' }, chicken);
    expect(lineState(l)).toBe('needs-ai');
    const [done] = applyAiLines([l], [0], [{ line: 1, grams: 400, calories: 999, protein: 1, fat: 1, carb: 1 }]);
    expect(lineState(done)).toBe('database-ai-weight');
    expect(lineSourceLabel(done)).toBe('USDA: Chicken, breast, boneless, skinless, raw · 400 g (weight estimated)');
    // 120 kcal/100 g × 400 g — the database figure, not the AI's 999.
    expect(buildRecipe([done], 1, 'per_serving').panel?.calories).toBe(480);
  });

  it('does not count to-taste lines, and says so', () => {
    const l = line({ qty: null, item: 'salt', loose: 'to taste' });
    expect(lineState(l)).toBe('negligible');
    expect(linesNeedingAi([l])).toEqual([]);
  });

  it('asks the AI for a database food that has no calorie figure', () => {
    const blank: DbMatch = { id: 'x', name: 'Mystery', per100: { calories: null, protein: null, fat: null, carb: null } };
    expect(lineState(line({ qty: 50, unit: 'g', item: 'mystery' }, blank))).toBe('needs-ai');
  });
});

describe('buildRecipe', () => {
  it('will not total a recipe while a line is waiting', () => {
    const lines = [line({ qty: 100, unit: 'g', item: 'butter' }, butter), line({ qty: 1, unit: 'packet', item: 'taco seasoning' })];
    const b = buildRecipe(lines, 4, 'per_serving');
    expect(b.ready).toBe(false);
    expect(b.waiting).toBe(1);
    expect(b.panel).toBeNull();
    expect(b.panelProblem).toBe('1 ingredient still needs figures.');
  });

  it('can leave a line out to save without it', () => {
    const lines = [line({ qty: 100, unit: 'g', item: 'butter' }, butter), { ...line({ qty: 1, unit: 'packet', item: 'taco seasoning' }), excluded: true }];
    const b = buildRecipe(lines, 4, 'per_serving');
    expect(b.ready).toBe(true);
    expect(b.estimated).toBe(false);
    expect(b.panel).toMatchObject({ calories: 179, protein: 0.2, fat: 20.3 });
  });

  it('gives per 100 g from the ingredient weight, or the finished weight when known', () => {
    const lines = [line({ qty: 100, unit: 'g', item: 'butter' }, butter), line({ qty: 300, unit: 'g', item: 'chicken breast' }, chicken)];
    // 717 + 360 = 1077 kcal over 400 g.
    expect(buildRecipe(lines, 2, 'per_100g').panel?.calories).toBe(269);
    // Cooked down to 300 g: the same food, denser.
    expect(buildRecipe(lines, 2, 'per_100g', 300).panel?.calories).toBe(359);
  });

  it('needs a weight for per 100 g when an AI line has none', () => {
    const l = applyAiLines([line({ qty: 1, item: 'mystery sauce' })], [0], [{ line: 1, grams: null, calories: 100, protein: null, fat: null, carb: null }]);
    const b = buildRecipe(l, 1, 'per_100g');
    expect(b.panel).toBeNull();
    expect(b.panelProblem).toBe('Per 100 g needs the weight of the finished dish.');
    expect(buildRecipe(l, 1, 'per_100g', 200).panel?.calories).toBe(50);
  });

  it('marks AI figures as estimated and keeps unknown macros unknown', () => {
    const l = applyAiLines([line({ qty: 1, item: 'sauce' })], [0], [{ line: 1, grams: 50, calories: 80, protein: null, fat: 2, carb: 10 }]);
    const b = buildRecipe(l, 2, 'per_serving');
    expect(b.estimated).toBe(true);
    expect(b.panel).toMatchObject({ calories: 40, protein: null, fat: 1, carb: 5 });
    expect(b.panel?.partial.protein).toBe(true);
  });

  it('maps numbered AI answers back to the lines that were asked', () => {
    const lines = [
      line({ qty: 100, unit: 'g', item: 'butter' }, butter),
      line({ qty: 1, item: 'onion' }),
      line({ qty: 1, item: 'lime' }),
    ];
    const asked = linesNeedingAi(lines);
    expect(asked).toEqual([1, 2]);
    const done = applyAiLines(lines, asked, [
      { line: 2, grams: 67, calories: 20, protein: 0.5, fat: 0.1, carb: 7 },
      { line: 1, grams: 110, calories: 44, protein: 1.2, fat: 0.1, carb: 10 },
      { line: 9, grams: 1, calories: 1, protein: 0, fat: 0, carb: 0 },
    ]);
    expect(done[1].ai?.grams).toBe(110);
    expect(done[2].ai?.grams).toBe(67);
    expect(linesNeedingAi(done)).toEqual([]);
  });
});

describe('describeBuilt', () => {
  it('records where every figure came from', () => {
    const lines = [line({ qty: 100, unit: 'g', item: 'butter', raw: '100 g butter' }, butter), line({ qty: null, item: 'salt', loose: 'to taste', raw: 'salt, to taste' })];
    expect(describeBuilt(lines, 4)).toBe(
      'From bitrecipe — makes 4 servings.\n100 g butter — USDA: Butter, without salt · 100 g\nsalt, to taste — Not counted (to taste)'
    );
  });
});
