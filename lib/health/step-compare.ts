/**
 * The same step records added up per day in two ways, for the report.
 *
 * Google Health's daily totals and this app's disagreed by hundreds of steps,
 * then — once Health Connect's local-time grouping was tried — by thousands on
 * one day. Rather than guess again, the report shows every way of totalling a
 * day side by side, so the one that matches Google Health can be read off.
 *
 * - byPhoneZone: each record on the day its start falls in, in the phone's
 *   current time zone (what a per-day query with fixed instants sees).
 * - byRecordZone: each record on the day its start falls in, in the zone
 *   offset the writing app stored on it (what "local time" means to it). A
 *   record with no offset falls back to the phone's zone, and is counted as
 *   "none" so that is visible.
 */
export type StepRecordRow = {
  startTime?: string;
  count?: number;
  startZoneOffset?: { id?: string; totalSeconds?: number } | null;
  metadata?: { dataOrigin?: string };
};

export type DayComparison = {
  day: string;
  byPhoneZone: number;
  byRecordZone: number;
  records: number;
  /** Zone offset id → record count, for records starting this day (phone zone). */
  zones: Record<string, number>;
  /** Writing app → steps, for records starting this day (phone zone). */
  origins: Record<string, number>;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar day of an instant shifted by an offset, read in UTC. */
function dayAtOffset(ms: number, offsetSeconds: number): string {
  const d = new Date(ms + offsetSeconds * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function compareStepDays(
  records: readonly StepRecordRow[],
  days: readonly string[],
  phoneDay: (d: Date) => string
): DayComparison[] {
  const out = new Map<string, DayComparison>(
    days.map((day) => [day, { day, byPhoneZone: 0, byRecordZone: 0, records: 0, zones: {}, origins: {} }])
  );
  for (const r of records) {
    const ms = Date.parse(r.startTime ?? '');
    if (!Number.isFinite(ms)) continue;
    const steps = typeof r.count === 'number' ? r.count : 0;

    const phone = out.get(phoneDay(new Date(ms)));
    if (phone) {
      phone.byPhoneZone += steps;
      phone.records += 1;
      const zone = r.startZoneOffset?.id ?? 'none';
      phone.zones[zone] = (phone.zones[zone] ?? 0) + 1;
      const origin = r.metadata?.dataOrigin ?? 'unknown';
      phone.origins[origin] = (phone.origins[origin] ?? 0) + steps;
    }

    const offset = r.startZoneOffset?.totalSeconds;
    const ownDay = typeof offset === 'number' ? dayAtOffset(ms, offset) : phoneDay(new Date(ms));
    const own = out.get(ownDay);
    if (own) own.byRecordZone += steps;
  }
  return days.map((d) => out.get(d)!);
}
