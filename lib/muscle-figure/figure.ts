/**
 * The pixel muscle figure: anatomy rasterised to a grid, lit once, then
 * painted for whatever was trained.
 *
 * Building is the expensive half (shapes, distance fields, normals) and does
 * not depend on the data, so each view is built once and cached. Painting is a
 * single pass over the grid and runs on every logged set.
 *
 * Each muscle group fills from the bottom up as sets are logged, full at
 * FULL_SETS, in the heat colour for its set count. Nothing logged is grey:
 * absence of load, never a low amount of it.
 */
import { loadLevel, MUSCLE_GROUPS, type MuscleGroup, type MuscleTally } from '@/lib/muscle-load';
import { FLOOR, GLINT, GLINT_GREY, OUTLINE, rampFor, SEAM, TONES, type Paint } from './colour';
import { CANVAS_H, CANVAS_W, contains, DETAIL, expand, NON_MUSCLE, silhouette, type View } from './shapes';

export const GRID_W = 96;
export const GRID_H = 192;
/** Fills a muscle completely. Ten hard sets a week is a common hypertrophy floor. */
export const FULL_SETS = 10;
/** Empty rows under the feet for the floor shadow. */
const FLOOR_ROWS = 5;

/** The painted image: the grid plus a one-pixel border for the outline. */
export const IMAGE_W = GRID_W + 2;
export const IMAGE_H = GRID_H + 1 + FLOOR_ROWS;

type Cell = { key: string; part: string; muscle: MuscleGroup | null };

export type Figure = {
  view: View;
  cells: (Cell | null)[];
  seam: Uint8Array;
  /** 0–1 per pixel: how squarely it faces the light. */
  light: Float32Array;
  glint: Uint8Array;
  /** Each muscle's pixels, bottom row first, for filling from the bottom up. */
  fill: Map<MuscleGroup, number[]>;
};

const GROUPS = new Set<string>(MUSCLE_GROUPS);
const NON = new Set<string>(NON_MUSCLE);

/** "quadriceps:medialis" → quadriceps; "abs2" → abdominals; "skin" → null. */
export function muscleOf(part: string): MuscleGroup | null {
  if (/^abs\d$/.test(part)) return 'abdominals';
  const m = part.split(':')[0];
  return GROUPS.has(m) && !NON.has(m) ? (m as MuscleGroup) : null;
}

function rasterise(view: View): (Cell | null)[] {
  const sil = expand(silhouette(view));
  const det = expand(DETAIL[view]);
  const cells: (Cell | null)[] = new Array(GRID_W * GRID_H).fill(null);
  // The left half is sampled and the right copied from it, so the two sides
  // match exactly even where a pixel centre lands on a shape's edge.
  const half = GRID_W / 2;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < half; x++) {
      const px = ((x + 0.5) * CANVAS_W) / GRID_W;
      const py = ((y + 0.5) * CANVAS_H) / GRID_H;
      let hit: (typeof sil)[number] | null = null;
      for (const s of sil) if (contains(s, px, py)) hit = s;
      if (!hit) continue;
      for (const s of det) if (contains(s, px, py)) hit = s;
      const muscle = muscleOf(hit.part);
      cells[y * GRID_W + x] = { key: hit.part + hit.side, part: hit.part, muscle };
      const other = hit.side === 'L' ? 'R' : hit.side === 'R' ? 'L' : '';
      cells[y * GRID_W + GRID_W - 1 - x] = { key: hit.part + other, part: hit.part, muscle };
    }
  }
  return cells;
}

/** Chamfer distance to the nearest pixel where `same` fails. */
function distance(inside: (i: number) => boolean, same: (a: number, b: number) => boolean): Float32Array {
  const D = new Float32Array(GRID_W * GRID_H).fill(1e9);
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      if (!inside(i)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!ok(x + dx, y + dy) || !same(i, (y + dy) * GRID_W + x + dx)) D[i] = 1;
      }
    }
  }
  const pass = (forward: boolean) => {
    const nb = forward
      ? [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.4], [1, -1, 1.4]]
      : [[1, 0, 1], [0, 1, 1], [1, 1, 1.4], [-1, 1, 1.4]];
    for (let k = 0; k < GRID_W * GRID_H; k++) {
      const i = forward ? k : GRID_W * GRID_H - 1 - k;
      if (!inside(i)) continue;
      const x = i % GRID_W;
      const y = (i - x) / GRID_W;
      let d = D[i];
      for (const [dx, dy, w] of nb) {
        if (!ok(x + dx, y + dy)) continue;
        const j = (y + dy) * GRID_W + x + dx;
        if (same(i, j)) d = Math.min(d, D[j] + w);
      }
      D[i] = d;
    }
  };
  pass(true);
  pass(false);
  return D;
}

