/**
 * Carries a just-created exercise back to the screen that asked for it.
 *
 * The routine builder holds a half-built routine in component state. Sending
 * the user off to the custom-exercise form and navigating *back* keeps that
 * state alive, where routing *forward* to a fresh copy of the builder would
 * throw the draft away — so the new exercise cannot be delivered as a route
 * param, because the screen that needs it is already mounted behind us.
 *
 * Hence a one-slot handoff. It is deliberately not a store: nothing subscribes
 * to it, nothing renders from it, and taking it clears it, so an exercise
 * cannot be silently added twice if the builder re-focuses for another reason.
 */

let pending: string | null = null;

/** Called by the exercise form right before it navigates back. */
export function stageNewExercise(id: string): void {
  pending = id.trim() || null;
}

/** Called by the waiting screen on focus. Returns null when there is nothing. */
export function takeNewExercise(): string | null {
  const id = pending;
  pending = null;
  return id;
}

/** Drops anything staged, for a screen that is leaving without collecting. */
export function clearNewExercise(): void {
  pending = null;
}
