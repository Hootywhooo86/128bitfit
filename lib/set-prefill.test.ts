import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHT_UNIT,
  describeLastPerformance,
  describePrefill,
  seedForNewSet,
  prefillForIndex,
  resolveSetSeed,
  type LastPerformance,
} from './set-prefill';

const lastWeek: LastPerformance = {
  performedAt: new Date(Date.UTC(2026, 8, 14)),
  sets: [
    { reps: 8, weight: 135, weightUnit: 'lb' },
    { reps: 8, weight: 135, weightUnit: 'lb' },
    { reps: 6, weight: 145, weightUnit: 'lb' },
  ],
};

describe('picking the template for a set', () => {
  it('matches set for set', () => {
    expect(prefillForIndex(lastWeek, 0)?.weight).toBe(135);
    expect(prefillForIndex(lastWeek, 2)?.weight).toBe(145);
  });

  it('reuses the final set when today has more sets than last time', () => {
    expect(prefillForIndex(lastWeek, 3)?.weight).toBe(145);
    expect(prefillForIndex(lastWeek, 9)?.weight).toBe(145);
  });

  it('has nothing to offer with no history', () => {
    expect(prefillForIndex(null, 0)).toBeNull();
    expect(prefillForIndex({ performedAt: new Date(), sets: [] }, 0)).toBeNull();
  });

  it('refuses a negative index rather than reading from the end', () => {
    expect(prefillForIndex(lastWeek, -1)).toBeNull();
  });
});

describe('seeding a new set', () => {
  it('pre-fills the weight from last time — the whole point', () => {
    expect(resolveSetSeed({ last: lastWeek, index: 0 }).weight).toBe(135);
  });

  it('carries the unit the user actually logged in', () => {
    const kg: LastPerformance = {
      performedAt: new Date(),
      sets: [{ reps: 5, weight: 60, weightUnit: 'kg' }],
    };
    expect(resolveSetSeed({ last: kg, index: 0 }).weightUnit).toBe('kg');
  });

  it("lets the routine's target reps win over last week's reps", () => {
    const seed = resolveSetSeed({ last: lastWeek, index: 0, targetReps: 5 });
    expect(seed.reps).toBe(5);
    // ...but the weight still comes from history, since routines never carry one.
    expect(seed.weight).toBe(135);
  });

  it('falls back to last week when the routine has no target', () => {
    expect(resolveSetSeed({ last: lastWeek, index: 0, targetReps: null }).reps).toBe(8);
  });

  it('prefers the previous set in this session over both', () => {
    const seed = resolveSetSeed({
      last: lastWeek,
      index: 1,
      targetReps: 5,
      carryFrom: { reps: 10, weight: 155, weightUnit: 'lb' },
    });
    expect(seed).toMatchObject({ reps: 10, weight: 155, weightUnit: 'lb' });
  });

  it('produces an empty set for a first-ever exercise', () => {
    expect(resolveSetSeed({ last: null, index: 0 })).toMatchObject({
      reps: null,
      weight: null,
      weightUnit: DEFAULT_WEIGHT_UNIT,
    });
  });

  it('keeps a target of zero rather than treating it as absent', () => {
    expect(resolveSetSeed({ last: lastWeek, index: 0, targetReps: 0 }).reps).toBe(0);
  });

  it('keeps a bodyweight entry of zero weight', () => {
    const bodyweight: LastPerformance = {
      performedAt: new Date(),
      sets: [{ reps: 12, weight: 0, weightUnit: 'lb' }],
    };
    expect(resolveSetSeed({ last: bodyweight, index: 0 }).weight).toBe(0);
  });
});