/** Light from the top left and slightly in front, like a key light. */
const LIGHT = (() => {
  const v = [-0.55, -0.7, 0.75];
  const m = Math.hypot(v[0], v[1], v[2]);
  return v.map((a) => a / m);
})();

function build(view: View): Figure {
  const cells = rasterise(view);
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H ? cells[y * GRID_W + x] : null;

  // A seam is the pixel on the left or top of a border between two pieces,
  // at least one of them muscle.
  const seam = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = at(x, y);
      if (!c) continue;
      for (const n of [at(x + 1, y), at(x, y + 1)]) {
        if (n && n.key !== c.key && (c.muscle || n.muscle)) seam[y * GRID_W + x] = 1;
      }
    }
  }

  // Height: each piece is a dome as tall as it is wide, on a body that is
  // itself rounded at its edges. The slope of that surface is the normal.
  const dk = distance(
    (i) => !!cells[i] && !seam[i],
    (a, b) => !!cells[b] && !seam[b] && cells[b]!.key === cells[a]!.key
  );
  const db = distance((i) => !!cells[i], (_a, b) => !!cells[b]);
  const peak = new Map<string, number>();
  cells.forEach((c, i) => {
    if (c && !seam[i]) peak.set(c.key, Math.max(peak.get(c.key) ?? 0, dk[i]));
  });
  const unit = GRID_W / CANVAS_W;
  const round = (t: number) => Math.sqrt(1 - (1 - t) * (1 - t));
  const height = new Float32Array(GRID_W * GRID_H);
  cells.forEach((c, i) => {
    if (!c || seam[i]) return;
    const pk = Math.max(1, peak.get(c.key) ?? 1);
    height[i] = round(Math.min(1, dk[i] / pk)) * pk * 0.9 + round(Math.min(1, db[i] / (5 * unit))) * 4 * unit;
  });

  const light = new Float32Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      const c = cells[i];
      if (!c || seam[i]) continue;
      // Slope within the piece only, so a seam never reads as a cliff.
      const h = (a: number, b: number) => {
        const n = at(a, b);
        return n && n.key === c.key && !seam[b * GRID_W + a] ? height[b * GRID_W + a] : height[i];
      };
      const nx = -(h(x + 1, y) - h(x - 1, y)) / 2;
      const ny = -(h(x, y + 1) - h(x, y - 1)) / 2;
      const d = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.hypot(nx, ny, 1);
      light[i] = Math.max(0, Math.min(1, 0.04 + Math.max(0, d)));
    }
  }

  // A glint on the brightest pixel of each sizeable piece that faces the lamp.
  const glint = new Uint8Array(GRID_W * GRID_H);
  const best = new Map<string, number>();
  cells.forEach((c, i) => {
    if (!c?.muscle || seam[i] || (peak.get(c.key) ?? 0) < 3 * unit) return;
    const b = best.get(c.key);
    if (b == null || light[i] > light[b]) best.set(c.key, i);
  });
  for (const i of best.values()) if (light[i] > 0.9) glint[i] = 1;

  // Bottom row first; within a row, outside in, so left and right fill together.
  const fill = new Map<MuscleGroup, number[]>();
  cells.forEach((c, i) => {
    if (!c?.muscle || seam[i]) return;
    const list = fill.get(c.muscle) ?? [];
    list.push(i);
    fill.set(c.muscle, list);
  });
  const mid = (i: number) => Math.min(i % GRID_W, GRID_W - 1 - (i % GRID_W));
  for (const list of fill.values()) {
    list.sort((a, b) => Math.floor(b / GRID_W) - Math.floor(a / GRID_W) || mid(a) - mid(b) || a - b);
  }

  return { view, cells, seam, light, glint, fill };
}

const built = new Map<View, Figure>();

export function figure(view: View): Figure {
  let f = built.get(view);
  if (!f) {
    f = build(view);
    built.set(view, f);
  }
  return f;
}

/** Which pixels of each muscle are lit for this tally. */
function litPixels(fig: Figure, tally: Partial<MuscleTally>): Map<number, Paint> {
  const lit = new Map<number, Paint>();
  for (const [m, pixels] of fig.fill) {
    const sets = tally[m] ?? 0;
    const level = loadLevel(sets);
    if (level === 'none') continue;
    const n = Math.ceil(Math.min(1, sets / FULL_SETS) * pixels.length);
    for (let k = 0; k < n; k++) lit.set(pixels[k], level);
  }
  return lit;
}

