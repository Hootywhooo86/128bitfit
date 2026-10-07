/**
 * How fresh the step records in Health Connect are, and who wrote them.
 *
 * This app re-reads every minute, but it can only show what the step-counting
 * app (Samsung Health, Google Health, Google Fit…) has already written into Health
 * Connect, and those sync on their own schedule. When steps arrive an hour
 * late, this is what tells "our read is slow" apart from "the source app has
 * not synced yet".
 */
import STEP_APPS from './step-apps.json';

export type StepRow = {
  startTime?: string;
  endTime?: string;
  count?: number;
  metadata?: { dataOrigin?: string };
};

export type StepFreshness = {
  /** End of the newest record, or null when there are none. */
  newestEnd: Date | null;
  /** Minutes from that to `now`. */
  minutesOld: number | null;
  /** Each writing app with its record count and step total, biggest first. */
  sources: { origin: string; records: number; steps: number }[];
  /** The newest few records, newest first. */
  newest: StepRow[];
};

export function stepFreshness(rows: readonly StepRow[], now: Date, keep = 3): StepFreshness {
  const end = (r: StepRow) => Date.parse(r.endTime ?? r.startTime ?? '');
  const dated = rows.filter((r) => Number.isFinite(end(r))).sort((a, b) => end(b) - end(a));
  const newestEnd = dated.length ? new Date(end(dated[0])) : null;

  const by = new Map<string, { records: number; steps: number }>();
  for (const r of rows) {
    const origin = r.metadata?.dataOrigin || 'unknown app';
    const s = by.get(origin) ?? { records: 0, steps: 0 };
    s.records++;
    s.steps += typeof r.count === 'number' ? r.count : 0;
    by.set(origin, s);
  }

  return {
    newestEnd,
    minutesOld: newestEnd ? Math.max(0, Math.round((now.getTime() - newestEnd.getTime()) / 60_000)) : null,
    sources: [...by].map(([origin, s]) => ({ origin, ...s })).sort((a, b) => b.steps - a.steps),
    newest: dated.slice(0, keep),
  };
}

/** Package names people will recognise, for the report. Unknown ones stay as they are. */
const KNOWN: Record<string, string> = {
  ...Object.fromEntries(STEP_APPS.map((a) => [a.package, a.name])),
  'com.google.android.apps.healthdata': 'Health Connect (phone sensor)',
};

export function sourceName(origin: string): string {
  return KNOWN[origin] ? `${KNOWN[origin]} (${origin})` : origin;
}
