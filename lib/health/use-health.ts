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
 */
import { useCallback, useEffect, useState } from 'react';
import { health } from './index';
import { today } from './dates';

export type TodayHealth =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'update' }
  | { status: 'denied' }
  | { status: 'ready'; steps: number | null };

export function useTodaySteps() {
  const [state, setState] = useState<TodayHealth>({ status: 'checking' });

  const refresh = useCallback(async () => {
    const availability = await health.getAvailability();
    if (availability === 'unavailable') return setState({ status: 'unavailable' });
    if (availability === 'update_required') return setState({ status: 'update' });

    const permission = await health.getPermissionState();
    if (permission !== 'granted') return setState({ status: 'denied' });

    const day = today();
    const [reading] = await health.readDays(day, day);
    setState({ status: 'ready', steps: reading?.steps ?? null });
  }, []);

  /** Prompts, so only call from a button press. */
  const connect = useCallback(async () => {
    const permission = await health.requestPermissions();
    if (permission === 'granted') {
      await refresh();
      return true;
    }
    setState({ status: 'denied' });
    return false;
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    // A failure here must not leave the card stuck on "checking" forever.
    refresh().catch(() => {
      if (alive) setState({ status: 'denied' });
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  return { state, refresh, connect, openSettings: health.openSettings };
}
