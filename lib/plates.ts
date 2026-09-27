/**
 * Plate maths for the plate calculator and warm-up ramp, from
 * prototype/app-shell.html `train:plates` and `train:warmup`.
 */
import type { WeightUnit } from '@/db/settings-queries';

export const PLATES: Record<WeightUnit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export const BARS: Record<WeightUnit, number[]> = {
  lb: [45, 35, 15, 0],
  kg: [20, 15, 10, 0],
};

/** Smallest jump the steppers make — two of the smallest plate. */
export const STEP: Record<WeightUnit, number> = { lb: 5, kg: 2.5 };

export type PlateLoad =
  | { status: 'below-bar' }
  | {
      status: 'ok';
      /** Plates on one side, heaviest first. */
      perSide: number[];
      perSideWeight: number;
      /** What the bar actually weighs loaded like this — less than asked when it cannot be hit exactly. */
      loaded: number;
      /** How far short of the target, per side. 0 when exact. */
      shortPerSide: number;
    };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Greedy, heaviest first — the way a person loads a bar. */
export function platesFor(target: number, bar: number, plates: number[]): PlateLoad {
  if (target < bar) return { status: 'below-bar' };
  let remaining = round2((target - bar) / 2);
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (remaining >= p - 0.001) {
      perSide.push(p);
      remaining = round2(remaining - p);
    }
  }
  const perSideWeight = round2(perSide.reduce((a, b) => a + b, 0));
  return {
    status: 'ok',
    perSide,
    perSideWeight,
    loaded: round2(bar + perSideWeight * 2),
    shortPerSide: remaining,
  };
}

export function countPlates(perSide: number[]): { plate: number; count: number }[] {
  const out: { plate: number; count: number }[] = [];
  for (const p of perSide) {
    const last = out[out.length - 1];
    if (last && last.plate === p) last.count++;
    else out.push({ plate: p, count: 1 });
  }
  return out;
}

export type WarmupSet = { pct: number; weight: number; reps: number | 'work' };

/** Four ramps, roughly 40 / 60 / 75 / 87 %, then the working weight. */
const RAMP: [number, number | 'work'][] = [
  [0.4, 5],
  [0.6, 4],
  [0.75, 3],
  [0.875, 2],
  [1, 'work'],
];

export function warmupSets(working: number, unit: WeightUnit, bar = BARS[unit][0]): WarmupSet[] {
  const step = STEP[unit];
  return RAMP.map(([pct, reps]) => {
    // Never below the empty bar: a 40% ramp of a light lift is still the bar.
    const raw = reps === 'work' ? working : Math.max(bar, working * pct);
    return { pct, weight: Math.round(raw / step) * step, reps };
  });
}
