/**
 * The user's accent colour.
 *
 * Free, permanently (CLAUDE.md). It colours buttons, highlights, active tabs,
 * progress fills and links — never the muscle-load scale and never
 * over-target red, which stay fixed in lib/theme.ts.
 *
 * Kept free of imports so the theme can read it without dragging the
 * database into every file that imports a colour.
 */
import { useSyncExternalStore } from 'react';

export type AccentChoice = { name: string; hex: string };

/**
 * The prototype's theme colours, minus CRIMSON. Crimson was #ff4d6d — the
 * exact over-target and heavy-load red — so a progress bar drawn in it would
 * read as "over" when it meant "yours". The heat scale being fixed is only
 * half the rule; the accent must not impersonate it either.
 */
export const ACCENTS: AccentChoice[] = [
  { name: 'DEFAULT', hex: '#ffffff' },
  { name: 'AMBER', hex: '#ffcc3d' },
  { name: 'TEAL', hex: '#4be0c8' },
  { name: 'VIOLET', hex: '#a78bfa' },
  { name: 'AZURE', hex: '#5aa9ff' },
  { name: 'LIME', hex: '#a3e635' },
  { name: 'CORAL', hex: '#ff8552' },
  { name: 'ROSE', hex: '#ff8fc7' },
  { name: 'MINT', hex: '#6ee7a8' },
  { name: 'GOLD', hex: '#e0b84a' },
  { name: 'ICE', hex: '#9fd8ff' },
];

export const DEFAULT_ACCENT = ACCENTS[0].hex;

export function isAccent(hex: string | null | undefined): hex is string {
  return !!hex && ACCENTS.some((a) => a.hex === hex.toLowerCase());
}

export function accentName(hex: string): string {
  return ACCENTS.find((a) => a.hex === hex.toLowerCase())?.name ?? 'CUSTOM';
}

/** Black or white text on this colour — the prototype's onAccent(). */
export function onAccentFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#000000' : '#ffffff';
}

let accent = DEFAULT_ACCENT;
let onAccent = onAccentFor(DEFAULT_ACCENT);
let version = 0;
const listeners = new Set<() => void>();

export const currentAccent = () => accent;
export const currentOnAccent = () => onAccent;
/** Bumped on every change, so cached styles know they are stale. */
export const accentVersion = () => version;

/** Applies a colour now. Persisting it is the caller's job (db/accent-settings). */
export function applyAccent(hex: string): void {
  const next = isAccent(hex) ? hex.toLowerCase() : DEFAULT_ACCENT;
  if (next === accent) return;
  accent = next;
  onAccent = onAccentFor(next);
  version++;
  for (const l of [...listeners]) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * The current accent, re-rendering the caller when it changes. Components that
 * read `colors.accent` only need this if nothing else would re-render them.
 */
export function useAccent(): string {
  return useSyncExternalStore(subscribe, currentAccent, currentAccent);
}
