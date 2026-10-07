/**
 * The Steps screen's numbers: the last N days, one row each, and an average
 * only once there is enough to average.
 *
 * Pure, so the rules are tested: a day with no reading is "—" and no bar,
 * never a zero (a 0 claims a measurement); today is marked partial and left
 * out of the average, because half a day would drag it down.
 */
export type StepDay = { date: string; steps: number | null };

export type StepRowView = {
  date: string;
  steps: number | null;
  today: boolean;
  /** Bar length, 0–1 of the longest day shown. Null when there is no reading. */
  fraction: number | null;
};

export type StepHistory = {
  /** Newest first. */
  rows: StepRowView[];
  /** Mean of the finished days that have a reading, or null until there are enough. */
  average: number | null;
  /** How many finished days the average is over — or, before then, how many it has. */
  averageDays: number;
  /** Finished days with a reading needed before the average shows. */
  averageNeeds: number;
};

export const MIN_DAYS_FOR_AVERAGE = 3;

export function stepHistory(days: readonly StepDay[], todayKey: string): StepHistory {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const max = Math.max(0, ...sorted.map((d) => d.steps ?? 0));
  const rows = sorted.map((d) => ({
    date: d.date,
    steps: d.steps,
    today: d.date === todayKey,
    fraction: d.steps == null ? null : max > 0 ? d.steps / max : 0,
  }));
  const finished = sorted.filter((d) => d.date !== todayKey && d.steps != null);
  const enough = finished.length >= MIN_DAYS_FOR_AVERAGE;
  return {
    rows,
    average: enough ? Math.round(finished.reduce((a, d) => a + d.steps!, 0) / finished.length) : null,
    averageDays: finished.length,
    averageNeeds: MIN_DAYS_FOR_AVERAGE,
  };
}

/** "17 min ago", "2 h 5 min ago", "just now". */
export function agoText(fromMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - fromMs) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}
