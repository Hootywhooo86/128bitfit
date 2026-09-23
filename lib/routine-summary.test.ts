import { describe, expect, it } from 'vitest';
import { describeLastRun, routineSummary } from './routine-summary';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0);

describe('what a routine row says it contains', () => {
  it('reads naturally for one of each', () => {
    expect(routineSummary(1, 1)).toBe('1 exercise · 1 set');
  });

  it('pluralises the rest', () => {
    expect(routineSummary(5, 15)).toBe('5 exercises · 15 sets');
  });

  it('leaves the sets off rather than claiming zero of them', () => {
    expect(routineSummary(3, 0)).toBe('3 exercises');
  });
});

describe('when a routine was last run', () => {
  const now = at(2026, 9, 23, 1); // 1am, to catch elapsed-hours arithmetic

  it('says nothing at all for a routine never run', () => {
    expect(describeLastRun(null, now)).toBeNull();
    expect(describeLastRun(undefined, now)).toBeNull();
  });

  it('counts calendar days, so 11pm last night is yesterday at 1am', () => {
    expect(describeLastRun(at(2026, 9, 22, 23), now)).toBe('yesterday');
  });

  it('says today for earlier the same day', () => {
    expect(describeLastRun(at(2026, 9, 23, 0), now)).toBe('today');
  });

  it('counts days up to a week', () => {
    expect(describeLastRun(at(2026, 9, 19), now)).toBe('4 days ago');
  });

  it('rolls up to weeks once days stop being useful', () => {
    expect(describeLastRun(at(2026, 9, 14), now)).toBe('last week');
    expect(describeLastRun(at(2026, 9, 2), now)).toBe('3 weeks ago');
  });

  it('falls back to a date once weeks stop being useful', () => {
    const s = describeLastRun(at(2026, 6, 1), now);
    expect(s).not.toMatch(/ago|week|today|yesterday/);
  });

  it('refuses a future date rather than reporting a session that has not happened', () => {
    expect(describeLastRun(at(2026, 9, 25), now)).toBeNull();
  });

  it('refuses an invalid date rather than rendering NaN', () => {
    expect(describeLastRun(new Date('nonsense'), now)).toBeNull();
  });
});
