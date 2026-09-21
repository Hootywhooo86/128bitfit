import { describe, expect, it } from 'vitest';
import { dayKey, eachDay, endOfLocalDay, startOfLocalDay, today } from './dates';

/**
 * These run in whatever zone the machine is in. `npm test` is zone-agnostic;
 * CI additionally runs the suite under several TZ values (see ci.yml), because
 * the bug this module exists to prevent only appears away from UTC.
 */

describe('local day keys', () => {
  it('round-trips a date string', () => {
    expect(dayKey(startOfLocalDay('2026-03-08'))).toBe('2026-03-08');
  });

  it('uses local components, not UTC', () => {
    // The bug: at 22:00 local in a negative-offset zone, toISOString() reports
    // tomorrow, which would attribute today's steps to the wrong day.
    const late = new Date(2026, 4, 5, 22, 0, 0);
    expect(dayKey(late)).toBe('2026-05-05');
    expect(late.getDate()).toBe(5);
  });

  it('starts a day at local midnight and ends at the next one', () => {
    const start = startOfLocalDay('2026-05-05');
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    const end = endOfLocalDay('2026-05-05');
    expect(end.getDate()).toBe(6);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('rolls the year over at the end of December', () => {
    expect(endOfLocalDay('2026-12-31').getFullYear()).toBe(2027);
  });

  it('reports today in the expected shape', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('day ranges', () => {
  it.each([
    ['a month boundary', '2026-02-26', '2026-03-02',
      ['2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']],
    ['a leap day', '2024-02-27', '2024-03-01',
      ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']],
    ['a year boundary', '2025-12-30', '2026-01-02',
      ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']],
    ['a single day', '2026-05-05', '2026-05-05', ['2026-05-05']],
    ['DST spring forward', '2026-03-07', '2026-03-09',
      ['2026-03-07', '2026-03-08', '2026-03-09']],
    ['DST fall back', '2026-10-31', '2026-11-02',
      ['2026-10-31', '2026-11-01', '2026-11-02']],
  ])('enumerates %s', (_label, start, end, expected) => {
    expect(eachDay(start, end)).toEqual(expected);
  });

  it('returns empty for a reversed range instead of looping forever', () => {
    expect(eachDay('2026-05-09', '2026-05-05')).toEqual([]);
  });

  it('never skips or repeats a day over a long span', () => {
    const days = eachDay('2026-01-01', '2026-12-31');
    expect(days).toHaveLength(365);
    expect(new Set(days).size).toBe(365);
  });
});
