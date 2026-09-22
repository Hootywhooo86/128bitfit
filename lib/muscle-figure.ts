/**
 * The figure geometry for the muscle map.
 *
 * Muscle bellies are ellipses, not rectangles — see lib/pixel-raster.ts for
 * why, and for the rasteriser itself.
 *
 * The figure is drawn in two passes. A structure pass in `null` paint lays down
 * a solid body; each muscle belly is then drawn inset by about a cell. That
 * closes the silhouette and leaves a cell of structure showing between
 * neighbours, which is what separates the groups by eye.
 *
 * Original geometry. Nothing here traces any existing artwork.
 */
import {
  mirrorAt,
  rasteriseOn,
  type Ellipse as RawEllipse,
  type Rect as RawRect,
  type Shape as RawShape,
  type Taper as RawTaper,
} from './pixel-raster';
import type { MuscleGroup } from './muscle-load';

export const GRID_W = 48;
export const GRID_H = 76;
const GRID = { w: GRID_W, h: GRID_H };

/** `m: null` is structure — head, hands, feet. Never coloured. */
type Paint = MuscleGroup | null;

type Ellipse = RawEllipse<Paint>;
type Taper = RawTaper<Paint>;
export type Shape = RawShape<Paint>;
export type Rect = RawRect<Paint>;

export function rasterise(shapes: Shape[]): Rect[] {
  return rasteriseOn(GRID, shapes);
}

const CX = GRID_W / 2;

function pair(s: Shape): Shape[] {
  return [s, mirrorAt(CX, s)];
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
