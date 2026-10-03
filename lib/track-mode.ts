/**
 * Weight x reps, or weight x distance.
 *
 * Carries and sleds are not reps: a farmer's walk is a load moved a distance,
 * and logging it as "90 lb x 10" made it count 900 lb towards the session's
 * volume for a number that means nothing. Any exercise can be switched either
 * way; carries and sleds start on distance.
 *
 * Distance is always metres — one unit, no setting, so 40 m today and 40 m
 * last month are the same number.
 */
export type TrackMode = 'reps' | 'distance';

const DISTANCE_BY_DEFAULT = [
  /farmer/i,
  /suitcase/i,
  /\byoke\b/i,
  /\bsled\b/i,
  /prowler/i,
  /\bcarry\b/i,
  /\bcarries\b/i,
  /sandbag.*walk/i,
  /\bdrag\b/i,
];

/** What an exercise starts as when nobody has chosen. */
export function defaultTrack(exerciseName: string): TrackMode {
  // "Walking lunge" and friends move too, but they are counted in reps.
  if (/lunge|squat|curl|press/i.test(exerciseName)) return 'reps';
  return DISTANCE_BY_DEFAULT.some((r) => r.test(exerciseName)) ? 'distance' : 'reps';
}

/** The remembered choice, else the default. */
export function trackFor(
  exerciseId: string,
  exerciseName: string,
  remembered: Readonly<Record<string, TrackMode>>
): TrackMode {
  return remembered[exerciseId] ?? defaultTrack(exerciseName);
}

/** Parses the stored map, dropping anything that is not a mode. */
export function parseTrackPrefs(raw: string | null | undefined): Record<string, TrackMode> {
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    const out: Record<string, TrackMode> = {};
    for (const [k, m] of Object.entries(v ?? {})) if (m === 'reps' || m === 'distance') out[k] = m;
    return out;
  } catch {
    return {};
  }
}

export type DistanceSet = {
  weight: number | null;
  distanceM: number | null;
  completed: boolean;
  isWarmup?: boolean;
};

/**
 * Load x distance over the finished sets: 90 lb x 40 m = 3,600 lb·m. Null when
 * no set has both numbers — a sled pushed empty has distance but no load
 * figure to multiply, and that is not a 0.
 */
export function loadDistance(sets: readonly DistanceSet[]): number | null {
  let total = 0;
  let any = false;
  for (const s of sets) {
    if (!s.completed || s.isWarmup) continue;
    if (s.weight == null || s.distanceM == null || s.weight <= 0 || s.distanceM <= 0) continue;
    total += s.weight * s.distanceM;
    any = true;
  }
  return any ? Math.round(total) : null;
}

/** Bests for a distance exercise: the heaviest load moved, and the furthest. */
export function distanceBests(sets: readonly DistanceSet[]): { heaviest: number | null; furthest: number | null } {
  let heaviest: number | null = null;
  let furthest: number | null = null;
  for (const s of sets) {
    if (!s.completed || s.isWarmup) continue;
    if (s.weight != null && s.weight > 0 && s.distanceM != null && s.distanceM > 0) {
      heaviest = Math.max(heaviest ?? 0, s.weight);
    }
    if (s.distanceM != null && s.distanceM > 0) furthest = Math.max(furthest ?? 0, s.distanceM);
  }
  return { heaviest, furthest };
}

/** "3,600 lb·m" */
export function formatLoadDistance(value: number, unit: string): string {
  return `${Math.round(value).toLocaleString('en-US')} ${unit}·m`;
}

/**
 * Whether a distance set just ticked is a record against everything before
 * it: the heaviest load carried (any distance), or the furthest carried at a
 * load at least as heavy as before. One sentence, or null.
 */
export function distanceRecord(
  set: { weight: number | null; distanceM: number | null },
  before: readonly DistanceSet[],
  unit: string
): string | null {
  if (set.distanceM == null || set.distanceM <= 0) return null;
  const done = before.filter((s) => s.completed && !s.isWarmup && s.distanceM != null && s.distanceM > 0);
  // The first time is a starting point, not a record.
  if (done.length === 0) return null;
  const heaviest = Math.max(0, ...done.map((s) => s.weight ?? 0));
  if (set.weight != null && set.weight > heaviest) return `Heaviest yet: ${set.weight} ${unit} over ${set.distanceM} m`;
  const atLoad = done.filter((s) => (s.weight ?? 0) >= (set.weight ?? 0));
  const furthest = Math.max(0, ...atLoad.map((s) => s.distanceM ?? 0));
  if (atLoad.length > 0 && set.distanceM > furthest) {
    return `Furthest yet at ${set.weight ?? 0} ${unit}: ${set.distanceM} m`;
  }
  return null;
}
