/**
 * The fasting timer's arithmetic, from prototype/app-shell.html `fuel:fasting`.
 *
 * A timer, not a diet plan: it records when a fast started and how long the
 * user meant it to run, and nothing else. It never changes a calorie target.
 */

export type FastPlan = { hours: number; name: string; detail: string };

/** The prototype's windows. Nothing past a day — see the note on the fasting screen. */
export const FAST_PLANS: FastPlan[] = [
  { hours: 16, name: '16:8', detail: 'Eight-hour eating window' },
  { hours: 18, name: '18:6', detail: 'Six-hour window' },
  { hours: 20, name: '20:4', detail: 'Four-hour window' },
  { hours: 24, name: '24h', detail: 'A full day' },
];

export type Fast = { startedAt: number; hours: number };

/** Reads the stored value back, or null for anything that is not a fast. */
export function parseFast(raw: string | null): Fast | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Fast>;
    if (typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt)) return null;
    if (!FAST_PLANS.some((p) => p.hours === v.hours)) return null;
    return { startedAt: v.startedAt, hours: v.hours! };
  } catch {
    return null;
  }
}

export function serializeFast(fast: Fast): string {
  return JSON.stringify(fast);
}

export type FastProgress = {
  elapsedMs: number;
  targetMs: number;
  remainingMs: number;
  /** 0–100. */
  pct: number;
  complete: boolean;
};

export function fastProgress(fast: Fast, now: number): FastProgress {
  // A clock moved backwards reads as "just started", never as negative time.
  const elapsedMs = Math.max(0, now - fast.startedAt);
  const targetMs = fast.hours * 3_600_000;
  return {
    elapsedMs,
    targetMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    pct: Math.min(100, (elapsedMs / targetMs) * 100),
    complete: elapsedMs >= targetMs,
  };
}

/** `14:05:09`, or `5:09` under an hour — the prototype's fmtElapsed. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
