import { describe, expect, it } from 'vitest';
import { PLATES, countPlates, plateHint, platesFor, warmupSets } from './plates';

describe('plate calculator', () => {
  it('loads 185 on a 45 bar as a 45 and a 25 per side', () => {
    const r = platesFor(185, 45, PLATES.lb);
    expect(r).toEqual({ status: 'ok', perSide: [45, 25], perSideWeight: 70, loaded: 185, shortPerSide: 0 });
  });

  it('says how far short when the target cannot be loaded exactly', () => {
    const r = platesFor(188, 45, PLATES.lb);
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.loaded).toBe(185);
    expect(r.shortPerSide).toBe(1.5);
  });

  it('handles kilos and fractional plates', () => {
    const r = platesFor(102.5, 20, PLATES.kg);
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.perSide).toEqual([25, 15, 1.25]);
    expect(r.loaded).toBe(102.5);
  });

  it('refuses a target below the bar rather than loading negative plates', () => {
    expect(platesFor(30, 45, PLATES.lb)).toEqual({ status: 'below-bar' });
  });

  it('is the bar alone at exactly the bar weight', () => {
    expect(platesFor(45, 45, PLATES.lb)).toMatchObject({ perSide: [], loaded: 45 });
  });

  it('groups plates for the legend', () => {
    expect(countPlates([45, 45, 10, 2.5])).toEqual([
      { plate: 45, count: 2 },
      { plate: 10, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
  });
});

describe('warm-up ramp', () => {
  it('ramps to the working weight in rounded steps', () => {
    expect(warmupSets(185, 'lb').map((s) => s.weight)).toEqual([75, 110, 140, 160, 185]);
  });

  it('never goes below the empty bar', () => {
    expect(warmupSets(65, 'lb')[0].weight).toBe(45);
  });

  it('rounds to 2.5 kg in kilos', () => {
    expect(warmupSets(100, 'kg').map((s) => s.weight)).toEqual([40, 60, 75, 87.5, 100]);
  });
});

describe('the plate hint in a live workout', () => {
  it('lists each side heaviest first on a standard bar', () => {
    expect(plateHint(225, 'lb')).toBe('Per side: 45 + 45 (45 lb bar)');
    expect(plateHint(160, 'lb')).toBe('Per side: 45 + 10 + 2.5 (45 lb bar)');
    expect(plateHint(100, 'kg')).toBe('Per side: 25 + 15 (20 kg bar)');
  });

  it('says bar only at the bar weight', () => {
    expect(plateHint(45, 'lb')).toBe('Bar only (45 lb)');
  });

  it('says so when the weight cannot be loaded exactly', () => {
    expect(plateHint(137, 'lb')).toMatch(/closest to 137 is 135 lb/);
  });

  it('shows nothing below the bar or with no weight', () => {
    expect(plateHint(30, 'lb')).toBeNull();
    expect(plateHint(null, 'lb')).toBeNull();
    expect(plateHint(0, 'kg')).toBeNull();
  });
});
