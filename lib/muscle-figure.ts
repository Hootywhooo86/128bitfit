/**
 * The figure geometry for the muscle map.
 *
 * Muscle bellies are ellipses, not rectangles. Rasterising a curve to the grid
 * is what makes pixel art read as anatomy rather than as blocks — a rectangle
 * has no silhouette, and stacking rectangles just makes a bigger rectangle.
 *
 * Shapes are painted in order, so a later shape sits on top of an earlier one.
 * That is how the pecs overlap the ribcage and the adductors sit inside the
 * quad sweep, the same way overlapping ovals build a figure in any pixel art.
 *
 * Original geometry. Nothing here traces any existing artwork.
 */
import type { MuscleGroup } from './muscle-load';

export const GRID_W = 48;
export const GRID_H = 76;

/** `m: null` is structure — head, hands, feet. Never coloured. */
type Paint = MuscleGroup | null;

type Ellipse = {
  kind: 'ellipse';
  m: Paint;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Shear in cells per row — leans a limb without trigonometry. */
  lean?: number;
};

type Taper = {
  kind: 'taper';
  m: Paint;
  y0: number;
  y1: number;
  l0: number;
  r0: number;
  l1: number;
  r1: number;
  /** Rounds the ends so a limb does not finish in a flat edge. */
  round?: number;
};

export type Shape = Ellipse | Taper;

export type Rect = { m: Paint; x: number; y: number; w: number; h: number };

function inEllipse(e: Ellipse, x: number, y: number): boolean {
  const shear = e.lean ? e.lean * (y - e.cy) : 0;
  const dx = (x - e.cx - shear) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

function inTaper(t: Taper, x: number, y: number): boolean {
  if (y < t.y0 || y >= t.y1) return false;
  const span = Math.max(1, t.y1 - t.y0 - 1);
  const s = (y - t.y0) / span;
  let l = t.l0 + (t.l1 - t.l0) * s;
  let r = t.r0 + (t.r1 - t.r0) * s;
  if (t.round) {
    // Pull the edges in near the ends so corners are not square.
    const d = Math.min(y - t.y0, t.y1 - 1 - y);
    if (d < t.round) {
      const pull = (t.round - d) * 0.5;
      l += pull;
      r -= pull;
    }
  }
  return x + 0.5 >= l && x + 0.5 < r;
}

function contains(s: Shape, x: number, y: number): boolean {
  return s.kind === 'ellipse' ? inEllipse(s, x, y) : inTaper(s, x, y);
}

/**
 * Paints the shapes onto the grid, last shape winning, then covers the result
 * with as few rectangles as it can.
 *
 * Every rect becomes a View, and both figures sit on screen together, so the
 * count is the thing worth optimising. Greedy maximal rectangles — grow right,
 * then grow down while the whole row still matches — beats merging row runs by
 * roughly a third on curved shapes, because a curve rarely repeats the same
 * start and width twice in a row.
 */
export function rasterise(shapes: Shape[]): Rect[] {
  const grid: (Paint | undefined)[][] = Array.from({ length: GRID_H }, () =>
    Array<Paint | undefined>(GRID_W).fill(undefined)
  );

  for (const s of shapes) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (contains(s, x, y)) grid[y][x] = s.m;
      }
    }
  }

  const taken: boolean[][] = Array.from({ length: GRID_H }, () =>
    Array<boolean>(GRID_W).fill(false)
  );
  const free = (x: number, y: number, m: Paint) => grid[y][x] === m && !taken[y][x];

  const out: Rect[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const m = grid[y][x];
      if (m === undefined || taken[y][x]) continue;

      let w = 1;
      while (x + w < GRID_W && free(x + w, y, m)) w++;

      let h = 1;
      while (y + h < GRID_H) {
        let full = true;
        for (let i = 0; i < w; i++) {
          if (!free(x + i, y + h, m)) {
            full = false;
            break;
          }
        }
        if (!full) break;
        h++;
      }

      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) taken[y + j][x + i] = true;
      out.push({ m, x, y, w, h });
    }
  }
  return out;
}

const CX = GRID_W / 2;

/** Mirrors a shape across the vertical centre line. */
function mirror(s: Shape): Shape {
  if (s.kind === 'ellipse') {
    return { ...s, cx: 2 * CX - s.cx, lean: s.lean ? -s.lean : s.lean };
  }
  return { ...s, l0: 2 * CX - s.r0, r0: 2 * CX - s.l0, l1: 2 * CX - s.r1, r1: 2 * CX - s.l1 };
}

function pair(s: Shape): Shape[] {
  return [s, mirror(s)];
}

const e = (m: Paint, cx: number, cy: number, rx: number, ry: number, lean?: number): Ellipse => ({
  kind: 'ellipse',
  m,
  cx,
  cy,
  rx,
  ry,
  lean,
});

const t = (
  m: Paint,
  y0: number,
  y1: number,
  l0: number,
  r0: number,
  l1: number,
  r1: number,
  round?: number
): Taper => ({ kind: 'taper', m, y0, y1, l0, r0, l1, r1, round });

