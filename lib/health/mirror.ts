/**
 * Mirrors what the app records into Health Connect.
 *
 * Called from the database layer, immediately after the local row commits.
 * That is a deliberate reversal: the push helpers used to be left for each
 * screen to call, and every screen forgot. pushMeals, pushWeight and pushWater
 * existed for weeks with zero call sites — the plumbing was there and nothing
 * ran through it. One call per kind of record, next to the insert it mirrors,
 * is the only arrangement that cannot silently rot as screens are added.
 *
 * The guarantees the old arrangement was protecting are all still here:
 *
 *   - The local write has already committed. Health Connect being absent,
 *     denied, or broken can never lose a log.
 *   - Nothing here is awaited by the caller, so logging a set or a meal stays
 *     inside the three-second budget even if the IPC call is slow.
 *   - It is not a silent no-op. A failure is recorded and Settings shows it in
 *     one sentence. "Not granted" is not a failure — that is the user's choice,
 *     and the push helpers skip quietly rather than nagging.
 */
import type { FoodLogForHealth } from './sync';
import {
  pushMeals,
  pushWater,
  pushWeight,
  pushWeights,
  pushWorkout,
  removeMeals,
  removeWaters,
  removeWeights,
  removeWorkouts,
} from './sync';
import type { HealthWriteResult } from './types';

export type MirrorFailure = {
  /** What we were trying to send, in the user's words. */
  what: string;
  /** One honest sentence from the provider. */
  message: string;
  at: number;
};

let lastFailure: MirrorFailure | null = null;
const listeners = new Set<(f: MirrorFailure | null) => void>();

/** The most recent failed mirror, for Settings to show. */
export function lastMirrorFailure(): MirrorFailure | null {
  return lastFailure;
}

export function clearMirrorFailure(): void {
  lastFailure = null;
  for (const l of listeners) l(null);
}

export function subscribeMirror(fn: (f: MirrorFailure | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function record(what: string, result: HealthWriteResult): void {
  if (!result.error) return;
  lastFailure = { what, message: result.error, at: Date.now() };
  for (const l of listeners) l(lastFailure);
}

/**
 * Runs a push without letting it reach the caller.
 *
 * A rejected promise here would become an unhandled rejection and, in a release
 * build, a crash — for a background sync of a row that is already safely
 * stored. So every path lands in `record`.
 */
function fire(what: string, run: () => Promise<HealthWriteResult>): void {
  void (async () => {
    try {
      record(what, await run());
    } catch (e) {
      record(what, { written: 0, error: e instanceof Error ? e.message : String(e) });
    }
  })();
}

export function mirrorMeal(log: FoodLogForHealth): void {
  fire('your food log', () => pushMeals([log]));
}

export function mirrorMealRemoved(id: string): void {
  fire('a deleted food log', () => removeMeals([id]));
}

export function mirrorWeight(id: string, at: number, kg: number): void {
  fire('your weigh-in', () => pushWeight(at, kg, id));
}

/** A whole imported history at once. See pushWeights. */
export function mirrorWeights(entries: { id: string; at: number; kg: number }[]): void {
  if (entries.length === 0) return;
  fire('your imported weigh-ins', () => pushWeights(entries));
}

export function mirrorWeightRemoved(id: string): void {
  fire('a deleted weigh-in', () => removeWeights([id]));
}

export function mirrorWater(id: string, at: number, ml: number): void {
  fire('your water log', () => pushWater(at, ml, id));
}

export function mirrorWaterRemoved(id: string): void {
  fire('a deleted water log', () => removeWaters([id]));
}

export function mirrorWorkout(input: {
  id: string;
  startedAt: number;
  endedAt: number;
  title?: string;
  exerciseType?: number;
}): void {
  fire('your workout', () => pushWorkout(input));
}

export function mirrorWorkoutRemoved(id: string): void {
  fire('a deleted workout', () => removeWorkouts([id]));
}
