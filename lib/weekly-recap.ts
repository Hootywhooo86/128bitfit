/**
 * The week so far, Monday to now, against the week before.
 *
 * Pure: the queries hand over raw rows and this buckets them by local week.
 * Only counts what was logged. A day with no food logged is not a day protein
 * was missed, and a week with nothing in it has no "vs last week".
 */

const LB_PER_KG = 2.2046226218;

export type RecapInput = {
  now: Date;
  /** Completed strength sessions, by start time. */
  workouts: number[];
  /** Completed working sets. */
  sets: { at: number; reps: number | null; weight: number | null; unit: string | null }[];
  /** Finished cardio sessions. */
  cardio: { at: number; distanceM: number | null }[];
  /** Food logged, one entry per log. */
  food: { at: number; protein: number | null }[];
  proteinTarget: number | null;
  weightUnit: 'kg' | 'lb';
};

export type WeekTotals = {
  workouts: number;
  /** In the user's weight unit; null when no weighted set was done. */
  volume: number | null;
  cardioSessions: number;
  cardioM: number;
  /** Days with any food logged. */
  foodDays: number;
  /** Of those, days at or over the protein target. Null with no target. */
  proteinDays: number | null;
};

export type WeeklyRecap = {
  thisWeek: WeekTotals;
  /** Null when last week has nothing to compare against. */
  lastWeek: WeekTotals | null;
  /** Local midnight, Monday. */
  weekStart: Date;
};

/** Local midnight on the Monday of `now`'s week. */
export function mondayOf(now: Date): Date {
  const back = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function totals(input: RecapInput, from: number, to: number): WeekTotals {
  const inWeek = (t: number) => t >= from && t < to;
  let volume = 0;
  let weighted = false;
  for (const s of input.sets) {
    if (!inWeek(s.at) || s.weight == null || s.weight <= 0 || s.reps == null || s.reps <= 0) continue;
    const unit = s.unit === 'kg' ? 'kg' : 'lb';
    const w =
      unit === input.weightUnit ? s.weight : unit === 'kg' ? s.weight * LB_PER_KG : s.weight / LB_PER_KG;
    volume += w * s.reps;
    weighted = true;
  }
  const cardio = input.cardio.filter((c) => inWeek(c.at));
  const proteinByDay = new Map<string, number>();
  for (const f of input.food) {
    if (!inWeek(f.at)) continue;
    const k = dayKey(f.at);
    proteinByDay.set(k, (proteinByDay.get(k) ?? 0) + (f.protein ?? 0));
  }
  const target = input.proteinTarget;
  return {
    workouts: input.workouts.filter(inWeek).length,
    volume: weighted ? Math.round(volume) : null,
    cardioSessions: cardio.length,
    cardioM: cardio.reduce((m, c) => m + (c.distanceM ?? 0), 0),
    foodDays: proteinByDay.size,
    proteinDays: target && target > 0 ? [...proteinByDay.values()].filter((p) => p >= target).length : null,
  };
}

const isEmpty = (t: WeekTotals) => t.workouts === 0 && t.cardioSessions === 0 && t.foodDays === 0;

export function weeklyRecap(input: RecapInput): WeeklyRecap {
  const start = mondayOf(input.now);
  const lastStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
  const thisWeek = totals(input, start.getTime(), input.now.getTime() + 1);
  const lastWeek = totals(input, lastStart.getTime(), start.getTime());
  return { thisWeek, lastWeek: isEmpty(lastWeek) ? null : lastWeek, weekStart: start };
}

export { isEmpty as isEmptyWeek };
