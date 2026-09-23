import { describe, expect, it } from 'vitest';
import { MIN_REST_SECONDS, adjustRest } from './rest-adjust';

const running = (remainingMs: number, totalSeconds = 90) => ({ remainingMs, totalSeconds });
const idle = { remainingMs: null, totalSeconds: 90 };

describe('adding time to a rest', () => {
  it('extends a running rest', () => {
    const a = adjustRest(running(20_000), 15);
    expect(a).toEqual({ kind: 'set', remainingMs: 35_000, totalSeconds: 90 });
  });

  it('grows the bar when the rest goes past its original length', () => {
    const a = adjustRest(running(85_000), 15);
    if (a.kind !== 'set') throw new Error('expected set');
    expect(a.remainingMs).toBe(100_000);
    expect(a.totalSeconds).toBe(100);
  });

  it('starts a rest when none is running', () => {
    expect(adjustRest(idle, 15)).toEqual({ kind: 'start', seconds: 15 });
  });
});

describe('taking time off a rest', () => {
  it('shortens a running rest', () => {
    const a = adjustRest(running(60_000), -15);
    expect(a).toEqual({ kind: 'set', remainingMs: 45_000, totalSeconds: 90 });
  });

  it('leaves the bar length alone, so the bar moves forward', () => {
    const a = adjustRest(running(60_000), -15);
    if (a.kind !== 'set') throw new Error('expected set');
    expect(a.totalSeconds).toBe(90);
  });

  it('never goes below the minimum rather than to zero or negative', () => {
    const a = adjustRest(running(5_000), -15);
    if (a.kind !== 'set') throw new Error('expected set');
    expect(a.remainingMs).toBe(MIN_REST_SECONDS * 1000);
  });

  it('does nothing at all when no rest is running', () => {
    // The bug this exists for: a minus tap on an idle timer used to clamp the
    // length to a minimum and start a one-second rest.
    expect(adjustRest(idle, -15)).toEqual({ kind: 'none' });
  });
});

describe('taps that mean nothing', () => {
  it('ignores a zero delta', () => {
    expect(adjustRest(running(20_000), 0)).toEqual({ kind: 'none' });
    expect(adjustRest(idle, 0)).toEqual({ kind: 'none' });
  });

  it('ignores a non-finite delta rather than producing NaN', () => {
    expect(adjustRest(running(20_000), Number.NaN)).toEqual({ kind: 'none' });
  });
});
