import { describe, expect, it } from 'vitest';
import { heartRateStillSyncing, summariseHeartRate } from './heart-rate';

const T0 = Date.UTC(2026, 8, 28, 22);
const MIN = 60_000;

describe('heart rate over a session', () => {
  it('is nothing at all when nothing was recorded', () => {
    expect(summariseHeartRate([], T0, T0 + 30 * MIN)).toBeNull();
    expect(summariseHeartRate([{ t: T0 - MIN, bpm: 80 }], T0, T0 + 30 * MIN)).toBeNull();
  });

  it('gives average, max and min of the samples inside the session', () => {
    const s = summariseHeartRate(
      [
        { t: T0 + MIN, bpm: 100 },
        { t: T0 + 2 * MIN, bpm: 140 },
        { t: T0 + 3 * MIN, bpm: 120 },
        { t: T0 + 90 * MIN, bpm: 200 },
      ],
      T0,
      T0 + 10 * MIN
    )!;
    expect(s).toMatchObject({ avg: 120, max: 140, min: 100 });
  });

  it('squeezes a sample a second into the graph without losing the shape', () => {
    const samples = Array.from({ length: 3600 }, (_, i) => ({ t: T0 + i * 1000, bpm: i < 1800 ? 100 : 150 }));
    const s = summariseHeartRate(samples, T0, T0 + 3600 * 1000, 120)!;
    expect(s.points).toHaveLength(120);
    expect(s.points[0].bpm).toBe(100);
    expect(s.points[119].bpm).toBe(150);
  });

  it('leaves a gap where the watch recorded nothing, instead of drawing through it', () => {
    const samples = [
      ...Array.from({ length: 10 }, (_, i) => ({ t: T0 + i * MIN, bpm: 110 })),
      ...Array.from({ length: 10 }, (_, i) => ({ t: T0 + (50 + i) * MIN, bpm: 130 })),
    ];
    const s = summariseHeartRate(samples, T0, T0 + 60 * MIN, 6)!;
    expect(s.points.map((p) => p.bpm)).toEqual([110, null, null, null, null, 130]);
  });

  it('never has more slices than samples', () => {
    expect(summariseHeartRate([{ t: T0 + MIN, bpm: 90 }], T0, T0 + 60 * MIN)!.points).toHaveLength(1);
  });
});

describe('a watch that has not finished syncing', () => {
  it('is flagged when readings stop minutes before the end', () => {
    expect(heartRateStillSyncing(T0 + 28 * MIN, T0 + 48 * MIN)).toBe(true);
    expect(heartRateStillSyncing(T0 + 47 * MIN + 30_000, T0 + 48 * MIN)).toBe(false);
  });
});
