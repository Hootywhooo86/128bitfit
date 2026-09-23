/**
 * How a routine describes itself on the pick and preview screens.
 *
 * Starting a workout used to jump straight into a live session the moment you
 * tapped a routine — no chance to see what was in it, and no way back if you
 * picked the wrong one. The prototype puts a pick screen and a preview in
 * front of that, and both need a routine to say what it is in one line.
 *
 * Pure: no database, no clock of its own.
 */

/** "5 exercises · 15 sets". Singular where it matters, because "1 exercises" reads wrong. */
export function routineSummary(exerciseCount: number, setCount: number): string {
  const ex = `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`;
  if (!Number.isFinite(setCount) || setCount <= 0) return ex;
  return `${ex} · ${setCount} set${setCount === 1 ? '' : 's'}`;
}

/**
 * When a routine was last run, in calendar days rather than elapsed hours.
 *
 * A session finished at 23:00 yesterday is "yesterday" when you open the app
 * at 01:00, not "2 hours ago" and certainly not "today". Elapsed-milliseconds
 * arithmetic gets this wrong twice a year as well, when the clocks move.
 *
 * Returns null for a routine that has never been run — the caller says so in
 * its own words rather than being handed "0 days ago", which would claim a
 * session that never happened.
 */
export function describeLastRun(last: Date | null | undefined, now: Date = new Date()): string | null {
  if (!last || !(last instanceof Date) || Number.isNaN(last.getTime())) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(last)) / 86_400_000);

  // A future date is a clock change or a bad import, not a prediction.
  if (days < 0) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 56) return `${Math.floor(days / 7)} weeks ago`;
  return last.toLocaleDateString();
}
