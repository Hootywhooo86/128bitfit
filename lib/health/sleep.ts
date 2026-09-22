/**
 * Which day a night of sleep belongs to.
 *
 * The rule: the morning you wake up, not the evening you start.
 *
 * This is its own module because getting it wrong is silent. Every other
 * record here is a point or a counter and belongs to the day it started in;
 * sleep is the one that routinely spans midnight. Bucketing a 23:10–07:00
 * night by its start filed it under yesterday and left this morning empty, so
 * readiness asked for today, got nothing, and told someone who had slept fine
 * that there was no reading — after previously telling them they had slept
 * zero hours. Nothing about that looks like a bug from the outside.
 *
 * Every sleep tracker reports a night against the morning after it, and so
 * does this.
 *
 * Pure: sessions in, minutes per day out.
 */
import { dayKey } from './dates';

export type SleepSessionLike = {
  startTime: string;
  endTime: string;
};

/**
 * Minutes slept, keyed by the local calendar day of waking.
 *
 * Several sessions ending on the same day are summed — a broken night is still
 * one night's sleep, and a nap counts toward the day it happened on.
 */
export function sleepMinutesByWakeDay(
  sessions: readonly SleepSessionLike[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    // A session with no readable span is not a night of no sleep; it is not a
    // reading at all, and it must not pull a real total down to zero.
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const minutes = (end - start) / 60000;
    if (!(minutes > 0)) continue;

    const key = dayKey(new Date(end));
    out.set(key, (out.get(key) ?? 0) + Math.round(minutes));
  }
  return out;
}