/**
 * The figure as IMAGE_W × IMAGE_H colours, row by row; null is transparent.
 *
 * The outline is selective: on the lit side it takes the darkest tone of the
 * body beside it, so the edge glows; on the shadow side it is black. A rim
 * light lifts the right-hand edge, as if a second lamp sits behind.
 */
export function paint(view: View, tally: Partial<MuscleTally>): (string | null)[] {
  const fig = figure(view);
  const lit = litPixels(fig, tally);
  const out: (string | null)[] = new Array(IMAGE_W * IMAGE_H).fill(null);
  const set = (x: number, y: number, c: string) => {
    const ix = x + 1;
    const iy = y + 1;
    if (ix >= 0 && iy >= 0 && ix < IMAGE_W && iy < IMAGE_H) out[iy * IMAGE_W + ix] = c;
  };
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H ? fig.cells[y * GRID_W + x] : null;
  const paintOf = (i: number): Paint => {
    const c = fig.cells[i]!;
    if (!c.muscle) return c.part as Paint;
    return lit.get(i) ?? 'muscle';
  };

  // Floor shadow: a dithered ellipse under the feet.
  const fy = GRID_H - 1;
  const rx = GRID_W * 0.28;
  const ry = Math.max(2, GRID_H * 0.022);
  for (let y = Math.floor(fy - ry); y <= fy + ry + 1; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const u = (x + 0.5 - GRID_W / 2) / rx;
      const v = (y + 0.5 - fy) / ry;
      const r = u * u + v * v;
      if (r <= 1 && (r < 0.55 || (x + y) % 2 === 0)) set(x, y, FLOOR);
    }
  }

  for (let y = -1; y <= GRID_H; y++) {
    for (let x = -1; x <= GRID_W; x++) {
      const c = at(x, y);
      if (!c) {
        let beside: number | null = null;
        let litSide = false;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          if (!at(x + dx, y + dy)) continue;
          beside ??= (y + dy) * GRID_W + x + dx;
          if (dx > 0 || dy > 0) litSide = true;
        }
        if (beside != null) set(x, y, litSide ? rampFor(paintOf(beside))[0] : OUTLINE);
        continue;
      }
      const i = y * GRID_W + x;
      if (fig.seam[i]) {
        set(x, y, SEAM);
        continue;
      }
      const p = paintOf(i);
      if (fig.glint[i]) {
        set(x, y, p === 'muscle' ? GLINT_GREY : GLINT);
        continue;
      }
      let t = Math.min(TONES - 1, Math.floor(fig.light[i] * TONES));
      if (!at(x + 1, y) && t < TONES - 2) t += 2;
      set(x, y, rampFor(p)[t]);
    }
  }

  if (view === 'front') {
    const u = GRID_W / CANVAS_W;
    const eye = Math.round((11 * GRID_H) / CANVAS_H);
    const l = Math.round(29 * u);
    const r = GRID_W - 1 - l;
    set(l, eye, '#111111');
    set(r, eye, '#111111');
    for (let k = 0; k < Math.max(2, Math.round(2 * u)); k++) {
      set(l - k, eye - 1, '#2a2a2a');
      set(r + k, eye - 1, '#2a2a2a');
    }
    const mouth = Math.round((15 * GRID_H) / CANVAS_H);
    for (let x = Math.round(GRID_W / 2 - 2 * u); x < Math.round(GRID_W / 2 + 2 * u); x++) set(x, mouth, '#3a3a3a');
  }
  return out;
}

/**
 * One SVG path per colour: each horizontal run of a colour becomes a rect in
 * that colour's path. A figure is a few dozen paths rather than thousands of
 * shapes.
 */
export function toPaths(pixels: (string | null)[]): { colour: string; d: string }[] {
  const by = new Map<string, string[]>();
  for (let y = 0; y < IMAGE_H; y++) {
    let x = 0;
    while (x < IMAGE_W) {
      const c = pixels[y * IMAGE_W + x];
      let end = x + 1;
      while (end < IMAGE_W && pixels[y * IMAGE_W + end] === c) end++;
      if (c) {
        const list = by.get(c) ?? [];
        list.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
        by.set(c, list);
      }
      x = end;
    }
  }
  return [...by].map(([colour, parts]) => ({ colour, d: parts.join('') }));
}

/** The muscle group at a pixel of the painted image, for taps. */
export function muscleAt(view: View, imageX: number, imageY: number): MuscleGroup | null {
  const x = Math.floor(imageX) - 1;
  const y = Math.floor(imageY) - 1;
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  return figure(view).cells[y * GRID_W + x]?.muscle ?? null;
}
