/**
 * What counts as a personal record.
 *
 * Two kinds, kept apart because one is a fact and the other is arithmetic:
 *
 *   weight   — the heaviest you have ever lifted on this exercise. A
 *              measurement. It happened.
 *   estimate — the best estimated one-rep max. A formula applied to a set you
 *              did do, which is not the same as a lift you have made.
 *
 * The app awards a trophy for either and says which. Presenting an estimated
 * 1RM as a lift would be claiming a number nobody put on a bar, which is the
 * fake-measurement mistake CLAUDE.md exists to prevent — so the estimate is
 * always labelled and never shown as a weight you lifted.
 *
 * Pure: sets in, records out.
 */

export type RecordSet = {
  weight: number | null;
  reps: number | null;
  /** Records are compared within one unit; mixing them would be meaningless. */
  unit: 'kg' | 'lb';
};

/**
 * Epley: 1RM = w × (1 + r/30).
 *
 * Capped at twelve reps. The formula is fitted to low-rep work and drifts badly
 * past that — a set of twenty would "estimate" a lift nobody could make, and
 * handing someone a fictional number to chase is worse than handing them none.
 */
export const MAX_REPS_FOR_ESTIMATE = 12;

export function estimateOneRepMax(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null) return null;
  if (!(weight > 0) || !(reps > 0)) return null;
  if (reps > MAX_REPS_FOR_ESTIMATE) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export type ExerciseRecord = {
  /** Heaviest weight lifted, and the reps it was lifted for. */
  heaviest: RecordSet | null;
  /** The set with the best estimated 1RM, and that estimate. */
  bestEstimate: (RecordSet & { oneRepMax: number }) | null;
};

export const NO_RECORD: ExerciseRecord = { heaviest: null, bestEstimate: null };

/** A set only counts toward a record if it was actually completed and loaded. */
function usable(s: RecordSet): boolean {
  return s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0;
}

/**
 * The best a list of sets contains.
 *
 * Ties keep the earlier set: matching your record is not beating it, and a
 * trophy for equalling a lift you already made would cheapen the real ones.
 */
export function recordFrom(sets: readonly RecordSet[]): ExerciseRecord {
  let heaviest: RecordSet | null = null;
  let bestEstimate: (RecordSet & { oneRepMax: number }) | null = null;

  for (const s of sets) {
    if (!usable(s)) continue;
    if (heaviest == null || s.weight! > heaviest.weight!) heaviest = s;

    const orm = estimateOneRepMax(s.weight, s.reps);
    if (orm != null && (bestEstimate == null || orm > bestEstimate.oneRepMax)) {
      bestEstimate = { ...s, oneRepMax: orm };
    }
  }
  return { heaviest, bestEstimate };
}

export type PrKind = 'weight' | 'estimate';

export type PrResult = {
  /** Empty when the set beat nothing. */
  kinds: PrKind[];
  /** One plain sentence, or null when it is not a record. */
  note: string | null;
};

const NOT_A_PR: PrResult = { kinds: [], note: null };

/**
 * Whether a set beats what came before it.
 *
 * `previous` is the record built from every earlier completed set of the same
 * exercise — earlier, not including this one, or every set would beat itself.
 *
 * The very first loaded set of an exercise is deliberately not a record. It is
 * true that it is your best so far, but a trophy on it means nothing and the
 * screen would be a wall of them after an import.
 */
export function prFor(set: RecordSet, previous: ExerciseRecord): PrResult {
  if (!usable(set)) return NOT_A_PR;
  // No explicit "nothing to beat yet" guard: each comparison below already
  // requires the record it beats to exist, so the first ever set falls out as
  // not-a-record on its own. A separate check for it would be a branch no test
  // could tell the difference about, which is worse than no check.
  //
  // Comparing a kilo record against a pound one would invent a PR every time
  // the user switched units.
  if (previous.heaviest && previous.heaviest.unit !== set.unit) return NOT_A_PR;

  const kinds: PrKind[] = [];
  if (previous.heaviest != null && set.weight! > previous.heaviest.weight!) {
    kinds.push('weight');
  }

  const orm = estimateOneRepMax(set.weight, set.reps);
  if (orm != null && previous.bestEstimate != null && orm > previous.bestEstimate.oneRepMax) {
    kinds.push('estimate');
  }

  if (kinds.length === 0) return NOT_A_PR;

  const w = `${trim(set.weight!)} ${set.unit}`;
  if (kinds.includes('weight')) {
    const by = trim(set.weight! - previous.heaviest!.weight!);
    return { kinds, note: `Heaviest ${w} yet — up ${by} ${set.unit}` };
  }
  // Estimate only: the weight is not a record, the effort behind it is.
  return {
    kinds,
    note: `Best set yet at ${w} × ${set.reps} — estimated 1RM ${trim(orm!)} ${set.unit}`,
  };
}

/** No trailing .0 on whole numbers; one decimal otherwise. */
function trim(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Whether a set just ticked mid-workout is a record, for the trophy on the spot.
 *
 * It has to beat every earlier session *and* every other set already logged
 * today — a second, heavier set of the same exercise is a new record too, and
 * gets its own trophy. What it never does is award one on the first session of
 * an exercise: with no history there is nothing to beat, and "heavier than the
 * set you did five minutes ago" on day one is not a personal record, it is a
 * warm-up. Same rule as prFor, applied to the history alone.
 */
export function livePr(
  set: RecordSet,
  before: readonly RecordSet[],
  earlierToday: readonly RecordSet[]
): PrResult {
  if (recordFrom(before).heaviest == null) return NOT_A_PR;
  return prFor(set, recordFrom([...before, ...earlierToday]));
}
