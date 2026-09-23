/**
 * What you have not trained lately, and a session that would fix it.
 *
 * The selection is deliberately local and deterministic, not a model call. It
 * has to work in a gym with no signal and with no API key configured, and the
 * question — which muscles have had no sets in 30 days — is arithmetic, not
 * judgement. A model adds nothing to it and would make the feature fail
 * exactly where it is used.
 *
 * Pure: takes the same MuscleWorkEntry[] the muscle map is built from.
 */
import {
  MUSCLE_GROUPS,
  emptyTally,
  loadLevel,
  tallyMuscleSets,
  type LoadLevel,
  type MuscleGroup,
  type MuscleTally,
  type MuscleWorkEntry,
} from './muscle-load';

export type MuscleGap = {
  muscle: MuscleGroup;
  /** Weighted sets in the window. Assisting counts half — see muscle-load. */
  sets: number;
  level: LoadLevel;
};

export type GapReport =
  /** Nothing completed in the window. "Neglected" would mean everything. */
  | { status: 'no_history'; untaggedSets: 0; taggedSets: 0 }
  /**
   * More of the work came from exercises with no muscles on them than from
   * exercises with muscles. Ranking on that would report muscles as neglected
   * when they were trained by something the library cannot attribute — the
   * same trap the grey muscle map fell into.
   */
  | { status: 'untrustworthy'; untaggedSets: number; taggedSets: number }
  | {
      status: 'ok';
      /** Least-trained first; muscles with no sets at all lead. */
      neglected: MuscleGap[];
      tally: MuscleTally;
      untaggedSets: number;
      taggedSets: number;
    };

const GROUPS = new Set<string>(MUSCLE_GROUPS);

function normalise(list: readonly string[]): MuscleGroup[] {
  const out: MuscleGroup[] = [];
  for (const raw of list) {
    const m = raw?.trim().toLowerCase();
    if (m && GROUPS.has(m) && !out.includes(m as MuscleGroup)) out.push(m as MuscleGroup);
  }
  return out;
}

/**
 * Whether this exercise can tell us which muscles it worked.
 *
 * Recognised muscles, not merely a non-empty list. An import that tagged
 * everything "pecs" and "delts" has names on every row and contributes nothing
 * to the tally, so counting it as attributed would let the trustworthiness
 * check pass while every muscle still read zero — the exact failure the check
 * exists to catch.
 */
function isTagged(e: MuscleWorkEntry): boolean {
  return normalise(e.primaryMuscles).length > 0 || normalise(e.secondaryMuscles).length > 0;
}

function setsOf(e: MuscleWorkEntry): number {
  return Number.isFinite(e.completedSets) && e.completedSets > 0 ? e.completedSets : 0;
}

/**
 * Ranks the muscle groups by how little they were trained in the window.
 *
 * Zero here is a real reading — you trained, and this muscle got nothing — but
 * only once there is training to read. With no sessions at all, every muscle
 * reads zero for the same uninformative reason, so that is its own status
 * rather than a list of seventeen "neglected" muscles.
 */
export function gapReport(entries: readonly MuscleWorkEntry[]): GapReport {
  let taggedSets = 0;
  let untaggedSets = 0;
  for (const e of entries) {
    const n = setsOf(e);
    if (n <= 0) continue;
    if (isTagged(e)) taggedSets += n;
    else untaggedSets += n;
  }

  if (taggedSets === 0 && untaggedSets === 0) {
    return { status: 'no_history', untaggedSets: 0, taggedSets: 0 };
  }
  if (untaggedSets > taggedSets) {
    return { status: 'untrustworthy', untaggedSets, taggedSets };
  }

  // No filter needed: tallyMuscleSets already ignores any name outside
  // MUSCLE_GROUPS, so an untagged or mis-tagged exercise contributes nothing.
  // isTagged is what decides whether the ranking is trustworthy at all.
  const tally = tallyMuscleSets(entries as MuscleWorkEntry[]);
  const neglected = MUSCLE_GROUPS.map((muscle) => ({
    muscle,
    sets: tally[muscle],
    level: loadLevel(tally[muscle]),
  }))
    // Least first, then alphabetical so the same history always ranks the same.
    .sort((a, b) => a.sets - b.sets || a.muscle.localeCompare(b.muscle));

  return { status: 'ok', neglected, tally, untaggedSets, taggedSets };
}

/** Just enough of an exercise to choose one. */
export type PickableExercise = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** True when the user has logged it before, so last time's weights prefill. */
  familiar?: boolean;
};

export type SuggestedExercise = {
  exercise: PickableExercise;
  /** Which of the neglected muscles this was chosen for. */
  covers: MuscleGroup[];
};

/**
 * Builds a session out of the neglected muscles.
 *
 * Greedy cover: repeatedly take the exercise that targets the most muscles
 * still uncovered. Targeting counts, assisting does not — a session picked on
 * assistance would leave the muscle just as untrained as it started.
 *
 * Ties go to an exercise the user has done before, then to the one covering
 * more muscles overall, then by name. The last of those exists so the same
 * history suggests the same session twice running: a plan that reshuffles
 * every time you open it is not a plan.
 */
export function suggestSession(
  gaps: readonly MuscleGap[],
  library: readonly PickableExercise[],
  maxExercises = 5
): SuggestedExercise[] {
  if (gaps.length === 0 || library.length === 0 || maxExercises <= 0) return [];

  // Normalise once. Doing it inside the selection loop re-parsed every
  // exercise's muscles on every round, which on a 900-exercise library is a
  // few thousand needless passes per suggestion.
  const candidates = library.map((e) => ({ e, primary: normalise(e.primaryMuscles) }));

  const remaining = new Set<MuscleGroup>(gaps.map((g) => g.muscle));
  const chosen: SuggestedExercise[] = [];
  const used = new Set<string>();

  /** Higher is better. Compared in order, first difference wins. */
  const rank = (c: (typeof candidates)[number], covers: number) => [
    covers,
    c.e.familiar === true ? 1 : 0,
    c.primary.length,
  ];

  while (chosen.length < maxExercises && remaining.size > 0) {
    let best: { c: (typeof candidates)[number]; covers: MuscleGroup[] } | null = null;
    let bestRank: number[] = [];

    for (const c of candidates) {
      if (used.has(c.e.id)) continue;
      const covers = c.primary.filter((m) => remaining.has(m));
      if (covers.length === 0) continue;

      const r = rank(c, covers.length);
      if (best === null) {
        best = { c, covers };
        bestRank = r;
        continue;
      }
      let better = false;
      for (let i = 0; i < r.length; i += 1) {
        if (r[i] !== bestRank[i]) {
          better = r[i] > bestRank[i];
          break;
        }
        // All equal: name decides, so the same history suggests the same
        // session twice running. A plan that reshuffles is not a plan.
        if (i === r.length - 1) better = c.e.name.localeCompare(best.c.e.name) < 0;
      }
      if (better) {
        best = { c, covers };
        bestRank = r;
      }
    }

    // Nothing in the library targets what is left. Stop rather than pad the
    // session with exercises that do not address the gap.
    if (!best) break;

    chosen.push({ exercise: best.c.e, covers: best.covers });
    used.add(best.c.e.id);
    for (const m of best.covers) remaining.delete(m);
  }

  return chosen;
}

/** The empty tally, for a caller that wants the shape without any history. */
export { emptyTally };
