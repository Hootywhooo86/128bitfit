/**
 * Design tokens, ported verbatim from prototype/app-shell.html.
 *
 * CLAUDE.md makes that prototype the visual spec, so these are its `:root`
 * variables rather than an approximation of them. If a value here and a value
 * there disagree, the prototype is right.
 *
 * Monochrome. Colour only ever means data — see `muscleHeat` and `muscleRole`.
 * The one exception is the accent, which the user picks (lib/accent.ts) and
 * which is read live through the getters below.
 */
import { accentVersion, currentAccent, currentOnAccent } from './accent';
import { PIXEL_FONT } from './family/tokens';

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
  /** User-selectable. Buttons, highlights, active tabs, progress fills, links — never data. */
  get accent(): string {
    return currentAccent();
  },
  /** Text drawn on the accent: black or white, whichever reads. */
  get onAccent(): string {
    return currentOnAccent();
  },
  chip: '#171717',
  get chipActive(): string {
    return currentAccent();
  },
  get chipActiveText(): string {
    return currentOnAccent();
  },
  /** Over target. The prototype's --warn. */
  danger: '#ff4d6d',
};

export const fonts = {
  /** Section labels and headers only. Never body text. The 128bit family face. */
  pixel: PIXEL_FONT,
  /** PressStart2P has one weight; kept so call sites can still say "bold". */
  pixelBold: PIXEL_FONT,
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

/**
 * The widest the content column ever gets.
 *
 * Portrait on a phone is narrower than this, so it changes nothing there. In
 * landscape, and on a Fold opened out, it stops a line of text running the
 * full width of the screen — which is unreadable, and makes a phone app look
 * like a stretched phone app.
 */
export const CONTENT_MAX_WIDTH = 640;

/**
 * Styles that read the accent, rebuilt when it changes.
 *
 * `StyleSheet.create` runs once, when a file is first loaded, so a style
 * written as `{ backgroundColor: colors.accent }` would keep whatever the
 * accent was at launch. Wrapping the factory defers it to first use and
 * rebuilds it on the first use after the accent changes.
 */
export function themedStyles<T extends object>(factory: () => T): T {
  let built: T | null = null;
  let builtFor = -1;
  const current = (): T => {
    if (!built || builtFor !== accentVersion()) {
      built = factory();
      builtFor = accentVersion();
    }
    return built;
  };
  return new Proxy({} as T, {
    get: (_t, key) => current()[key as keyof T],
    has: (_t, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Object.getOwnPropertyDescriptor(current(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
