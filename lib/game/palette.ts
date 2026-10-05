import type { Tone } from './sprites';

/**
 * What each sprite tone is drawn in: greys, plus the accent colour for what
 * you have earned. Never the muscle-load yellow, orange or red — those mean
 * data, and a trophy is not a measurement.
 */
const GREYS: Record<Exclude<Tone, 'accent' | 'accentDim'>, string> = {
  outline: '#3a3a3a',
  hair: '#5a5a5a',
  dark: '#4a4a4a',
  mid: '#8a8a8a',
  skin: '#c4c4c4',
  light: '#e2e2e2',
  white: '#ffffff',
};

export function toneColor(tone: Tone, accent: string): string {
  if (tone === 'accent' || tone === 'accentDim') return accent;
  return GREYS[tone];
}

/** The shaded accent is the accent at lower opacity, so it stays on-theme. */
export function toneOpacity(tone: Tone): number {
  return tone === 'accentDim' ? 0.55 : 1;
}

export const GREY_TONES = GREYS;
