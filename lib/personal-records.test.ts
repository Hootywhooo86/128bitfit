import { describe, expect, it } from 'vitest';
import {
  estimateOneRepMax,
  livePr,
  NO_RECORD,
  prFor,
  recordFrom,
  type RecordSet,
} from './personal-records';

const lb = (weight: number | null, reps: number | null): RecordSet => ({
  weight,
  reps,
  unit: 'lb',
});

describe('estimateOneRepMax', () => {
  it('applies Epley', () => {
    // 205 × 5 → 205 × (1 + 5/30) = 239.2
    expect(estimateOneRepMax(205, 5)).toBe(239.2);
    expect(estimateOneRepMax(100, 1)).toBe(103.3);
  });

  it('refuses past twelve reps rather than inventing a number', () => {
    // Epley is fitted to low-rep work. A set of twenty would "estimate" a lift
    // nobody could make, and a fictional number to chase is worse than none.
    expect(estimateOneRepMax(100, 12)).not.toBeNull();
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(100, 20)).toBeNull();
  });

  it('has no opinion on a set with no load or no reps', () => {
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(100, null)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
  });
});

describe('recordFrom', () => {
  it('finds the heaviest and the best estimate separately', () => {
    // 135×10 estimates higher (180) than 185×1 does (191.2)... check which.
    const r = recordFrom([lb(135, 10), lb(185, 1), lb(155, 5)]);
    expect(r.heaviest?.weight).toBe(185);
    // 185×1 → 191.2, 155×5 → 180.8, 135×10 → 180. The single wins here.
    expect(r.bestEstimate?.oneRepMax).toBe(191.2);
  });

  it('can rate a lighter set above a heavier one', () => {
    // The whole point of tracking both. 250×1 estimates 258.3; 200×10
    // estimates 266.7 — so the lighter set is the better one, and the heavier
    // lift is still the heavier lift. Neither reading is wrong, which is why
    // they are two records and not one.
    const r = recordFrom([lb(250, 1), lb(200, 10)]);
    expect(r.heaviest?.weight).toBe(250);
    expect(r.bestEstimate?.weight).toBe(200);
    expect(r.bestEstimate?.oneRepMax).toBe(266.7);
  });

  it('ignores sets with no load or no reps', () => {
    expect(recordFrom([lb(null, 5), lb(100, null), lb(0, 5)])).toEqual(NO_RECORD);
  });

  it('has no record at all from nothing', () => {
    expect(recordFrom([])).toEqual(NO_RECORD);
  });
});

describe('prFor', () => {
  const previous = recordFrom([lb(200, 5)]); // heaviest 200, estimate 233.3

  it('awards a weight PR for a heavier lift', () => {
    const r = prFor(lb(205, 5), previous);
    expect(r.kinds).toContain('weight');
    expect(r.note).toBe('Heaviest 205 lb yet — up 5 lb');
  });

  it('awards an estimate PR for more reps at the same weight', () => {
    // Not heavier, but a better set. The weight is not a record; the effort is.
    const r = prFor(lb(200, 7), previous);
    expect(r.kinds).toEqual(['estimate']);
    expect(r.note).toContain('estimated 1RM');
    expect(r.note).not.toContain('Heaviest');
  });

  it('does not award anything for matching the record', () => {
    // Equalling is not beating. A trophy for it would cheapen the real ones.
    expect(prFor(lb(200, 5), previous).kinds).toEqual([]);
    expect(prFor(lb(200, 5), previous).note).toBeNull();
  });

  it('does not award anything for a worse set', () => {
    expect(prFor(lb(150, 5), previous).kinds).toEqual([]);
  });

  it('gives the first ever set of an exercise no trophy', () => {
    // True that it is the best so far, but the trophy means nothing and an
    // import would produce a wall of them.
    expect(prFor(lb(200, 5), NO_RECORD).kinds).toEqual([]);
  });

  it('judges each record on its own, when only one of them exists', () => {
    // recordFrom never produces this, but each comparison stands alone: with
    // an estimate to beat and no heaviest, beating the estimate is a record and
    // the weight simply has nothing to be measured against.
    const lopsided = {
      heaviest: null,
      bestEstimate: { weight: 100, reps: 5, unit: 'lb' as const, oneRepMax: 116.7 },
    };
    expect(prFor(lb(500, 5), lopsided).kinds).toEqual(['estimate']);
  });

  it('never compares across units', () => {
    // The number has to be one that *would* win if units were ignored, or the
    // test passes for the wrong reason: 300 beats the 200 lb record on the
    // bare figure, and 300 kg against a 200 lb record is not a comparison at
    // all. Claiming a PR here would invent one every time the user switched
    // the setting.
    const kg = { weight: 300, reps: 5, unit: 'kg' as const };
    expect(prFor(kg, previous).kinds).toEqual([]);
  });

  it('ignores a set with no load', () => {
    expect(prFor(lb(null, 5), previous).kinds).toEqual([]);
    expect(prFor(lb(205, null), previous).kinds).toEqual([]);
  });

  it('can award both kinds at once', () => {
    const r = prFor(lb(210, 6), previous);
    expect(r.kinds).toEqual(['weight', 'estimate']);
    // The heavier fact leads; the estimate is the supporting detail.
    expect(r.note).toContain('Heaviest');
  });

  it('gives a high-rep set no estimate PR, since there is no estimate', () => {
    const r = prFor(lb(100, 25), recordFrom([lb(95, 5)]));
    expect(r.kinds).toEqual(['weight']);
  });
});

describe('livePr — the trophy on a set just ticked', () => {
  const lb = (weight: number, reps: number) => ({ weight, reps, unit: 'lb' as const });
  const history = [lb(200, 5), lb(190, 8)];

  it('awards one when the set beats every earlier session', () => {
    expect(livePr(lb(205, 5), history, []).kinds).toContain('weight');
  });

  it('awards another when a later set today beats the first record', () => {
    expect(livePr(lb(210, 3), history, [lb(205, 5)]).kinds).toContain('weight');
  });

  it('does not award one for a set that only beats history but not an earlier set today', () => {
    expect(livePr(lb(202, 1), history, [lb(205, 5)]).kinds).toEqual([]);
  });

  it('never awards one on the first session of an exercise', () => {
    expect(livePr(lb(135, 5), [], [lb(95, 8)]).kinds).toEqual([]);
  });
});
