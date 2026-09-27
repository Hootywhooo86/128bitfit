import { describe, expect, it } from 'vitest';
import { sameTodayHealth, todayHealthGate, type TodayHealth } from './today-gate';
import type { HealthGrants } from './types';

const grants = (read: HealthGrants['read']): HealthGrants => ({ read, write: [] });

describe('deciding whether today can be read', () => {
  it('reads when steps is granted, whatever else was refused', () => {
    expect(todayHealthGate('available', grants(['steps']))).toBe('read');
  });

  it('does not require the full permission set', () => {
    // The regression this guards: requiring everything reported "denied" to
    // anyone who ticked steps and left the rest, which is most people.
    expect(todayHealthGate('available', grants(['steps', 'weight']))).toBe('read');
  });

  it('says not connected when steps specifically was refused', () => {
    expect(todayHealthGate('available', grants(['weight', 'sleep']))).toEqual({ status: 'denied' });
    expect(todayHealthGate('available', grants([]))).toEqual({ status: 'denied' });
  });

  it('treats a failed grants lookup as not connected, never as a reading', () => {
    expect(todayHealthGate('available', null)).toEqual({ status: 'denied' });
  });

  it('reports no provider and a stale provider as their own states', () => {
    expect(todayHealthGate('unavailable', grants(['steps']))).toEqual({ status: 'unavailable' });
    expect(todayHealthGate('update_required', grants(['steps']))).toEqual({ status: 'update' });
  });

  it('checks availability before grants, so a phone with no provider never says "not connected"', () => {
    // "Not available on this phone" and "not connected" are different facts and
    // only one of them has a fix the user can act on.
    expect(todayHealthGate('unavailable', null)).toEqual({ status: 'unavailable' });
    expect(todayHealthGate('update_required', null)).toEqual({ status: 'update' });
  });
});

describe('when subscribers should be woken', () => {
  const ready = (steps: number | null, activeCalories: number | null = null): TodayHealth => ({
    status: 'ready',
    steps,
    activeCalories,
  });

  it('holds a reading equal to itself, so a resume does not re-render everything', () => {
    expect(sameTodayHealth(ready(8412), ready(8412))).toBe(true);
    expect(sameTodayHealth({ status: 'denied' }, { status: 'denied' })).toBe(true);
  });

  it('notices the step count moving', () => {
    expect(sameTodayHealth(ready(8412), ready(8500))).toBe(false);
  });

  it('separates a real zero from no reading at all', () => {
    // 0 steps is a measurement; null is the absence of one. Collapsing them
    // here would stop the UI ever switching between them.
    expect(sameTodayHealth(ready(0), ready(null))).toBe(false);
  });

  it('notices connecting', () => {
    expect(sameTodayHealth({ status: 'denied' }, ready(0))).toBe(false);
    expect(sameTodayHealth({ status: 'checking' }, { status: 'denied' })).toBe(false);
  });
});
