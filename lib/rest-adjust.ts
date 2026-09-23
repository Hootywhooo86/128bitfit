/**
 * What a +15 / -15 tap does to a rest timer.
 *
 * Lifted out of the timer itself because the edge cases are where this goes
 * wrong, and they are hard to exercise through a running clock.
 *
 * Pure: milliseconds in, milliseconds out.
 */

export type RestState = {
  /** Milliseconds left, or null when no rest is running. */
  remainingMs: number | null;
  /** The length the progress bar measures against. */
  totalSeconds: number;
};

export type RestAdjustment =
  /** Nothing to do — the tap was meaningless in this state. */
  | { kind: 'none' }
  /** No rest was running; start one this long. */
  | { kind: 'start'; seconds: number }
  /** A rest is running; set it to this. */
  | { kind: 'set'; remainingMs: number; totalSeconds: number };

/** A rest never drops below this — zero would be indistinguishable from finished. */
export const MIN_REST_SECONDS = 1;

export function adjustRest(state: RestState, deltaSeconds: number): RestAdjustment {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return { kind: 'none' };

  if (state.remainingMs == null) {
    // Shortening a rest you are not taking is not an action. Without this,
    // "-15" on an idle timer started a one-second rest, because the length was
    // clamped to a minimum before anyone asked whether it should exist.
    if (deltaSeconds < 0) return { kind: 'none' };
    return { kind: 'start', seconds: deltaSeconds };
  }

  const next = state.remainingMs + deltaSeconds * 1000;
  const remainingMs = Math.max(MIN_REST_SECONDS * 1000, next);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  // The bar measures elapsed as total minus remaining. Extending past the
  // original length grows the bar; shortening leaves it, so the bar moves
  // forward rather than the rest appearing to restart.
  return {
    kind: 'set',
    remainingMs,
    totalSeconds: Math.max(state.totalSeconds, remainingSeconds),
  };
}
