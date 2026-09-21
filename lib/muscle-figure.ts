/**
 * The figure geometry for the muscle map.
 *
 * Shapes are defined as tapered quads — a top edge, a bottom edge, and the
 * renderer interpolates the rows between them. That buys curved silhouettes
 * (deltoid caps, a V-taper, sweeping quads) from a handful of numbers instead
 * of a hand-placed block per pixel.
 *
 * Rows that come out the same width are merged back into one rect, so a
 * straight section costs one View and only the curves cost extra. Keeps the
 * figure smooth without putting hundreds of Views on the Home screen.
 */
import type { MuscleGroup } from './muscle-load';

export const GRID_W = 44;
export const GRID_H = 68;

/** `m: null` is structure — head, hands, feet. Never coloured. */
export type Quad = {
  m: MuscleGroup | null;
  y0: number;
  y1: number;
  /** Left/right edge at the top row. */
  l0: number;
  r0: number;
  /** Left/right edge at the bottom row. */
  l1: number;
  r1: number;
};

export type Rect = { m: MuscleGroup | null; x: number; y: number; w: number; h: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Expands a quad to rows, merging equal-width runs into single rects. */
export function quadToRects(q: Quad): Rect[] {
  const out: Rect[] = [];
  const height = Math.max(1, q.y1 - q.y0);
  let run: Rect | null = null;

  for (let i = 0; i < height; i++) {
    const t = height === 1 ? 0 : i / (height - 1);
    const x = Math.round(lerp(q.l0, q.l1, t));
    const w = Math.max(1, Math.round(lerp(q.r0, q.r1, t)) - x);
    const y = q.y0 + i;

    if (run && run.x === x && run.w === w && run.y + run.h === y) {
      run.h += 1;
    } else {
      run = { m: q.m, x, y, w, h: 1 };
      out.push(run);
    }
  }
  return out;
}

export function buildRects(quads: Quad[]): Rect[] {
  return quads.flatMap(quadToRects);
}

/** Mirrors a quad across the vertical centre line, for paired muscles. */
function mirror(q: Quad): Quad {
  return {
    ...q,
    l0: GRID_W - q.r0,
    r0: GRID_W - q.l0,
    l1: GRID_W - q.r1,
    r1: GRID_W - q.l1,
  };
}

/** A quad and its mirror image. */
function pair(q: Quad): Quad[] {
  return [q, mirror(q)];
}

export const FRONT_QUADS: Quad[] = [
  // Head, then a neck that meets the traps without a gap.
  { m: null, y0: 1, y1: 8, l0: 17, r0: 27, l1: 18, r1: 26 },
  { m: 'neck', y0: 8, y1: 11, l0: 19, r0: 25, l1: 18, r1: 26 },
  { m: 'traps', y0: 11, y1: 14, l0: 15, r0: 29, l1: 13, r1: 31 },

  // Deltoid cap: widens fast, then tucks in to meet the bicep exactly.
  ...pair({ m: 'shoulders', y0: 11, y1: 15, l0: 11, r0: 16, l1: 8, r1: 16 }),
  ...pair({ m: 'shoulders', y0: 15, y1: 19, l0: 8, r0: 16, l1: 9, r1: 15 }),

  // Pecs, split at the sternum for definition.
  ...pair({ m: 'chest', y0: 13, y1: 25, l0: 14, r0: 21, l1: 16, r1: 21 }),

  // Arm: each segment starts where the last ended.
  ...pair({ m: 'biceps', y0: 19, y1: 30, l0: 9, r0: 15, l1: 10, r1: 14 }),
  ...pair({ m: 'forearms', y0: 30, y1: 41, l0: 10, r0: 14, l1: 11, r1: 14 }),
  ...pair({ m: null, y0: 41, y1: 45, l0: 11, r0: 14, l1: 11, r1: 14 }),

  // Torso: abs narrow to the waist, hips flare back out.
  { m: 'abdominals', y0: 25, y1: 35, l0: 16, r0: 28, l1: 17, r1: 27 },
  ...pair({ m: 'abductors', y0: 33, y1: 41, l0: 14, r0: 17, l1: 14, r1: 17 }),
  { m: null, y0: 35, y1: 41, l0: 17, r0: 27, l1: 16, r1: 28 },

  // Legs: quads sweep wide then taper to the knee; adductors run inside.
  ...pair({ m: 'quadriceps', y0: 41, y1: 55, l0: 14, r0: 21, l1: 16, r1: 21 }),
  ...pair({ m: 'adductors', y0: 41, y1: 51, l0: 17, r0: 20, l1: 18, r1: 20 }),
  ...pair({ m: 'calves', y0: 55, y1: 66, l0: 16, r0: 21, l1: 17, r1: 20 }),
  ...pair({ m: null, y0: 66, y1: 68, l0: 15, r0: 21, l1: 14, r1: 22 }),
];

export const BACK_QUADS: Quad[] = [
  { m: null, y0: 1, y1: 8, l0: 17, r0: 27, l1: 18, r1: 26 },
  { m: 'neck', y0: 8, y1: 11, l0: 19, r0: 25, l1: 18, r1: 26 },

  // Traps: the diamond, wide at the shoulders tapering to mid-back.
  { m: 'traps', y0: 11, y1: 18, l0: 14, r0: 30, l1: 17, r1: 27 },
  { m: 'traps', y0: 18, y1: 24, l0: 17, r0: 27, l1: 20, r1: 24 },

  ...pair({ m: 'shoulders', y0: 11, y1: 15, l0: 11, r0: 16, l1: 8, r1: 16 }),
  ...pair({ m: 'shoulders', y0: 15, y1: 19, l0: 8, r0: 16, l1: 9, r1: 15 }),

  // Lats: flare wide under the arm, tuck into the waist — the V.
  ...pair({ m: 'lats', y0: 17, y1: 30, l0: 13, r0: 20, l1: 17, r1: 21 }),
  { m: 'middle back', y0: 24, y1: 30, l0: 20, r0: 24, l1: 20, r1: 24 },
  { m: 'lower back', y0: 30, y1: 35, l0: 17, r0: 27, l1: 16, r1: 28 },

  ...pair({ m: 'triceps', y0: 19, y1: 30, l0: 9, r0: 15, l1: 10, r1: 14 }),
  ...pair({ m: 'forearms', y0: 30, y1: 41, l0: 10, r0: 14, l1: 11, r1: 14 }),
  ...pair({ m: null, y0: 41, y1: 45, l0: 11, r0: 14, l1: 11, r1: 14 }),

  { m: 'glutes', y0: 35, y1: 41, l0: 17, r0: 27, l1: 16, r1: 28 },
  ...pair({ m: 'hamstrings', y0: 41, y1: 55, l0: 15, r0: 21, l1: 16, r1: 21 }),
  ...pair({ m: 'calves', y0: 55, y1: 66, l0: 16, r0: 21, l1: 17, r1: 20 }),
  ...pair({ m: null, y0: 66, y1: 68, l0: 15, r0: 21, l1: 14, r1: 22 }),
];

export const FRONT_RECTS = buildRects(FRONT_QUADS);
export const BACK_RECTS = buildRects(BACK_QUADS);
