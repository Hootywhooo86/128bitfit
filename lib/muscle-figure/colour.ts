/**
 * Colour ramps for the lit figure.
 *
 * The body is neutral grey; only the heat colours carry hue, and they are the
 * fixed load scale from lib/theme `muscleHeat` — never the accent. Each ramp
 * runs dark to light, with heat shadows turned a few degrees cooler and
 * highlights a few degrees warmer, so a ramp reads as lit rather than as the
 * same colour made darker and lighter.
 */
import type { LoadLevel } from '@/lib/muscle-load';

/** Same values as `muscleHeat` in lib/theme, which this pure module cannot import. */
export const HEAT: Record<Exclude<LoadLevel, 'none'>, string> = {
  light: '#ffd95e',
  medium: '#ff9a3d',
  heavy: '#ff4d6d',
};

const GREYS = {
  muscle: '#3a3a3a',
  skin: '#6a6a6a',
  head: '#6a6a6a',
  hair: '#1f1f1f',
  shorts: '#1b1b1b',
} as const;

export type Paint = keyof typeof GREYS | Exclude<LoadLevel, 'none'>;

export const TONES = 6;

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

function ramp(base: string, n: number, down: number, up: number, shift: number): string[] {
  const [h, s, l] = toHsl(base);
  const at = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => {
    const t = i < at ? -(at - i) / at : (i - at) / (n - 1 - at);
    return toHex(h + t * shift, s + (t < 0 ? -t * 0.05 : -t * 0.15), l + (t < 0 ? t * down : t * up));
  });
}

const cache = new Map<Paint, string[]>();

/** `TONES` colours for a paint, darkest first. */
export function rampFor(paint: Paint): string[] {
  let r = cache.get(paint);
  if (!r) {
    if (paint in HEAT) r = ramp(HEAT[paint as keyof typeof HEAT], TONES, 0.3, 0.17, 12);
    else if (paint === 'muscle') r = ramp(GREYS.muscle, TONES, 0.17, 0.13, 0);
    else r = ramp(GREYS[paint as keyof typeof GREYS], TONES, 0.2, 0.18, 0);
    cache.set(paint, r);
  }
  return r;
}

/** The thin seams between muscles. */
export const SEAM = '#101010';
export const OUTLINE = '#000000';
export const FLOOR = '#0b0b0b';
/** A glint on grey muscle is a lighter grey; on a heat colour it is white. */
export const GLINT_GREY = '#6b6b6b';
export const GLINT = '#ffffff';
