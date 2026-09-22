import { describe, expect, it } from 'vitest';
import exercisesJson from '@/assets/data/exercises.json';
import {
  BACK_RECTS,
  FRONT_RECTS,
  GRID_H,
  GRID_W,
  rasterise,
  type Shape,
} from './muscle-figure';
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from './muscle-load';

type RawExercise = { primaryMuscles?: string[]; secondaryMuscles?: string[] };

const mapped = new Set(
  [...FRONT_RECTS, ...BACK_RECTS].map((r) => r.m).filter((m): m is MuscleGroup => m != null)
);

/**
 * There should be no such thing as an unknown muscle: the app owns the list and
 * the map. These tests make that a build failure rather than something that
 * silently disappears at runtime.
 */
describe('muscle coverage is closed, not best-effort', () => {
  it('every muscle in the shipped exercise data is a known group', () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    const unknown = new Set<string>();
    for (const e of exercisesJson as RawExercise[]) {
      for (const m of [...(e.primaryMuscles ?? []), ...(e.secondaryMuscles ?? [])]) {
        if (!known.has(m)) unknown.add(m);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('every known group is drawn somewhere on the figure', () => {
    const missing = MUSCLE_GROUPS.filter((m) => !mapped.has(m));
    expect(missing).toEqual([]);
  });

  it('the figure draws nothing that is not a known group', () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    expect([...mapped].filter((m) => !known.has(m))).toEqual([]);
  });

  it('every group has a display label', () => {
    expect(MUSCLE_GROUPS.filter((m) => !MUSCLE_LABELS[m])).toEqual([]);
  });
});

describe('figure geometry', () => {
  it('stays inside the grid', () => {
    for (const r of [...FRONT_RECTS, ...BACK_RECTS]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(GRID_W);
      expect(r.y + r.h).toBeLessThanOrEqual(GRID_H);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it('merges a straight column into a single rect', () => {
    // Parallel edges are one rect, not one per row.
    const straight: Shape[] = [
      { kind: 'taper', m: 'chest', y0: 0, y1: 8, l0: 10, r0: 20, l1: 10, r1: 20 },
    ];
    expect(rasterise(straight)).toEqual([{ m: 'chest', x: 10, y: 0, w: 10, h: 8 }]);
  });

  it('steps a tapered edge across several rects', () => {
    const tapered = rasterise([
      { kind: 'taper', m: 'lats', y0: 0, y1: 8, l0: 10, r0: 20, l1: 14, r1: 18 },
    ]);
    expect(tapered.length).toBeGreaterThan(1);
    expect(tapered[0].x).toBe(10);
    expect(tapered[tapered.length - 1].x).toBe(14);
  });

  it('gives an ellipse a curved silhouette, not a block', () => {
    const oval = rasterise([
      { kind: 'ellipse', m: 'chest', cx: 24, cy: 20, rx: 8, ry: 6 },
    ]);
    // Width grows to the waist of the oval and shrinks again. A rectangle
    // would report the same width on every row.
    const widths = new Map<number, number>();
    for (const r of oval) {
      for (let y = r.y; y < r.y + r.h; y++) widths.set(y, (widths.get(y) ?? 0) + r.w);
    }
    const rows = [...widths.keys()].sort((a, b) => a - b).map((y) => widths.get(y)!);
    expect(rows.length).toBeGreaterThan(4);
    expect(new Set(rows).size).toBeGreaterThan(1);
    const widest = Math.max(...rows);
    const peak = rows.indexOf(widest);
    expect(rows[0]).toBeLessThan(widest);
    expect(rows[rows.length - 1]).toBeLessThan(widest);
    // Widens to the peak, narrows after it — no notches either side.
    for (let i = 1; i <= peak; i++) expect(rows[i]).toBeGreaterThanOrEqual(rows[i - 1]);
    for (let i = peak + 1; i < rows.length; i++) expect(rows[i]).toBeLessThanOrEqual(rows[i - 1]);
  });

  it('paints later shapes over earlier ones', () => {
    // The pecs sit on top of the ribcage; drawing order is the whole trick.
    const stacked = rasterise([
      { kind: 'taper', m: 'abdominals', y0: 0, y1: 4, l0: 10, r0: 20, l1: 10, r1: 20 },
      { kind: 'taper', m: 'chest', y0: 0, y1: 4, l0: 12, r0: 18, l1: 12, r1: 18 },
    ]);
    const chest = stacked.filter((r) => r.m === 'chest');
    expect(chest).toEqual([{ m: 'chest', x: 12, y: 0, w: 6, h: 4 }]);
    // The covered strip is gone, the flanks remain.
    expect(stacked.filter((r) => r.m === 'abdominals').map((r) => r.x).sort()).toEqual([10, 18]);
  });

  it('never emits a zero-width rect, which would leave a hole in the silhouette', () => {
    const pinched = rasterise([
      { kind: 'taper', m: 'neck', y0: 0, y1: 6, l0: 10, r0: 11, l1: 10, r1: 10 },
    ]);
    expect(pinched.every((r) => r.w >= 1 && r.h >= 1)).toBe(true);
  });

  it('covers every painted cell exactly once', () => {
    // Each rect is a View. An overlap is a wasted View and a wrong colour where
    // they cross; a gap is a hole in the figure. Neither is visible in a diff.
    const shapes: Shape[] = [
      { kind: 'ellipse', m: 'chest', cx: 24, cy: 20, rx: 9, ry: 7 },
      { kind: 'ellipse', m: 'lats', cx: 20, cy: 24, rx: 7, ry: 9 },
      { kind: 'taper', m: null, y0: 10, y1: 30, l0: 23, r0: 25, l1: 22, r1: 26 },
    ];
    const seen = new Map<string, number>();
    for (const r of rasterise(shapes)) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const k = `${x},${y}`;
          expect(seen.has(k)).toBe(false); // no overlap
          seen.set(k, 1);
        }
      }
    }
    // Same cell set a naive per-cell pass would paint.
    let painted = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const hit = shapes.some((s) => {
          if (s.kind === 'ellipse') {
            return ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1;
          }
          if (y < s.y0 || y >= s.y1) return false;
          const f = (y - s.y0) / Math.max(1, s.y1 - s.y0 - 1);
          const l = s.l0 + (s.l1 - s.l0) * f;
          const r = s.r0 + (s.r1 - s.r0) * f;
          return x + 0.5 >= l && x + 0.5 < r;
        });
        if (hit) painted++;
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.size).toBe(painted);
  });

  it('keeps the figure cheap enough to sit on Home', () => {
    // One rect per painted cell would be ~1,800 Views per figure, and both
    // figures are on screen together.
    expect(FRONT_RECTS.length).toBeLessThan(260);
    expect(BACK_RECTS.length).toBeLessThan(260);
  });
});
