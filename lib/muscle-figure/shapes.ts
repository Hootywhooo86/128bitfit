/**
 * The muscle figure's anatomy, as shapes on a 64 × 128 canvas.
 *
 * Only the figure's left half (screen left) is written out; anything with
 * `mirror` is reflected across x = 32. Shapes paint in order, so a later shape
 * claims a pixel from an earlier one.
 *
 * `part` is a muscle group from lib/muscle-load, optionally with a `:head`
 * suffix that splits one group into separately shaded pieces (the three quad
 * heads, the two calf heads), or one of the non-muscle parts below. The six
 * abdominal blocks are `abs0`–`abs3` for the same reason.
 */
export const CANVAS_W = 64;
export const CANVAS_H = 128;

export type View = 'front' | 'back';

export type Shape =
  | { t: 'poly'; part: string; mirror: boolean; pts: [number, number][] }
  | { t: 'ellipse'; part: string; mirror: boolean; cx: number; cy: number; rx: number; ry: number; rot: number }
  | { t: 'capsule'; part: string; mirror: boolean; x1: number; y1: number; r1: number; x2: number; y2: number; r2: number };

/** Body that is not a muscle group. Never coloured by load. */
export const NON_MUSCLE = ['skin', 'head', 'hair', 'shorts'] as const;

const P = (part: string, pts: [number, number][], mirror = true): Shape => ({ t: 'poly', part, mirror, pts });
const E = (part: string, cx: number, cy: number, rx: number, ry: number, rot = 0, mirror = true): Shape => ({
  t: 'ellipse', part, mirror, cx, cy, rx, ry, rot,
});
const K = (part: string, x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): Shape => ({
  t: 'capsule', part, mirror: true, x1, y1, r1, x2, y2, r2,
});

/**
 * The silhouette. Each piece also says which muscle its pixels belong to when
 * no detail shape below claims them: an arm is triceps unless it is biceps.
 */
export function silhouette(view: View): Shape[] {
  const thigh = view === 'front' ? 'quadriceps' : 'hamstrings';
  // Front torso left over after chest and abs is the obliques, which the
  // exercise data files under abdominals. From behind it is lats.
  const torso = view === 'front' ? 'abdominals:obliques' : 'lats';
  return [
    K(thigh, 24.5, 65, 7.6, 26, 91, 4.3),
    K('calves', 26, 94, 4.3, 27, 116, 2.4),
    E('calves', 25, 101, 4.9, 7.2, 0.1),
    P('skin', [[24.5, 115.5], [29.6, 115.5], [30.6, 123.5], [20.8, 123.5], [21.4, 120.5]]),
    P('shorts', [[20.5, 57.5], [32, 59], [32, 69], [26, 68], [19.4, 64]]),
    K('triceps', 14.2, 31, 4.9, 10.6, 49, 3.4),
    K('forearms', 10.6, 50, 3.9, 8, 66, 2.5),
    E('skin', 7.6, 70.2, 2.7, 4.2, 0.1),
    P(torso, [[32, 21], [24, 22], [15, 25], [16, 33], [19.5, 43], [21.5, 54], [20.6, 58.5], [32, 60]]),
    E('shoulders', 15, 29.5, 5.8, 6.8, 0.35),
    P('neck', [[27.5, 14], [36.5, 14], [37.5, 24], [26.5, 24]], false),
    E(view === 'front' ? 'head' : 'hair', 32, 10, 6.4, 8.4, 0, false),
  ];
}

