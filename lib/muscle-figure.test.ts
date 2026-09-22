import { describe, expect, it } from 'vitest';
import exercisesJson from '@/assets/data/exercises.json';
import {
  BACK_RECTS,
  FRONT_RECTS,
  GRID_H,
  GRID_W,
  quadToRects,
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

  it('merges straight runs instead of emitting a rect per row', () => {
    // A quad with parallel edges is one rect, not eight.
    const straight = quadToRects({ m: 'chest', y0: 0, y1: 8, l0: 10, r0: 20, l1: 10, r1: 20 });
    expect(straight).toHaveLength(1);
    expect(straight[0]).toEqual({ m: 'chest', x: 10, y: 0, w: 10, h: 8 });
  });

  it('steps a tapered edge across several rects', () => {
    const tapered = quadToRects({ m: 'lats', y0: 0, y1: 8, l0: 10, r0: 20, l1: 14, r1: 18 });
    expect(tapered.length).toBeGreaterThan(1);
    expect(tapered[0].x).toBe(10);
    expect(tapered[tapered.length - 1].x).toBe(14);
  });

  it('keeps the figure cheap enough to sit on Home', () => {
    // Row-per-pixel would be several hundred Views per figure.
    expect(FRONT_RECTS.length).toBeLessThan(120);
    expect(BACK_RECTS.length).toBeLessThan(120);
  });

  it('never emits a zero-width row, which would leave a hole in the silhouette', () => {
    const pinched = quadToRects({ m: 'neck', y0: 0, y1: 6, l0: 10, r0: 11, l1: 10, r1: 10 });
    expect(pinched.every((r) => r.w >= 1)).toBe(true);
  });
});
