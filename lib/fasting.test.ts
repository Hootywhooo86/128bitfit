import { describe, expect, it } from 'vitest';
import { FAST_PLANS, fastProgress, formatElapsed, parseFast, serializeFast } from './fasting';

const HOUR = 3_600_000;

describe('fasting timer', () => {
  it('round-trips a fast through storage', () => {
    const fast = { startedAt: 1_700_000_000_000, hours: 16 };
    expect(parseFast(serializeFast(fast))).toEqual(fast);
  });

  it('reads nothing, garbage, or an unknown window as no fast', () => {
    expect(parseFast(null)).toBeNull();
    expect(parseFast('')).toBeNull();
    expect(parseFast('{not json')).toBeNull();
    expect(parseFast(JSON.stringify({ startedAt: 1, hours: 72 }))).toBeNull();
    expect(parseFast(JSON.stringify({ hours: 16 }))).toBeNull();
  });

  it('offers nothing longer than a day', () => {
    expect(Math.max(...FAST_PLANS.map((p) => p.hours))).toBe(24);
  });

  it('tracks progress toward the window', () => {
    const p = fastProgress({ startedAt: 0, hours: 16 }, 4 * HOUR);
    expect(p.pct).toBe(25);
    expect(p.remainingMs).toBe(12 * HOUR);
    expect(p.complete).toBe(false);
  });

  it('caps at 100% and says so once the window is done', () => {
    const p = fastProgress({ startedAt: 0, hours: 16 }, 20 * HOUR);
    expect(p.pct).toBe(100);
    expect(p.remainingMs).toBe(0);
    expect(p.complete).toBe(true);
  });

  it('never shows negative time when the clock moves backwards', () => {
    const p = fastProgress({ startedAt: 10 * HOUR, hours: 16 }, 9 * HOUR);
    expect(p.elapsedMs).toBe(0);
    expect(p.pct).toBe(0);
  });

  it('formats like the prototype clock', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(14 * HOUR + 5 * 60_000 + 9_000)).toBe('14:05:09');
  });
});
