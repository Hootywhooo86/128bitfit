/**
 * What FIT posts to the 128bit family feed, in the shapes 128bittracker's
 * timeline reads (its docs/EVENTS.md). See docs/family-feed.md.
 *
 * Every event has a fixed id, so posting it again replaces it: a day's steps
 * grow through the day, and a workout edited later is sent again. That makes
 * syncing a plain "send the last two weeks", with no queue to lose.
 *
 * `null` means "not measured", never 0 — the same rule as every screen here.
 */
export type FamilyEvent = {
  id: string;
  app: 'fit';
  type: 'workout.logged' | 'health.day';
  at: number;
  data: Record<string, string | number | null>;
};

const minutesBetween = (start: Date | null, end: Date | null): number | null =>
  start && end && end.getTime() > start.getTime() ? Math.round((end.getTime() - start.getTime()) / 60_000) : null;

export function strengthEvent(s: {
  id: string;
  startedAt: Date | null;
  endedAt: Date | null;
  exerciseCount: number;
  completedSets: number;
  names: string[];
}): FamilyEvent | null {
  if (!s.startedAt) return null;
  return {
    id: `fit-workout-${s.id}`,
    app: 'fit',
    type: 'workout.logged',
    at: s.startedAt.getTime(),
    data: {
      kind: 'strength',
      name: s.names.length ? s.names.join(' · ') : 'Workout',
      minutes: minutesBetween(s.startedAt, s.endedAt),
      exercises: s.exerciseCount,
      sets: s.completedSets,
    },
  };
}

export function cardioEvent(c: {
  id: string;
  sportLabel: string;
  startedAt: number;
  movingS: number | null;
  elapsedS: number | null;
  distanceM: number | null;
}): FamilyEvent {
  const seconds = c.movingS ?? c.elapsedS;
  return {
    id: `fit-cardio-${c.id}`,
    app: 'fit',
    type: 'workout.logged',
    at: c.startedAt,
    data: {
      kind: 'cardio',
      name: c.sportLabel,
      minutes: seconds != null ? Math.round(seconds / 60) : null,
      km: c.distanceM != null ? Math.round(c.distanceM / 10) / 100 : null,
    },
  };
}

export function healthDayEvent(d: {
  date: string;
  steps: number | null;
  sleepMinutes: number | null;
  restingHeartRate: number | null;
  activeCalories: number | null;
  distanceMeters: number | null;
}): FamilyEvent | null {
  const fields = [d.steps, d.sleepMinutes, d.restingHeartRate, d.activeCalories, d.distanceMeters];
  // A day with nothing measured is not worth a row on anyone's timeline.
  if (fields.every((v) => v == null)) return null;
  const [y, m, day] = d.date.split('-').map(Number);
  return {
    id: `fit-health-${d.date}`,
    app: 'fit',
    type: 'health.day',
    at: new Date(y, m - 1, day).getTime(),
    data: {
      date: d.date,
      steps: d.steps,
      sleepMinutes: d.sleepMinutes,
      restingHeartRate: d.restingHeartRate,
      activeCalories: d.activeCalories != null ? Math.round(d.activeCalories) : null,
      km: d.distanceMeters != null ? Math.round(d.distanceMeters / 10) / 100 : null,
    },
  };
}
