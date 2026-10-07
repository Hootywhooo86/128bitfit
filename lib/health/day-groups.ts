/**
 * Daily totals from Health Connect's aggregateGroupByPeriod.
 *
 * Asked with a local-time range and a one-day period, Health Connect buckets
 * each record by the local time it was recorded in, using the record's own
 * zone offset — the way Google Health and Samsung Health count a day. Cutting
 * days at midnight in the phone's current time zone instead moves steps onto
 * the wrong day whenever they were walked in another zone (a trip, the DST
 * change), so the same day reads differently here and in the watch app.
 *
 * Each group's startTime is a local date-time with no zone ("2026-10-05T00:00"),
 * so its first ten characters are the day.
 */
export type PeriodGroup = { startTime?: string; result?: Record<string, unknown> };

/**
 * One total per requested day. A day the call returned no group for is 0 —
 * the query succeeded, so nothing was recorded — exactly like the per-day
 * aggregate it replaces.
 */
export function dailyTotals(
  groups: readonly PeriodGroup[],
  days: readonly string[],
  pick: (result: Record<string, unknown>) => number | null
): Map<string, number> {
  const out = new Map(days.map((d) => [d, 0]));
  for (const g of groups) {
    const day = g.startTime?.slice(0, 10);
    if (!day || !out.has(day) || !g.result) continue;
    out.set(day, (out.get(day) ?? 0) + (pick(g.result) ?? 0));
  }
  return out;
}
