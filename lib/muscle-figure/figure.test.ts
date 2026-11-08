import { describe, expect, it } from 'vitest';
import { emptyTally, MUSCLE_GROUPS, type MuscleTally } from '@/lib/muscle-load';
import { HEAT, rampFor } from './colour';
import { figure, FULL_SETS, GRID_W, IMAGE_H, IMAGE_W, muscleAt, paint, toPaths } from './figure';

const heatColours = new Set(
  (['light', 'medium', 'heavy'] as const).flatMap((l) => [HEAT[l], ...rampFor(l)])
);
const countHeat = (px: (string | null)[]) => px.filter((c) => c && heatColours.has(c)).length;

function tally(patch: Partial<MuscleTally>): MuscleTally {
  return { ...emptyTally(), ...patch };
}

describe('muscle figure', () => {
  it('gives every muscle group pixels on the front or the back', () => {
    for (const m of MUSCLE_GROUPS) {
      const n = (figure('front').fill.get(m)?.length ?? 0) + (figure('back').fill.get(m)?.length ?? 0);
      expect(n, m).toBeGreaterThan(8);
    }
  });

  it('is the same muscle on both sides of the body', () => {
    for (const view of ['front', 'back'] as const) {
      const cells = figure(view).cells;
      for (let i = 0; i < cells.length; i++) {
        const x = i % GRID_W;
        const mirror = i - x + (GRID_W - 1 - x);
        expect(cells[i]?.muscle ?? null).toBe(cells[mirror]?.muscle ?? null);
      }
    }
  });

  it('shows no load colour at all when nothing is trained', () => {
    expect(countHeat(paint('front', emptyTally()))).toBe(0);
    expect(countHeat(paint('back', emptyTally()))).toBe(0);
  });

  it('fills a muscle further with each set, and completely at the full count', () => {
    const lit = (sets: number) => countHeat(paint('front', tally({ chest: sets })));
    expect(lit(1)).toBeGreaterThan(0);
    expect(lit(5)).toBeGreaterThan(lit(1));
    expect(lit(FULL_SETS)).toBeGreaterThan(lit(5));
    expect(lit(FULL_SETS + 6)).toBe(lit(FULL_SETS));
  });

  it('fills from the bottom of the muscle up', () => {
    const fill = figure('front').fill.get('quadriceps')!;
    const rows = fill.map((i) => Math.floor(i / GRID_W));
    for (let k = 1; k < rows.length; k++) expect(rows[k]).toBeLessThanOrEqual(rows[k - 1]);
  });

  it('colours by the load scale: yellow, then orange, then red', () => {
    const has = (sets: number, level: 'light' | 'medium' | 'heavy') =>
      paint('back', tally({ glutes: sets })).some((c) => c && rampFor(level).includes(c));
    expect(has(2, 'light')).toBe(true);
    expect(has(5, 'medium')).toBe(true);
    expect(has(9, 'heavy')).toBe(true);
    expect(has(2, 'heavy')).toBe(false);
  });

  it('turns into paths that cover every painted pixel exactly once', () => {
    const px = paint('front', tally({ chest: 4, biceps: 9 }));
    const area = toPaths(px)
      .flatMap((p) => [...p.d.matchAll(/h(\d+)/g)].map((m) => Number(m[1])))
      .reduce((a, b) => a + b, 0);
    expect(area).toBe(px.filter(Boolean).length);
    expect(px).toHaveLength(IMAGE_W * IMAGE_H);
  });

  it('finds the muscle under a tap', () => {
    const fill = figure('front').fill.get('chest')!;
    const i = fill[Math.floor(fill.length / 2)];
    expect(muscleAt('front', (i % GRID_W) + 1.5, Math.floor(i / GRID_W) + 1.5)).toBe('chest');
    expect(muscleAt('front', 0, 0)).toBeNull();
  });
});

describe('muscle figure animation frames', () => {
  it('flashes the muscles that just grew white, and only their lit pixels', () => {
    const t = tally({ chest: 3, biceps: 3 });
    const plain = paint('front', t);
    const flashed = paint('front', t, { flash: new Set(['chest'] as const) });
    const whites = (px: (string | null)[]) => px.filter((c) => c === '#ffffff').length;
    expect(whites(flashed)).toBeGreaterThan(whites(plain));
    // Biceps did not flash, so it still carries its load colour.
    expect(countHeat(flashed)).toBeGreaterThan(0);
  });

  it('moves the eyes when the empty figure glances about', () => {
    const ahead = paint('front', emptyTally(), { eyes: 'ahead' });
    expect(paint('front', emptyTally(), { eyes: 'left' })).not.toEqual(ahead);
    expect(paint('front', emptyTally(), { eyes: 'closed' })).not.toEqual(ahead);
    // The back of the head has no face.
    expect(paint('back', emptyTally(), { eyes: 'left' })).toEqual(paint('back', emptyTally()));
  });
});
