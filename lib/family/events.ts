/**
 * The 128bit family feed, pure part: what 128BIT FIT posts and how the outbox
 * holds it. No storage, no network, so it is tested directly.
 *
 * The feed itself is a table in the user's own Supabase project (the one
 * 128bitPlay and 128bit Tracker use). Schema: docs/family-feed.md here, and
 * docs/EVENTS.md in 128bittracker.
 */
import type { HealthDay } from '@/lib/health/types';

export type FamilyEvent = {
  /** Same id again replaces the event, so a day's totals can keep updating. */
  id: string;
  app: 'fit';
  type: 'workout.logged' | 'health.day';
  /** ms since 1970. */
  at: number;
  data: Record<string, string | number | null>;
};

export type OutboxItem = { op: 'put'; event: FamilyEvent } | { op: 'delete'; id: string };

/** Oldest dropped beyond this, so a phone offline for months can't grow without end. */
export const OUTBOX_MAX = 500;

/**
 * Adds to the outbox. A newer put or delete for the same id replaces anything
 * still waiting for it: only the latest state needs to go up.
 */
export function enqueue(outbox: readonly OutboxItem[], item: OutboxItem): OutboxItem[] {
  const id = item.op === 'put' ? item.event.id : item.id;
  const next = outbox.filter((o) => (o.op === 'put' ? o.event.id : o.id) !== id);
  next.push(item);
  return next.length > OUTBOX_MAX ? next.slice(next.length - OUTBOX_MAX) : next;
}

export const workoutEventId = (localId: string) => `fit-${localId}`;

export function strengthEvent(input: {
  id: string;
  startedAt: number;
  endedAt: number;
  title: string;
  exercises: number;
  sets: number;
}): FamilyEvent {
  return {
    id: workoutEventId(input.id),
    app: 'fit',
    type: 'workout.logged',
    at: input.endedAt,
    data: {
      kind: 'strength',
      name: input.title,
      minutes: Math.max(1, Math.round((input.endedAt - input.startedAt) / 60_000)),
      exercises: input.exercises,
      sets: input.sets,
    },
  };
}

export function cardioEvent(input: {
  id: string;
  startedAt: number;
  endedAt: number;
  sport: string;
  distanceM: number | null;
}): FamilyEvent {
  return {
    id: workoutEventId(input.id),
    app: 'fit',
    type: 'workout.logged',
    at: input.endedAt,
    data: {
      kind: 'cardio',
      name: input.sport,
      minutes: Math.max(1, Math.round((input.endedAt - input.startedAt) / 60_000)),
      // A distance that wasn't measured stays null, never 0.
      km: input.distanceM == null ? null : Math.round(input.distanceM / 10) / 100,
    },
  };
}

/**
 * One day of health totals, or null when nothing was read that day.
 *
 * Only measured fields go up, and null stays null: a missing reading is not a
 * zero. Weight is left out on purpose — it is the most sensitive number here
 * and the timeline doesn't need it.
 */
export function healthDayEvent(day: HealthDay, now = Date.now()): FamilyEvent | null {
  const data = {
    steps: day.steps,
    sleepMinutes: day.sleepMinutes,
    restingHeartRate: day.restingHeartRate,
    activeCalories: day.activeCalories == null ? null : Math.round(day.activeCalories),
    km: day.distanceMeters == null ? null : Math.round(day.distanceMeters / 10) / 100,
  };
  if (Object.values(data).every((v) => v == null)) return null;
  const [y, m, d] = day.date.split('-').map(Number);
  const endOfDay = new Date(y, m - 1, d, 23, 59).getTime();
  return {
    id: `fit-health-${day.date}`,
    app: 'fit',
    type: 'health.day',
    // Today's totals sit at "now" and move along as they're updated.
    at: Math.min(endOfDay, now),
    data: { date: day.date, ...data },
  };
}
