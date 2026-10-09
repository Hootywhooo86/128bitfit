/**
 * The user's accent colour.
 *
 * Free, permanently (CLAUDE.md). It colours buttons, highlights, active tabs,
 * progress fills and links — never the muscle-load scale and never
 * over-target red, which stay fixed in lib/theme.ts.
 *
 * Kept free of database imports so the theme can read it without dragging
 * the database into every file that imports a colour.
 */
import { useSyncExternalStore } from 'react';

import { DEFAULT_ACCENT, isAccent, onAccentFor } from './family/accent';

// The pure rules (presets, custom-colour checks, onAccent) are the family's,
// shared with every 128bit app. This file keeps fit's live store on top.
export * from './family/accent';

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
