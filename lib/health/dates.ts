/**
 * Local-calendar day helpers for health reads.
 *
 * Health Connect ranges are ISO instants, but "steps today" is a local
 * calendar question. Everything here works in the device's local zone —
 * `toISOString()` on a Date is UTC and would silently shift the day boundary
 * for anyone west of Greenwich.
 */

/** `YYYY-MM-DD` for a Date, in local time. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` as local midnight. */
export function startOfLocalDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Local midnight at the start of the following day (exclusive end). */
export function endOfLocalDay(date: string): Date {
  const start = startOfLocalDay(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
}

/** Every local day from start to end inclusive, as `YYYY-MM-DD`. */
export function eachDay(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = startOfLocalDay(endDate);
  let cur = startOfLocalDay(startDate);
  // Guard against a reversed range rather than looping forever.
  if (cur > end) return out;
  while (cur <= end) {
    out.push(dayKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

/** Today's local day key. */
export function today(): string {
  return dayKey(new Date());
}

/**
 * The local calendar day before this one.
 *
 * Built by stepping a local Date rather than by arithmetic on the string, so
 * month ends, leap days and DST all come out right.
 */
export function previousDay(date: string): string {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}
