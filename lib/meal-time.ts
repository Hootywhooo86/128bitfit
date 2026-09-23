/**
 * When a meal actually happened, as opposed to when you got round to logging it.
 *
 * Every screen stamped food with `new Date()`, so someone who sits down at
 * bedtime and enters the whole day got breakfast, lunch and dinner all timed
 * 22:00 — and anything entered after midnight landed on the wrong day, which
 * silently moved it out of the day's totals it belonged to.
 *
 * Picking the slot is the instruction. This works out the time from it.
 *
 * Pure, and deliberately local-time: a meal belongs to the calendar day you
 * ate it on, in the timezone you were standing in.
 */
import type { MealType } from '@/db/schema';

/**
 * A representative hour for each slot.
 *
 * Not a claim about when you ate — it is the middle of when that meal usually
 * happens, so the ordering within a day comes out right. A snack has no such
 * hour, which is why it keeps the current time instead.
 */
const SLOT_HOUR: Record<Exclude<MealType, 'snack'>, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [19, 0],
};

export type MealDay = 'today' | 'yesterday';

/**
 * The timestamp to log a meal with.
 *
 * Two rules do the work:
 *
 * Never in the future. You cannot have eaten something you have not eaten yet,
 * and a future timestamp would sort ahead of real food and push the meal into
 * a day that has not happened.
 *
 * A slot whose hour has not arrived yet belongs to yesterday. At 00:30, "dinner"
 * means the dinner six hours ago, not the one nineteen hours away. Without this
 * the after-midnight log — the exact case someone entering their day late runs
 * into — silently files under tomorrow.
 */
export function mealTimestamp(
  mealType: MealType,
  day: MealDay = 'today',
  now: Date = new Date()
): Date {
  if (mealType === 'snack') {
    // A snack is whenever. Only shift it if the user said yesterday.
    if (day === 'today') return new Date(now);
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }

  const [hour, minute] = SLOT_HOUR[mealType];
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (day === 'yesterday') at.setDate(at.getDate() - 1);

  // The slot has not come round yet today, so it means yesterday's.
  if (at.getTime() > now.getTime()) at.setDate(at.getDate() - 1);
  return at;
}

/** What the screen says it is about to do, so the choice is never a surprise. */
export function describeMealTime(at: Date, now: Date = new Date()): string {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay(at, now)) return `today ${time}`;
  if (sameDay(at, yesterday)) return `yesterday ${time}`;
  return `${at.toLocaleDateString()} ${time}`;
}