export const FRONT_SHAPES: Shape[] = [
  // --- structure ---------------------------------------------------------
  // A solid body is painted first so no gap between two muscles shows through
  // as a hole. It is built from overlapping ovals, not boxes: the silhouette
  // is what stops the figure reading as a stack of rectangles, and the one
  // cell of structure left around each belly is what separates the groups.
  e(null, CX, 8, 4.6, 6), // skull
  t(null, 11, 15, 20.5, 27.5, 21.5, 26.5, 1), // jaw
  t(null, 13, 20, 21, 27, 20, 28), // neck
  e(null, CX, 24, 10.5, 7), // ribcage
  e(null, CX, 34, 7.4, 7), // waist
  e(null, CX, 42, 8.5, 5.2), // hips
  ...pair(e(null, 11.5, 24, 5.5, 6)), // shoulder cap
  ...pair(e(null, 11, 33, 4.2, 8.5, -0.04)), // upper arm
  ...pair(e(null, 9, 45, 3.8, 8, -0.03)), // forearm
  ...pair(e(null, 8.6, 54, 3.2, 3.8)), // fist
  ...pair(e(null, 19, 52, 4.7, 10)), // thigh
  ...pair(e(null, 19.6, 65, 4.3, 7.5)), // shank
  ...pair(t(null, 71, 76, 15, 23, 14, 23.5, 1)), // feet

  // --- muscle bellies ----------------------------------------------------
  e('neck', CX, 15.5, 2.9, 2.8),
  t('traps', 17, 22, 20.5, 27.5, 15, 33, 1),

  ...pair(e('shoulders', 11.5, 23, 4.3, 4.6)),
  ...pair(e('chest', 19, 26, 4.6, 4)),

  ...pair(e('biceps', 11, 32.5, 2.9, 5.8, -0.04)),
  ...pair(e('forearms', 9, 45.5, 2.6, 5.8, -0.03)),

  e('abdominals', CX, 33, 4.4, 7),
  // Carved into a six-pack. One cell of structure between the blocks is the
  // whole difference between abs and a red rectangle.
  t(null, 27, 40, 23.5, 24.5, 23.5, 24.5),
  t(null, 30, 31, 19, 29, 19, 29),
  t(null, 34, 35, 19, 29, 19, 29),
  t(null, 38, 39, 19, 29, 19, 29),

  ...pair(e('abductors', 17.6, 41.5, 2.6, 3.6)),

  ...pair(e('quadriceps', 19, 51.5, 3.6, 7.6)),
  ...pair(e('adductors', 21.6, 50, 1.2, 5)),
  ...pair(e('calves', 19.6, 65.5, 3.2, 5.6)),
];

export const BACK_SHAPES: Shape[] = [
  // --- structure ---------------------------------------------------------
  // A solid body is painted first so no gap between two muscles shows through
  // as a hole. It is built from overlapping ovals, not boxes: the silhouette
  // is what stops the figure reading as a stack of rectangles, and the one
  // cell of structure left around each belly is what separates the groups.
  e(null, CX, 8, 4.6, 6), // skull
  t(null, 11, 15, 20.5, 27.5, 21.5, 26.5, 1), // jaw
  t(null, 13, 20, 21, 27, 20, 28), // neck
  e(null, CX, 24, 10.5, 7), // ribcage
  e(null, CX, 34, 7.4, 7), // waist
  e(null, CX, 42, 8.5, 5.2), // hips
  ...pair(e(null, 11.5, 24, 5.5, 6)), // shoulder cap
  ...pair(e(null, 11, 33, 4.2, 8.5, -0.04)), // upper arm
  ...pair(e(null, 9, 45, 3.8, 8, -0.03)), // forearm
  ...pair(e(null, 8.6, 54, 3.2, 3.8)), // fist
  ...pair(e(null, 19, 52, 4.7, 10)), // thigh
  ...pair(e(null, 19.6, 65, 4.3, 7.5)), // shank
  ...pair(t(null, 71, 76, 15, 23, 14, 23.5, 1)), // feet

  // --- muscle bellies ----------------------------------------------------
  e('neck', CX, 15.5, 2.9, 2.8),
  // Traps: the diamond from the neck down between the shoulder blades.
  t('traps', 17, 22, 20.5, 27.5, 15, 33, 1),
  e('traps', CX, 24, 6, 4.2),

  ...pair(e('shoulders', 11.5, 23, 4.3, 4.6)),

  // Lats: wide under the arm, tucking into the waist — the V.
  ...pair(e('lats', 18.8, 29.5, 5.2, 6.6, 0.3)),
  // Spine column, not a disc floating mid-back.
  t('middle back', 22, 34, 22.5, 25.5, 22.5, 25.5),
  e('lower back', CX, 38, 4.2, 3.4),

  ...pair(e('triceps', 11, 32.5, 2.9, 5.8, -0.04)),
  ...pair(e('forearms', 9, 45.5, 2.6, 5.8, -0.03)),

  ...pair(e('glutes', 20, 42.5, 3.6, 3.6)),
  ...pair(e('hamstrings', 19, 52, 3.6, 7.6)),
  ...pair(e('calves', 19.6, 65.5, 3.4, 5.6)),
];

export const FRONT_RECTS = rasterise(FRONT_SHAPES);
export const BACK_RECTS = rasterise(BACK_SHAPES);
