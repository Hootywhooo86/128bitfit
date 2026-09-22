import { describe, expect, it } from 'vitest';
import { parseAiFood, totalsOf, type AiFoodItem } from './ai-food';

const REPLY = JSON.stringify({
  items: [
    { name: 'Egg, large', portion: '3 eggs', calories: 234, protein: 19, fat: 16, carb: 1 },
    { name: 'Toast, wholemeal', portion: '2 slices', calories: 160, protein: 6, fat: 2, carb: 28 },
    { name: 'Cottage cheese', portion: '50 g', calories: 49, protein: 6, fat: 2, carb: 2 },
  ],
  note: 'Portion sizes assumed standard.',
});

describe('reading a model reply', () => {
  it('parses the items', () => {
    const r = parseAiFood(REPLY, new Date(2026, 8, 22, 8, 0));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toEqual({
      name: 'Egg, large',
      portion: '3 eggs',
      calories: 234,
      protein: 19,
      fat: 16,
      carb: 1,
      estimated: true,
    });
    expect(r.note).toBe('Portion sizes assumed standard.');
  });

  it('marks every item as an estimate', () => {
    const r = parseAiFood(REPLY);
    if (r.status !== 'ok') throw new Error('expected ok');
    // Nothing downstream may treat these as measurements.
    expect(r.items.every((i) => i.estimated === true)).toBe(true);
  });

  it('picks the meal from the time of day', () => {
    const morning = parseAiFood(REPLY, new Date(2026, 8, 22, 8, 0));
    const evening = parseAiFood(REPLY, new Date(2026, 8, 22, 19, 0));
    if (morning.status !== 'ok' || evening.status !== 'ok') throw new Error('expected ok');
    expect(morning.mealType).toBe('breakfast');
    expect(evening.mealType).toBe('dinner');
  });

  it('strips a markdown fence the model was asked not to add', () => {
    const r = parseAiFood('```json\n' + REPLY + '\n```');
    expect(r.status).toBe('ok');
  });

  it('ignores a sentence before the JSON', () => {
    const r = parseAiFood("Sure! Here's the breakdown:\n" + REPLY);
    expect(r.status).toBe('ok');
  });
});

describe('a number that cannot be trusted is not saved', () => {
  it('drops a row with no calories rather than logging a zero', () => {
    const r = parseAiFood(
      JSON.stringify({ items: [{ name: 'Mystery', portion: '1' }, JSON.parse(REPLY).items[0]] })
    );
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe('Egg, large');
  });

  it('drops a row with no name', () => {
    const r = parseAiFood(JSON.stringify({ items: [{ name: '  ', calories: 200 }] }));
    expect(r.status).toBe('empty');
  });

  it('keeps a macro the model could not estimate as null, not zero', () => {
    const r = parseAiFood(
      JSON.stringify({ items: [{ name: 'Soup', portion: '1 bowl', calories: 150, protein: null }] })
    );
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.items[0].protein).toBeNull();
    expect(r.items[0].calories).toBe(150);
  });

  it('rejects negative and non-numeric values', () => {
    const r = parseAiFood(
      JSON.stringify({
        items: [{ name: 'Odd', portion: '1', calories: 100, protein: -5, fat: 'lots', carb: NaN }],
      })
    );
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.items[0].protein).toBeNull();
    expect(r.items[0].fat).toBeNull();
    expect(r.items[0].carb).toBeNull();
  });

  it('rejects a calorie count no single item could have', () => {
    const r = parseAiFood(JSON.stringify({ items: [{ name: 'Rice', calories: 250000 }] }));
    expect(r.status).toBe('empty');
  });
});

describe('failures say so plainly', () => {
  it('reports unreadable output instead of guessing', () => {
    const r = parseAiFood('I am afraid I cannot help with that.');
    expect(r.status).toBe('unreadable');
    if (r.status !== 'unreadable') return;
    expect(r.message).toMatch(/by hand/);
    expect(r.raw).toContain('cannot help');
  });

  it('reports an unexpected shape', () => {
    expect(parseAiFood(JSON.stringify({ foods: [] })).status).toBe('unreadable');
    expect(parseAiFood(JSON.stringify([1, 2, 3])).status).toBe('unreadable');
  });

  it('passes the model note through when it recognised nothing', () => {
    const r = parseAiFood(JSON.stringify({ items: [], note: 'That photo is a dog.' }));
    expect(r.status).toBe('empty');
    if (r.status !== 'empty') return;
    expect(r.message).toBe('That photo is a dog.');
  });
});

describe('totals', () => {
  const items: AiFoodItem[] = [
    { name: 'a', portion: '1', calories: 100, protein: 10, fat: null, carb: 5, estimated: true },
    { name: 'b', portion: '1', calories: 200, protein: 20, fat: null, carb: null, estimated: true },
  ];

  it('adds what is there', () => {
    expect(totalsOf(items).calories).toBe(300);
    expect(totalsOf(items).protein).toBe(30);
    expect(totalsOf(items).carb).toBe(5);
  });

  it('stays null for a macro nothing supplied, rather than reporting 0 g', () => {
    expect(totalsOf(items).fat).toBeNull();
  });
});
