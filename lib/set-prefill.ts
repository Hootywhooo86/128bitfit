/**
 * Choosing what a new set starts with.
 *
 * CLAUDE.md non-negotiable #1: "Logging a set takes under three seconds. Last
 * session's weights are pre-filled." Routines carry programming intent (how
 * many reps to aim for) but never a weight, so the weight has to come from what
 * the user actually lifted last time.
 *
 * Pure on purpose — the database lookup lives in db/workout-queries.ts, the
 * decision of what to do with the result lives here where it can be tested.
 */

export type PrefillSet = {
  reps: number | null;
  weight: number | null;
  weightUnit: string | null;
};

/** The most recent completed performance of one exercise. */
export type LastPerformance = {
  performedAt: Date;
  /** Completed sets only, in set order. */
  sets: PrefillSet[];
};

export const DEFAULT_WEIGHT_UNIT = 'lb';

/**
 * The template for set N of today's session.
 *
 * When today has more sets than last time, the extra ones reuse the final set
 * rather than coming up empty — someone doing 4 sets after last week's 3 is
 * continuing, not starting over.
 */
export function prefillForIndex(
  last: LastPerformance | null,
  index: number
): PrefillSet | null {
  if (!last || last.sets.length === 0) return null;
  if (index < 0) return null;
  return last.sets[index] ?? last.sets[last.sets.length - 1] ?? null;
}

/**
 * What to write into a newly created set.
 *
 * Reps prefer the routine's target when it has one, because that is the plan
 * for today; weight always comes from last time, because nothing else knows it.
 * `carryFrom` is the previous set in this same session, which wins over last
 * week for reps — it reflects what the user is doing right now.
 */
export function resolveSetSeed(opts: {
  last: LastPerformance | null;
  index: number;
  targetReps?: number | null;
  carryFrom?: PrefillSet | null;
}): { reps: number | null; weight: number | null; weightUnit: string } {
  const { last, index, targetReps, carryFrom } = opts;
  const template = prefillForIndex(last, index);

  const reps =
    carryFrom?.reps ??
    (targetReps != null ? targetReps : null) ??
    template?.reps ??
    null;

  const weight = carryFrom?.weight ?? template?.weight ?? null;

  const weightUnit =
    carryFrom?.weightUnit ?? template?.weightUnit ?? DEFAULT_WEIGHT_UNIT;

  return { reps, weight, weightUnit };
}

export type SetKind = 'working' | 'warmup' | 'drop' | 'rp';

/** A set already in today's block for this exercise, in set order. */
export type BlockSet = PrefillSet & { isWarmup: boolean; setType: 'normal' | 'drop' | 'rp' };

const isWorking = (s: BlockSet) => !s.isWarmup && s.setType === 'normal';

/**
 * What a set added mid-session starts with.
 *
 * Warm-ups, drop sets and rest-pause sets are different lifts from the working
 * sets and must not be mistaken for them in either direction:
 *
 * - A working set counts only working sets for its position, so two warm-ups
 *   before set 1 do not make it pre-fill from last week's third set, and it
 *   carries only from the previous working set, never a warm-up's empty bar.
 * - A warm-up carries from the warm-up before it, or starts blank. Last week's
 *   warm-ups are not recorded as history (see getLastPerformance), and a
 *   working weight on a warm-up row would be the wrong number to confirm.
 * - A drop or rest-pause set follows the set just done, so it starts from that
 *   set's numbers for the user to step down from.
 */
export function seedForNewSet(opts: {
  kind: SetKind;
  block: BlockSet[];
  last: LastPerformance | null;
}): { reps: number | null; weight: number | null; weightUnit: string } {
  const { kind, block, last } = opts;
  const lastOf = (pick: (s: BlockSet) => boolean) => [...block].reverse().find(pick) ?? null;
  const unit = (from: PrefillSet | null) =>
    from?.weightUnit ?? lastOf(isWorking)?.weightUnit ?? last?.sets[0]?.weightUnit ?? DEFAULT_WEIGHT_UNIT;

  if (kind === 'warmup') {
    const prev = lastOf((s) => s.isWarmup);
    return { reps: prev?.reps ?? null, weight: prev?.weight ?? null, weightUnit: unit(prev) };
  }

  if (kind === 'drop' || kind === 'rp') {
    const prev = lastOf((s) => !s.isWarmup);
    if (prev) return { reps: prev.reps, weight: prev.weight, weightUnit: unit(prev) };
  }

  return resolveSetSeed({
    last,
    index: block.filter(isWorking).length,
    carryFrom: lastOf(isWorking),
  });
}

/** "135 × 8" for the hint under an input, or null when there is nothing to show. */
export function describePrefill(set: PrefillSet | null): string | null {
  if (!set) return null;
  const hasWeight = set.weight != null;
  const hasReps = set.reps != null;
  if (!hasWeight && !hasReps) return null;
  const unit = set.weightUnit ?? DEFAULT_WEIGHT_UNIT;
  if (hasWeight && hasReps) return `${set.weight} ${unit} × ${set.reps}`;
  if (hasWeight) return `${set.weight} ${unit}`;
  return `${set.reps} reps`;
}

/**
 * A whole previous session in one line: "135 x 8, 135 x 8, 145 x 6 lb".
 *
 * Shown next to the exercise so a pre-filled number reads as last week's,
 * not as something already logged today. Trims to `maxSets` with an ellipsis
 * rather than wrapping onto a second line.
 */
export function describeLastPerformance(
  last: LastPerformance | null,
  maxSets = 4
): string | null {
  if (!last || last.sets.length === 0) return null;

  const shown = last.sets.slice(0, Math.max(1, maxSets));
  const parts = shown.map((set) => {
    if (set.weight != null && set.reps != null) return `${set.weight}\u00d7${set.reps}`;
    if (set.weight != null) return `${set.weight}`;
    if (set.reps != null) return `${set.reps} reps`;
    return null;
  });
  if (parts.every((p) => p == null)) return null;

  const body = parts.filter((p): p is string => p != null).join(', ');
  const truncated = last.sets.length > shown.length ? `${body}...` : body;

  // Only name a unit when every set shares one; mixed units would be a lie.
  const units = new Set(
    last.sets.filter((set) => set.weight != null).map((set) => set.weightUnit ?? DEFAULT_WEIGHT_UNIT)
  );
  const unit = units.size === 1 ? ` ${[...units][0]}` : '';
  return `${truncated}${unit}`;
}
