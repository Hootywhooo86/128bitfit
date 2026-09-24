/**
 * Run something each time the app comes back to the foreground.
 *
 * Health readings are taken by other apps while this one is backgrounded — a
 * watch syncs overnight sleep, a scale pushes a weigh-in, and permission is
 * granted in the Health Connect app, which means leaving this one. Without a
 * resume hook the user comes back to the reading from whenever the screen was
 * last mounted and reasonably concludes it stopped working.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function useAppResume(onResume: () => void): void {
  // Held in a ref so a caller passing an inline function does not tear the
  // listener down and rebuild it on every render.
  const latest = useRef(onResume);
  latest.current = onResume;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') latest.current();
    });
    return () => sub.remove();
  }, []);
}
