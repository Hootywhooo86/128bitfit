/**
 * The weekly training plan: which routine, if any, on each weekday.
 *
 * Fixed to weekdays. The prototype describes a rotation that shifts when a
 * day is missed; that needs rules nobody has specified yet, so this is the
 * plain version and the screen says so.
 */

/** Monday first, as the prototype lays it out. */
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** Per weekday: a routine id, 'rest', or null for "not planned". */
export type DayPlan = string | 'rest' | null;
export type WeekPlan = DayPlan[];

export const EMPTY_WEEK: WeekPlan = [null, null, null, null, null, null, null];

export function parseWeekPlan(raw: string | null): WeekPlan {
  if (!raw) return [...EMPTY_WEEK];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || v.length !== 7) return [...EMPTY_WEEK];
    return v.map((d) => (typeof d === 'string' && d ? d : null));
  } catch {
    return [...EMPTY_WEEK];
  }
}

/** Index into WEEKDAYS for a date: Monday 0 … Sunday 6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * What is planned for a day, with routines that no longer exist treated as
 * not planned — a deleted routine must not surface as today's session.
 */
export function planFor(plan: WeekPlan, day: Date, routineIds: ReadonlySet<string>): DayPlan {
  const p = plan[weekdayIndex(day)];
  if (p == null || p === 'rest') return p;
  return routineIds.has(p) ? p : null;
}

export function sessionsPerWeek(plan: WeekPlan, routineIds: ReadonlySet<string>): number {
  return plan.filter((p) => p != null && p !== 'rest' && routineIds.has(p)).length;
}
