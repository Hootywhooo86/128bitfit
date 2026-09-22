/**
 * Muscle load — sets worked per muscle group over a period.
 *
 * This is the one place CLAUDE.md allows colour: "The only colour in the app is
 * muscle load: yellow (1-3 sets) -> orange (4-7) -> red (8+)". Untrained stays
 * greyscale, because grey is the absence of load rather than a low amount of it.
 *
 * Pure: the database aggregation lives in db/muscle-queries.ts.
 */

/** Every muscle the bundled exercise database actually uses. */
export const MUSCLE_GROUPS = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

const GROUP_SET = new Set<string>(MUSCLE_GROUPS);

/** Display names. The data uses lower case; headings want title case. */
export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  abdominals: 'Abs',
  abductors: 'Abductors',
  adductors: 'Adductors',
  biceps: 'Biceps',
  calves: 'Calves',
  chest: 'Chest',
  forearms: 'Forearms',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  lats: 'Lats',
  'lower back': 'Lower back',
  'middle back': 'Mid back',
  neck: 'Neck',
  quadriceps: 'Quads',
  shoulders: 'Shoulders',
  traps: 'Traps',
  triceps: 'Triceps',
};

/**
 * A set counts fully for the muscle an exercise targets and half for the ones
 * it assists. Assisting muscles do real work, but counting them the same would
 * make every pressing day look like a triceps day.
 */
export const SECONDARY_SET_WEIGHT = 0.5;

/** Buckets straight from the brief. `none` is absence, not a low amount. */
export type LoadLevel = 'none' | 'light' | 'medium' | 'heavy';

export function loadLevel(sets: number): LoadLevel {
  if (!Number.isFinite(sets) || sets <= 0) return 'none';
  if (sets < 4) return 'light'; // 1-3
  if (sets < 8) return 'medium'; // 4-7
  return 'heavy'; // 8+
}

/** One exercise's contribution: how many sets, and which muscles it worked. */
export type MuscleWorkEntry = {
  completedSets: number;
  primaryMuscles: string[];
  secondaryMuscles: string[];
};

export type MuscleTally = Record<MuscleGroup, number>;

export function emptyTally(): MuscleTally {
  return Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleTally;
}

/**
 * Sums set counts per muscle.
 *
 * Unknown muscle names are ignored rather than guessed at — a typo in the data
 * should show up as a missing muscle, not as load attributed to the wrong one.
 */
export function tallyMuscleSets(entries: MuscleWorkEntry[]): MuscleTally {
  const tally = emptyTally();

  for (const entry of entries) {
    const sets = Number.isFinite(entry.completedSets) ? entry.completedSets : 0;
    if (sets <= 0) continue;

    for (const raw of entry.primaryMuscles) {
      const m = raw?.trim().toLowerCase();
      if (m && GROUP_SET.has(m)) tally[m as MuscleGroup] += sets;
    }
    for (const raw of entry.secondaryMuscles) {
      const m = raw?.trim().toLowerCase();
      if (m && GROUP_SET.has(m)) tally[m as MuscleGroup] += sets * SECONDARY_SET_WEIGHT;
    }
  }

  // Half-sets are real, but three decimal places are not informative.
  for (const m of MUSCLE_GROUPS) tally[m] = Math.round(tally[m] * 10) / 10;
  return tally;
}

/**
 * How a muscle was worked in a session, which is what the map colours by.
 *
 * `primary` means at least one exercise named it as a target; `secondary`
 * means it only ever assisted. A muscle that was both is primary — the harder
 * classification wins, because that is what the training actually was.
 */
export type MuscleRole = 'primary' | 'secondary' | 'none';
export type MuscleRoles = Record<MuscleGroup, MuscleRole>;

export function emptyRoles(): MuscleRoles {
  const out = {} as MuscleRoles;
  for (const m of MUSCLE_GROUPS) out[m] = 'none';
  return out;
}

export function muscleRoles(entries: MuscleWorkEntry[]): MuscleRoles {
  const roles = emptyRoles();
  for (const entry of entries) {
    const sets = Number.isFinite(entry.completedSets) ? entry.completedSets : 0;
    if (sets <= 0) continue;

    for (const raw of entry.secondaryMuscles) {
      const m = raw?.trim().toLowerCase();
      // Only promotes from none: a primary claim later must still win.
      if (m && GROUP_SET.has(m) && roles[m as MuscleGroup] === 'none') {
        roles[m as MuscleGroup] = 'secondary';
      }
    }
    for (const raw of entry.primaryMuscles) {
      const m = raw?.trim().toLowerCase();
      if (m && GROUP_SET.has(m)) roles[m as MuscleGroup] = 'primary';
    }
  }
  return roles;
}

/** Muscles sorted by load, heaviest first. Ties keep alphabetical order. */
export function rankMuscles(tally: MuscleTally): { muscle: MuscleGroup; sets: number }[] {
  return MUSCLE_GROUPS.map((muscle) => ({ muscle, sets: tally[muscle] })).sort(
    (a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)
  );
}

/**
 * The muscles doing least, for a balance prompt. Only meaningful once something
 * has been trained — with an empty tally every muscle is equally neglected and
 * saying so is noise.
 */
export function neglectedMuscles(tally: MuscleTally, limit = 3): MuscleGroup[] {
  const ranked = rankMuscles(tally);
  if (ranked[0].sets <= 0) return [];
  return ranked
    .slice()
    .reverse()
    .slice(0, limit)
    .map((r) => r.muscle);
}