describe('describing where the number came from', () => {
  it('shows weight and reps together', () => {
    expect(describePrefill({ reps: 8, weight: 135, weightUnit: 'lb' })).toBe('135 lb × 8');
  });

  it('handles a weight-only or reps-only history', () => {
    expect(describePrefill({ reps: null, weight: 135, weightUnit: 'kg' })).toBe('135 kg');
    expect(describePrefill({ reps: 12, weight: null, weightUnit: null })).toBe('12 reps');
  });

  it('says nothing when there is nothing to say', () => {
    expect(describePrefill(null)).toBeNull();
    expect(describePrefill({ reps: null, weight: null, weightUnit: 'lb' })).toBeNull();
  });

  it('describes a bodyweight set as 0, not as missing', () => {
    expect(describePrefill({ reps: 12, weight: 0, weightUnit: 'lb' })).toBe('0 lb × 12');
  });
});

describe('describing a whole previous session', () => {
  it('lists the sets with a shared unit', () => {
    expect(describeLastPerformance(lastWeek)).toBe('135×8, 135×8, 145×6 lb');
  });

  it('truncates a long session rather than wrapping', () => {
    const many: LastPerformance = {
      performedAt: new Date(),
      sets: Array.from({ length: 6 }, () => ({ reps: 5, weight: 100, weightUnit: 'lb' })),
    };
    expect(describeLastPerformance(many, 2)).toBe('100×5, 100×5... lb');
  });

  it('omits the unit when sets disagree, rather than picking one', () => {
    const mixed: LastPerformance = {
      performedAt: new Date(),
      sets: [
        { reps: 5, weight: 100, weightUnit: 'lb' },
        { reps: 5, weight: 45, weightUnit: 'kg' },
      ],
    };
    expect(describeLastPerformance(mixed)).toBe('100×5, 45×5');
  });

  it('handles bodyweight sets with no weight', () => {
    const bw: LastPerformance = {
      performedAt: new Date(),
      sets: [{ reps: 12, weight: null, weightUnit: null }],
    };
    expect(describeLastPerformance(bw)).toBe('12 reps');
  });

  it('says nothing without history', () => {
    expect(describeLastPerformance(null)).toBeNull();
    expect(describeLastPerformance({ performedAt: new Date(), sets: [] })).toBeNull();
  });
});

describe('seeding a set added mid-session', () => {
  const last = {
    performedAt: new Date(2026, 8, 20),
    sets: [
      { reps: 8, weight: 135, weightUnit: 'lb' },
      { reps: 8, weight: 140, weightUnit: 'lb' },
      { reps: 6, weight: 145, weightUnit: 'lb' },
    ],
  };
  const warm = (weight: number, reps = 5) => ({ reps, weight, weightUnit: 'lb', isWarmup: true, setType: 'normal' as const });
  const work = (weight: number, reps = 8) => ({ reps, weight, weightUnit: 'lb', isWarmup: false, setType: 'normal' as const });

  it('starts working set 1 from last week’s set 1, however many warm-ups came first', () => {
    const seed = seedForNewSet({ kind: 'working', block: [warm(45), warm(95)], last });
    expect(seed).toMatchObject({ reps: 8, weight: 135, weightUnit: 'lb' });
  });

  it('carries a working set from the working set before it, never from a warm-up', () => {
    const seed = seedForNewSet({ kind: 'working', block: [work(135), warm(95)], last });
    expect(seed.weight).toBe(135);
  });

  it('starts the first warm-up blank rather than at the working weight', () => {
    expect(seedForNewSet({ kind: 'warmup', block: [], last })).toMatchObject({ reps: null, weight: null, weightUnit: 'lb' });
  });

  it('carries a warm-up from the warm-up before it', () => {
    expect(seedForNewSet({ kind: 'warmup', block: [warm(45, 10)], last }).weight).toBe(45);
  });

  it('starts a drop set from the set it follows', () => {
    const seed = seedForNewSet({ kind: 'drop', block: [work(135), work(145, 6)], last });
    expect(seed).toMatchObject({ reps: 6, weight: 145, weightUnit: 'lb' });
  });

  it('does not count a drop set as a working set for position', () => {
    const drop = { ...work(100, 10), setType: 'drop' as const };
    const seed = seedForNewSet({ kind: 'working', block: [work(135), drop], last });
    // Second working set: carries from the working set, not the drop.
    expect(seed.weight).toBe(135);
  });
});
