import { describe, expect, it } from 'vitest';
import { emptyTally, topTrained, type MuscleTally } from './muscle-load';

function tally(vals: Partial<Record<string, number>>): MuscleTally {
  const t = emptyTally();
  for (const [k, v] of Object.entries(vals)) (t as Record<string, number>)[k] = v as number;
  return t;
}

describe('the top-trained strip on Home', () => {
  it('ranks hardest first', () => {
    const t = topTrained(tally({ chest: 9, lats: 11, triceps: 12 }));
    expect(t.map((x) => x.muscle)).toEqual(['triceps', 'lats', 'chest']);
  });

  it('shows at most the limit', () => {
    const t = topTrained(
      tally({ chest: 9, lats: 11, triceps: 12, biceps: 8, quadriceps: 7, calves: 6, glutes: 5 }),
      6
    );
    expect(t).toHaveLength(6);
    expect(t.map((x) => x.muscle)).not.toContain('glutes');
  });

  it('never lists an untrained muscle among the most trained', () => {
    const t = topTrained(tally({ chest: 4 }), 6);
    expect(t).toHaveLength(1);
    expect(t[0].muscle).toBe('chest');
  });

  it('is empty when nothing has been trained, rather than six zeroes', () => {
    expect(topTrained(emptyTally())).toEqual([]);
  });

  it('carries the load level, which is the only colour the app allows', () => {
    const t = topTrained(tally({ chest: 2, lats: 5, triceps: 9 }));
    expect(t.find((x) => x.muscle === 'chest')!.level).toBe('light');
    expect(t.find((x) => x.muscle === 'lats')!.level).toBe('medium');
    expect(t.find((x) => x.muscle === 'triceps')!.level).toBe('heavy');
  });

  it('keeps all seventeen groups available, not six merged buckets', () => {
    const wide = tally({
      chest: 1, lats: 2, triceps: 3, biceps: 4, quadriceps: 5, calves: 6,
      glutes: 7, hamstrings: 8, traps: 9, shoulders: 10,
    });
    expect(topTrained(wide, 20)).toHaveLength(10);
  });

  it('breaks ties by name so the strip does not reshuffle between renders', () => {
    const a = topTrained(tally({ chest: 5, biceps: 5 }));
    const b = topTrained(tally({ biceps: 5, chest: 5 }));
    expect(a.map((x) => x.muscle)).toEqual(b.map((x) => x.muscle));
  });

  it('returns nothing for a nonsense limit rather than throwing', () => {
    // Several trained muscles on purpose: with only one, slice(0, -1) also
    // yields [] and a missing guard would pass by coincidence.
    const many = tally({ chest: 5, lats: 4, triceps: 3, biceps: 2 });
    expect(topTrained(many, 0)).toEqual([]);
    expect(topTrained(many, -1)).toEqual([]);
    expect(topTrained(many, Number.NaN)).toEqual([]);
  });
});
