/**
 * Turns overlapping ovals into as few rectangles as possible.
 *
 * Pixel art reads as anatomy because of curves; a rectangle has no silhouette
 * and stacking rectangles just makes a bigger rectangle. So shapes are defined
 * as ellipses and tapers, painted onto a grid in order (a later shape sits on
 * top of an earlier one), and the filled cells are then covered with greedy
 * maximal rectangles — grow right, then grow down while the whole row matches.
 *
 * Every rect becomes a View, so the count is what is being optimised. Greedy
 * rectangles beat merging row runs by roughly a third on curved shapes, because
 * a curve rarely repeats the same start and width twice in a row.
 *
 * Generic over the paint type: the muscle map paints muscle groups, the avatar
 * paints skin, hair and clothing.
 */

export type Ellipse<P> = {
  kind: 'ellipse';
  m: P;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Shear in cells per row — leans a limb without trigonometry. */
  lean?: number;
};

export type Taper<P> = {
  kind: 'taper';
  m: P;
  y0: number;
  y1: number;
  l0: number;
  r0: number;
  l1: number;
  r1: number;
  /** Rounds the ends so a limb does not finish in a flat edge. */
  round?: number;
};

export type Shape<P> = Ellipse<P> | Taper<P>;

export type Rect<P> = { m: P; x: number; y: number; w: number; h: number };

export type Grid = { w: number; h: number };

function inEllipse<P>(e: Ellipse<P>, x: number, y: number): boolean {
  const shear = e.lean ? e.lean * (y - e.cy) : 0;
  const dx = (x - e.cx - shear) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

function inTaper<P>(t: Taper<P>, x: number, y: number): boolean {
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

function contains<P>(s: Shape<P>, x: number, y: number): boolean {
  return s.kind === 'ellipse' ? inEllipse(s, x, y) : inTaper(s, x, y);
}

export function rasteriseOn<P>(grid: Grid, shapes: Shape<P>[]): Rect<P>[] {
  const cells: (P | undefined)[][] = Array.from({ length: grid.h }, () =>
    Array<P | undefined>(grid.w).fill(undefined)
  );

  for (const s of shapes) {
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (contains(s, x, y)) cells[y][x] = s.m;
      }
    }
  }

  const taken: boolean[][] = Array.from({ length: grid.h }, () =>
    Array<boolean>(grid.w).fill(false)
  );
  const free = (x: number, y: number, m: P | undefined) => cells[y][x] === m && !taken[y][x];

  const out: Rect<P>[] = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const m = cells[y][x];
      if (m === undefined || taken[y][x]) continue;

      let w = 1;
      while (x + w < grid.w && free(x + w, y, m)) w++;

      let h = 1;
      while (y + h < grid.h) {
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

/** Mirrors a shape across a vertical centre line. */
export function mirrorAt<P>(cx: number, s: Shape<P>): Shape<P> {
  if (s.kind === 'ellipse') {
    return { ...s, cx: 2 * cx - s.cx, lean: s.lean ? -s.lean : s.lean };
  }
  return { ...s, l0: 2 * cx - s.r0, r0: 2 * cx - s.l0, l1: 2 * cx - s.r1, r1: 2 * cx - s.l1 };
}
