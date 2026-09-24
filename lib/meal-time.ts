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

/**
 * Which calendar day the meal belongs to.
 *
 * A `Date` is any day you have navigated to in Fuel — its time of day is
 * ignored, only the calendar date is read.
 */
export type MealDay = 'today' | 'yesterday' | Date;

/** The calendar day `day` names, as year/month/date on a copy of `now`. */
function resolveDay(day: MealDay, now: Date): Date {
  const at = new Date(now);
  if (day === 'today') return at;
  if (day === 'yesterday') {
    at.setDate(at.getDate() - 1);
    return at;
  }
  at.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return at;
}

/**
 * The timestamp to log a meal with.
 *
 * The day is whatever the user picked, and nothing here ever changes it. Food
 * logged today lands on today. That sounds obvious, and it is exactly what the
 * old rule broke: the slot hour was used to infer which *day* a meal belonged
 * to, so logging lunch at 12:10 — twenty minutes before the slot's nominal
 * 12:30 — filed it a full day back, where the user could not see it.
 *
 * SLOT_HOUR says of itself that it is "not a claim about when you ate", only a
 * representative hour so meals sort correctly within a day. Reading a day out
 * of it was a category error. Yesterday is a thing the user says, with "A day
 * earlier" here or by picking the day in Fuel, not something inferred from the
 * clock.
 *
 * So one rule is left: never in the future. You cannot have eaten something
 * you have not eaten yet, a future timestamp sorts ahead of real food, and
 * Health Connect gets a copy of this stamp. A slot whose hour has not come
 * round yet falls back to the current time — still the chosen day.
 */
export function mealTimestamp(
  mealType: MealType,
  day: MealDay = 'today',
  now: Date = new Date()
): Date {
  // A snack is whenever, so it keeps the clock time — on whichever day.
  const at = resolveDay(day, now);
  if (mealType !== 'snack') {
    const [hour, minute] = SLOT_HOUR[mealType];
    at.setHours(hour, minute, 0, 0);
    // The slot's hour has not come round yet, so it cannot be used as the
    // time. Fall back to the clock — never to another day.
    //
    // Only reachable when the chosen day is today: on any past day every slot
    // hour has already passed. So the clock is the right answer, and the final
    // guard below covers a day somehow in the future.
    if (at.getTime() > now.getTime()) return new Date(now);
  }

  // Never in the future, whatever was asked for. A day picker can be handed
  // tomorrow by a stale clamp or a clock that moved; food nobody has eaten
  // must not get a timestamp that sorts ahead of food they have.
  return at.getTime() > now.getTime() ? new Date(now) : at;
}


/**
 * The calendar day a `MealDay` names, at local midnight.
 *
 * The slot picker needs this to label its own control. Reading it off the
 * resolved timestamp instead would misread the after-midnight case: at 00:30
 * "today"'s breakfast resolves to yesterday 08:00, and a control that believed
 * the timestamp would offer to go back to a day it was already on.
 */
export function mealDayDate(day: MealDay, now: Date = new Date()): Date {
  const at = resolveDay(day, now);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, 0, 0, 0);
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
  // Same shape as the Fuel day strip's label, so a day reads the same wherever
  // it is named.
  const date = at.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${date} ${time}`;
}
