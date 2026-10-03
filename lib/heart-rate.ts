/**
 * Heart rate over a session, for the summary graph.
 *
 * A watch can log a sample a second, so an hour is thousands of points; the
 * graph needs about a hundred. Averaging into equal slices of time keeps the
 * shape without the noise, and a slice with no samples stays a gap rather
 * than being drawn as a line through data that does not exist.
 *
 * Pure, so it is tested.
 */
import type { HeartRateSample } from './health/types';

export type HeartRateSummary = {
  avg: number;
  max: number;
  min: number;
  /** Averaged slices; `bpm` null where the watch recorded nothing. */
  points: { t: number; bpm: number | null }[];
};

export const HR_POINTS = 120;

/** Null with no samples at all: that is "not recorded", not a heart rate. */
export function summariseHeartRate(
  samples: readonly HeartRateSample[],
  startMs: number,
  endMs: number,
  slices = HR_POINTS
): HeartRateSummary | null {
  const inside = samples.filter((s) => s.t >= startMs && s.t <= endMs && Number.isFinite(s.bpm) && s.bpm > 0);
  if (inside.length === 0 || !(endMs > startMs)) return null;
  const span = endMs - startMs;
  const n = Math.max(1, Math.min(slices, inside.length));
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  for (const s of inside) {
    const i = Math.min(n - 1, Math.floor(((s.t - startMs) / span) * n));
    sums[i] += s.bpm;
    counts[i] += 1;
  }
  const bpms = inside.map((s) => s.bpm);
  return {
    avg: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
    max: Math.max(...bpms),
    min: Math.min(...bpms),
    points: sums.map((sum, i) => ({
      t: startMs + ((i + 0.5) / n) * span,
      bpm: counts[i] ? Math.round(sum / counts[i]) : null,
    })),
  };
}

/** A watch more than this behind the end of the session is still syncing. */
export const SYNC_GAP_MS = 3 * 60_000;

/**
 * Whether the readings stop well before the session did — the watch has not
 * handed the rest to Health Connect yet, rather than having nothing to give.
 */
export function heartRateStillSyncing(lastSampleAt: number, endedAt: number): boolean {
  return endedAt - lastSampleAt > SYNC_GAP_MS;
}
