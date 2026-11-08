/**
 * Small animated pixel sprites, as rows of characters: '.' empty, '#' body,
 * '+' shade, '*' highlight. The component decides the colours, which are the
 * accent and greys only — never the heat scale, which means training load.
 */
export type Rows = string[];

const SPIN = 12;

/**
 * The loading dumbbell at `angle` radians: a bar with a plate at each end,
 * rasterised so the turn reads as pixel art rather than a smooth rotation.
 */
export function dumbbellFrame(angle: number): Rows {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const mid = (SPIN - 1) / 2;
  return Array.from({ length: SPIN }, (_, y) =>
    Array.from({ length: SPIN }, (_, x) => {
      const dx = x - mid;
      const dy = y - mid;
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      const au = Math.abs(u);
      if (au >= 3.2 && au <= 5.4 && Math.abs(v) <= 2.6) return au >= 4.4 ? '+' : '#';
      if (au < 3.2 && Math.abs(v) <= 0.55) return '*';
      return '.';
    }).join('')
  );
}

/** Four frames make a half turn, which for a dumbbell looks like a full one. */
export const DUMBBELL_FRAMES: Rows[] = [0, 1, 2, 3].map((k) => dumbbellFrame((k * Math.PI) / 4));

/**
 * The rest-timer hourglass, `left` of the rest still to go (1 → 0). Sand sits
 * at the bottom of each bulb; `grain` drops one grain through the neck, so the
 * glass reads as running between frames.
 */
const GLASS = [
  '#########',
  '.#.....#.',
  '.#.....#.',
  '..#...#..',
  '...#.#...',
  '....#....',
  '...#.#...',
  '..#...#..',
  '.#.....#.',
  '.#.....#.',
  '#########',
];
const NECK = 5;

/** Glass cells inside each bulb, in the order sand fills them (from the bottom up). */
function bulb(top: boolean): [number, number][] {
  const rows = top ? [4, 3, 2, 1] : [9, 8, 7, 6];
  return rows.flatMap((y) => {
    const row = GLASS[y];
    const first = row.indexOf('#');
    const last = row.lastIndexOf('#');
    const cells: [number, number][] = [];
    for (let x = first + 1; x < last; x++) cells.push([x, y]);
    // Middle first, so a pile mounds rather than filling one wall.
    return cells.sort((a, b) => Math.abs(a[0] - 4) - Math.abs(b[0] - 4));
  });
}
const TOP = bulb(true);
const BOTTOM = bulb(false);

export function hourglassFrame(left: number, grain: boolean): Rows {
  const grid = GLASS.map((r) => [...r]);
  const n = TOP.length;
  const up = Math.max(0, Math.min(n, Math.round(left * n)));
  for (let i = 0; i < up; i++) grid[TOP[i][1]][TOP[i][0]] = '*';
  for (let i = 0; i < n - up; i++) grid[BOTTOM[i][1]][BOTTOM[i][0]] = '*';
  if (grain && up > 0 && up < n) grid[NECK + 1][4] = '*';
  return grid.map((r) => r.join(''));
}

/** The glass on its side, for the flip when the rest is up. */
export function hourglassSideways(): Rows {
  const g = hourglassFrame(0, false);
  return [...g[0]].map((_, x) => g.map((row) => row[x]).reverse().join(''));
}

/** Spark offsets for the set-tick burst: eight directions, two pixels apiece. */
export const SPARK_DIRECTIONS: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