/** Muscle detail, painted only where the silhouette already is. */
export const DETAIL: Record<View, Shape[]> = {
  front: [
    E('hair', 32, 4.6, 6.9, 3.4, 0, false),
    P('traps', [[27.5, 19], [28.6, 23.6], [19, 25.6], [23, 22]]),
    P('chest', [[32, 24.6], [22, 24.6], [18.6, 28], [18.6, 33], [22, 37.6], [27, 39.2], [32, 38.2]]),
    P('lats', [[18.4, 34], [21, 37], [22.6, 46.5], [19.8, 44]]),
    P('abs0', [[26.8, 39.6], [31.6, 39.2], [31.6, 44.4], [26.8, 44.6]]),
    P('abs1', [[26.8, 45], [31.6, 45], [31.6, 49.6], [26.9, 49.8]]),
    P('abs2', [[27, 50.2], [31.6, 50.2], [31.6, 55], [27.3, 55.2]]),
    P('abs3', [[27.4, 55.6], [31.6, 55.6], [31.6, 62.5], [28.6, 60.5]]),
    E('biceps', 13.2, 40, 3.3, 7.6, 0.12),
    E('forearms:brachioradialis', 11.6, 53.5, 3, 5.2, 0.15),
    E('abductors', 20.6, 63.5, 2.3, 4.6, 0.25),
    P('adductors', [[31.8, 65], [28.2, 64.6], [27, 70], [29.6, 80.5], [31.8, 71]]),
    E('quadriceps:lateralis', 20.6, 78, 3.3, 11, 0.08),
    E('quadriceps:medialis', 28.4, 86.4, 3, 5, -0.3),
    E('skin', 26, 93.6, 3.6, 2.6),
    K('calves:tibialis', 27.6, 97, 1.3, 27.6, 112, 0.9),
  ],
  back: [
    P('middle back', [[31.6, 29], [25, 29.5], [19.4, 33], [23, 40.5], [31.6, 42.5]]),
    P('lower back', [[26.8, 45], [31.6, 43], [31.6, 59], [25.4, 59]]),
    P('traps', [[32, 16.5], [28, 19], [17.4, 25], [24, 29.5], [31.6, 46]]),
    E('triceps:long', 13.6, 40, 3, 7, 0.12),
    E('forearms:brachioradialis', 11.2, 53.5, 3, 5.2, 0.15),
    E('abductors', 21.6, 58.6, 4, 3, 0.3),
    E('glutes', 26.3, 64.6, 6.6, 6.2),
    E('hamstrings:biceps', 22.6, 80, 3.2, 10, 0.06),
    P('adductors', [[31.8, 70], [29, 70], [28.6, 82], [31.4, 76]]),
    E('skin', 26, 93.4, 3.4, 1.6),
    E('calves:lateral', 24, 101, 3, 6.6, 0.05),
    E('calves:medial', 28.1, 100.6, 2.8, 6.6, -0.05),
  ],
};

function mirrored(s: Shape): Shape {
  switch (s.t) {
    case 'poly':
      return { ...s, pts: s.pts.map(([x, y]) => [CANVAS_W - x, y]) };
    case 'ellipse':
      return { ...s, cx: CANVAS_W - s.cx, rot: -s.rot };
    case 'capsule':
      return { ...s, x1: CANVAS_W - s.x1, x2: CANVAS_W - s.x2 };
  }
}

/** Every shape with its side: 'L', 'R', or '' for the centre line. */
export function expand(shapes: Shape[]): (Shape & { side: string })[] {
  const out: (Shape & { side: string })[] = [];
  for (const s of shapes) {
    if (!s.mirror) out.push({ ...s, side: '' });
    else out.push({ ...s, side: 'L' }, { ...mirrored(s), side: 'R' });
  }
  return out;
}

export function contains(s: Shape, x: number, y: number): boolean {
  switch (s.t) {
    case 'ellipse': {
      const c = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const dx = x - s.cx;
      const dy = y - s.cy;
      const u = (dx * c + dy * sn) / s.rx;
      const v = (-dx * sn + dy * c) / s.ry;
      return u * u + v * v <= 1;
    }
    case 'capsule': {
      const vx = s.x2 - s.x1;
      const vy = s.y2 - s.y1;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / (vx * vx + vy * vy)));
      const r = s.r1 + (s.r2 - s.r1) * t;
      return (x - (s.x1 + vx * t)) ** 2 + (y - (s.y1 + vy * t)) ** 2 <= r * r;
    }
    case 'poly': {
      let inside = false;
      const p = s.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i];
        const [xj, yj] = p[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
  }
}
