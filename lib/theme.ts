/** Strict black-and-white dark theme — 128BIT FIT monochrome game aesthetic. */
export const colors = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: '#1c1c1c',
  border: '#3a3a3a',
  text: '#f2f2f2',
  textMuted: '#8a8a8a',
  accent: '#ffffff',
  accentDim: '#2a2a2a',
  /** Errors / destructive: high-contrast white (no red). Pair with bold/underline in UI. */
  danger: '#ffffff',
  chip: '#222222',
  chipActive: '#ffffff',
  chipActiveText: '#0a0a0a',
};

/**
 * The only colour in the app.
 *
 * CLAUDE.md: "Colour only ever means data. The only colour in the app is muscle
 * load: yellow (1-3 sets) -> orange (4-7) -> red (8+)." Untrained stays
 * greyscale — absence of load, not a low amount of it. A user-selectable accent
 * must never be added to this scale.
 */
export const muscleHeat = {
  none: '#262626',
  light: '#e8c547',
  medium: '#e8833a',
  heavy: '#d93a3a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
