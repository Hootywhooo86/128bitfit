/**
 * Holds the screen awake while a workout is running.
 *
 * Without it the phone sleeps on its normal timeout between sets and every log
 * starts with unlocking it — which is non-negotiable #1 (a set logged in under
 * three seconds) lost to a system setting the app never asked about.
 *
 * Scoped deliberately narrowly:
 *
 *   - Only while a session is actually in progress. An app-wide lock would
 *     hold the screen on while someone browses the exercise library on the bus.
 *   - Released on unmount, so finishing, discarding, or navigating away all
 *     give the screen back without each needing to remember to.
 *   - Off entirely when the user has turned the setting off.
 *
 * This dims as normal; it only stops the screen sleeping. There is no wake lock
 * on the CPU and nothing runs in the background — the rest timer is a scheduled
 * OS notification precisely so it does not need one.
 */
import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/** Our own tag, so this lock is never confused with anything else's. */
export const SESSION_AWAKE_TAG = 'bitfit-active-session';

export function useSessionAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    let released = false;
    // Unsupported platforms (web without Wake Lock) reject rather than no-op.
    // A screen that sleeps is a worse workout, not a broken one, so it fails
    // quietly instead of putting an error over the set list.
    void activateKeepAwakeAsync(SESSION_AWAKE_TAG).catch(() => {});

    return () => {
      if (released) return;
      released = true;
      void deactivateKeepAwake(SESSION_AWAKE_TAG).catch(() => {});
    };
  }, [active]);
}
