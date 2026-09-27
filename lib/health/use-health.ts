/**
 * Today's health reading for the UI.
 *
 * The state machine mirrors the empty-state table in CLAUDE.md, because those
 * are genuinely different situations and must render differently:
 *
 *   checking     — not known yet; render nothing rather than a guess
 *   unavailable  — no Health Connect on this phone
 *   update       — provider installed but needs updating
 *   denied       — available, but not connected / permission refused
 *   ready        — connected; `steps` is a real reading (0 is a real zero)
 *
 * The state itself lives in ./today-store, shared by every mount. See the note
 * there: this hook is mounted twice on Home, and per-hook state let the two
 * copies disagree.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { health } from './index';
import type { TodayHealth } from './today-gate';
import { getTodayHealth, refreshTodayHealth, subscribeTodayHealth } from './today-store';

export type { TodayHealth };

export function useTodaySteps() {
  const state = useSyncExternalStore(subscribeTodayHealth, getTodayHealth, getTodayHealth);

  const refresh = useCallback(() => refreshTodayHealth(), []);

  /** Prompts, so only call from a button press. */
  const connect = useCallback(async () => {
    // Partial counts: the prompt succeeded if the user granted anything, and
    // the refresh decides whether steps specifically came through.
    const permission = await health.requestPermissions();

    // Refresh either way. A refusal still has to be re-read rather than
    // assumed: the user may have granted steps from the Health Connect screen
    // and backed out of the rest, which arrives here as a refusal.
    await refreshTodayHealth();
    return permission === 'granted' || permission === 'partial';
  }, []);

  useEffect(() => {
    // Only the first mount reads; the store shares the result with the rest,
    // and refreshes itself on app resume.
    if (getTodayHealth().status === 'checking') void refreshTodayHealth();
  }, []);

  return { state, refresh, connect, openSettings: health.openSettings };
}

export function useTodayCalories() {
  const state = useSyncExternalStore(subscribeTodayHealth, getTodayHealth, getTodayHealth);
  // activeCalories is read when steps are read (same store), so only a single
  // useEffect is needed; this hook just selects out the calories field.
  return { activeCalories: state.status === 'ready' ? state.activeCalories : null };
}
