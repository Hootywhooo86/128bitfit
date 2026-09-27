import { describe, expect, it } from 'vitest';
import { PLATES, countPlates, platesFor, warmupSets } from './plates';

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
