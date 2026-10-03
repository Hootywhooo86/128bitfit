/**
 * The three numbers at the top of a live session: sets, volume, elapsed.
 *
 * The prototype puts these up front and large. The app had the elapsed time as
 * a few small characters in the navigation title, which is the one number you
 * actually glance at between sets.
 *
 * Pure: takes the session's sets, returns what to show.
 */

export type StatSet = {
  completed: boolean;
  reps: number | null;
  weight: number | null;
  isWarmup: boolean;
  /** Set for a weight x distance set; those are left out of volume. */
  distanceM?: number | null;
};

export type SessionStats = {
  setsDone: number;
  setsTotal: number;
  /** Weight x reps over completed working sets. */
  volume: number;
  /**
   * True when a completed set could not contribute — no weight recorded, or no
   * reps. Bodyweight work is the common case: the set happened, the volume
   * number just cannot see it, and the UI should not imply an easy session.
   */
  volumePartial: boolean;
};

/**
 * Warm-ups count as sets but not as volume.
 *
 * They are work you did, so hiding them from the set count would misreport the
 * session. They are also deliberately light, so counting them as volume
 * inflates a number whose only use is comparing weeks — the convention in
 * every lifting log is working volume, and the user's own import carries 76
 * warm-up sets that would otherwise pad it.
 */
export function sessionStats(sets: readonly StatSet[]): SessionStats {
  let setsDone = 0;
  let volume = 0;
  let volumePartial = false;

  for (const s of sets) {
    if (!s.completed) continue;
    setsDone += 1;
    if (s.isWarmup) continue;

    // A carry or sled set is load x distance, not load x reps: it has its own
    // figure on its card and is not part of this one.
    if (s.distanceM != null) continue;
    const reps = typeof s.reps === 'number' && Number.isFinite(s.reps) ? s.reps : null;
    const weight = typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight : null;
    if (reps == null || weight == null) {
      volumePartial = true;
      continue;
    }
    volume += weight * reps;
  }

  return {
    setsDone,
    setsTotal: sets.length,
    volume: Math.round(volume),
    volumePartial,
  };
}

/** mm:ss, or h:mm:ss once a session runs past an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
