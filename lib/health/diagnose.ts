/**
 * What Health Connect actually reports, with nothing swallowed.
 *
 * The normal read path deliberately collapses every failure into "not
 * connected", because that is the only honest thing to tell someone standing
 * in a gym. But it means a refused permission, an initialize() that returned
 * false, and an initialize() that threw all render identically — and only one
 * of those is fixed by granting permission or pulling to refresh.
 *
 * This is the other view: every step reported separately, so a report can say
 * which one actually happened instead of guessing from a dash.
 */
export type DiagnosticStep = {
  label: string;
  /** What happened, in one line. Never "failed" on its own. */
  value: string;
  ok: boolean | null;
};

export type HealthDiagnostics = {
  steps: DiagnosticStep[];
  /** Plain text, for the copy button. */
  report: string;
};

export function formatReport(steps: DiagnosticStep[]): string {
  const mark = (ok: boolean | null) => (ok === null ? '·' : ok ? 'ok' : 'XX');
  return steps.map((s) => `${mark(s.ok)}  ${s.label}: ${s.value}`).join('\n');
}

/** Errors reach the report as text; an empty message is worse than useless. */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || 'threw with no message';
  if (typeof e === 'string' && e.trim()) return e;
  // null and undefined have to be caught before JSON.stringify: it turns null
  // into the string "null", which would print as if it were a real message.
  if (e == null) return 'threw a non-Error value';
  try {
    const s = JSON.stringify(e);
    return s && s !== '{}' && s !== 'null' ? s : 'threw a non-Error value';
  } catch {
    return 'threw a value that could not be described';
  }
}
