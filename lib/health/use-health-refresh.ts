/**
 * When a health card should re-read.
 *
 * Two triggers, because the readings move for two different reasons:
 *
 * Resume — health data is written by other apps while this one is
 * backgrounded. A watch syncs overnight sleep, a scale pushes a weigh-in, and
 * permission is granted in the Health Connect app, which means leaving this
 * one and coming back to the card you just fixed still saying "Not connected".
 *
 * Broadcast — the user pulled to refresh. Home's pull used to re-read its own
 * database queries and nothing else, so the readiness, rest and weight cards
 * kept whatever they read when they mounted. Pulling down visibly did nothing
 * to them, which is indistinguishable from the feature being broken.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Register a card's re-read. Exported for the hook and for tests — the
 * registry is the part with behaviour worth covering; the hook around it is
 * glue that needs React to run.
 */
export function addHealthRefreshListener(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Tell every mounted health card to re-read. Safe to call when none are.
 *
 * Iterates a copy: a listener that unsubscribes while being notified — a card
 * unmounting on the same frame as a pull — would otherwise mutate the set
 * mid-iteration.
 */
export function broadcastHealthRefresh(): void {
  for (const l of [...listeners]) l();
}

export function useHealthRefresh(onRefresh: () => void): void {
  // Held in a ref so a caller passing an inline function does not tear the
  // subscription down and rebuild it on every render.
  const latest = useRef(onRefresh);
  latest.current = onRefresh;

  useEffect(() => {
    const fire = () => latest.current();
    const off = addHealthRefreshListener(fire);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') fire();
    });
    return () => {
      off();
      sub.remove();
    };
  }, []);
}
