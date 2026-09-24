/**
 * Which day Fuel is showing, and how far back you can go.
 *
 * Fuel only ever showed `new Date()`. Everything under it — the summary, the
 * per-meal lists, the nutrient breakdown — already took a day and defaulted to
 * today, so the history was there and simply unreachable.
 *
 * Pure and local-time on purpose: a meal belongs to the calendar day you ate it
 * on, in the timezone you were standing in. Day arithmetic goes through
 * `setDate`, and day *differences* through `Date.UTC`, because a naive
 * `(a - b) / 86400000` is off by an hour across a DST boundary and can land a
 * whole day out.
 */

/**
 * How many days of food you can look back over, today included.
 *
 * 30 means today and the 29 days before it — the same window the 30-day
 * nutrient average uses, so "the last 30 days" means one thing in this app.
 */
export const FUEL_HISTORY_DAYS = 30;

/** Local midnight at the start of the day `d` falls in. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** `2026-09-24`, for a route param or a map key. Local, not UTC. */
export function dayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * A `YYYY-MM-DD` key back to local midnight, or null if it is not one.
 *
 * Strict about round-tripping: `2026-02-31` parses as a Date fine and silently
 * becomes 3 March, which would show one day while the URL said another.
 */
export function parseDayKey(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  return dayKey(date) === value.trim() ? date : null;
}

/** Whole calendar days from `from` to `to`. Positive means `to` is later. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** 0 for today, 1 for yesterday, and so on. Negative for a future day. */
export function dayOffset(day: Date, now: Date = new Date()): number {
  return daysBetween(day, now);
}

/** The oldest day Fuel will show. */
export function earliestFuelDay(now: Date = new Date()): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() - (FUEL_HISTORY_DAYS - 1));
  return d;
}

/**
 * `day` pulled inside the window.
 *
 * Both ends matter. Past the far end there is nothing to show; past today
 * there is nothing to show *yet*, and a screen offering to log tomorrow's
 * dinner would be inviting a timestamp for food nobody has eaten.
 */
export function clampFuelDay(day: Date, now: Date = new Date()): Date {
  const start = startOfDay(day);
  const today = startOfDay(now);
  const earliest = earliestFuelDay(now);
  if (start.getTime() > today.getTime()) return today;
  if (start.getTime() < earliest.getTime()) return earliest;
  return start;
}

export function canGoEarlier(day: Date, now: Date = new Date()): boolean {
  return startOfDay(day).getTime() > earliestFuelDay(now).getTime();
}

export function canGoLater(day: Date, now: Date = new Date()): boolean {
  return startOfDay(day).getTime() < startOfDay(now).getTime();
}

/** Step `delta` days and stay inside the window. */
export function shiftFuelDay(day: Date, delta: number, now: Date = new Date()): Date {
  const next = startOfDay(day);
  next.setDate(next.getDate() + delta);
  return clampFuelDay(next, now);
}

/** Oldest first, ending on today — the order the day strip is read in. */
export function fuelWindow(now: Date = new Date()): Date[] {
  const days: Date[] = [];
  const first = earliestFuelDay(now);
  for (let i = 0; i < FUEL_HISTORY_DAYS; i += 1) {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

/** "Today", "Yesterday", else "Mon 22 Sep". */
export function describeFuelDay(day: Date, now: Date = new Date()): string {
  const offset = dayOffset(day, now);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Two lines for a chip in the strip: "MON" over "22". */
export function chipLabel(day: Date): { weekday: string; date: string } {
  return {
    weekday: day.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3).toUpperCase(),
    date: String(day.getDate()),
  };
}
