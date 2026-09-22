/**
 * Design tokens, ported verbatim from prototype/app-shell.html.
 *
 * CLAUDE.md makes that prototype the visual spec, so these are its `:root`
 * variables rather than an approximation of them. If a value here and a value
 * there disagree, the prototype is right.
 *
 * Monochrome. Colour only ever means data — see `muscleHeat` and `muscleRole`.
 */
export const colors = {
  bg: '#000000',
  /** --card */
  surface: '#0d0d0d',
  /** --card2 */
  surfaceAlt: '#171717',
  /** --card3, the track behind a bar */
  track: '#212121',
  /** --line */
  border: '#242424',
  /** --line2, the border of something focused or pressed */
  borderBright: '#3a3a3a',
  /** --fg */
  text: '#ffffff',
  /** --muted */
  textMuted: '#8c8c8c',
  /** --dim: labels, captions, anything secondary to muted */
  textDim: '#575757',
  accent: '#ffffff',
  onAccent: '#000000',
  chip: '#171717',
  chipActive: '#ffffff',
  chipActiveText: '#000000',
  /** Over target. The prototype's --warn. */
  danger: '#ff4d6d',
};

export const fonts = {
  /** Section labels and headers only. Never body text. */
  pixel: 'Silkscreen_400Regular',
  pixelBold: 'Silkscreen_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

/**
 * Muscle load: yellow (1-3 sets) -> orange (4-7) -> red (8+). The prototype's
 * --h1c / --h2c / --h3c. Untrained stays grey — absence of load, not a low
 * amount of it. A user-selectable accent must never be added to this scale.
 */
export const muscleHeat = {
  none: '#2a2a2a',
  light: '#ffd95e',
  medium: '#ff9a3d',
  heavy: '#ff4d6d',
} as const;

/**
 * How the muscle map colours a session: red where the muscle was the target of
 * an exercise, yellow where it only assisted. Same two ends as the load scale,
 * so the two never read as different meanings of the same colour.
 */
export const muscleRole = {
  primary: '#ff4d6d',
  secondary: '#ffd95e',
  none: 'transparent',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const radius = {
  sm: 6,
  md: 9,
  lg: 12,
  pill: 20,
};
