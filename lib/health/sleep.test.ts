import { describe, expect, it } from 'vitest';
import { sleepMinutesByWakeDay } from './sleep';

/**
 * Times are written as local, because the whole point is which local calendar
 * day a night lands on. The CI timezone matrix runs these in four zones.
 */
const night = (start: string, end: string) => ({ startTime: start, endTime: end });

describe('which day a night belongs to', () => {
  it('files a night that crosses midnight under the morning', () => {
    // Reported from a real phone: this landed on the 21st, so the 22nd read
    // empty and readiness had nothing to score.
    const by = sleepMinutesByWakeDay([night('2026-09-21T23:10:00', '2026-09-22T07:00:00')]);
    expect(by.get('2026-09-22')).toBe(470);
    expect(by.has('2026-09-21')).toBe(false);
  });

  it('files a night within one day under that day', () => {
    const by = sleepMinutesByWakeDay([night('2026-09-22T01:00:00', '2026-09-22T08:30:00')]);
    expect(by.get('2026-09-22')).toBe(450);
  });

  it('sums a broken night into one total', () => {
    const by = sleepMinutesByWakeDay([
      night('2026-09-21T23:00:00', '2026-09-22T03:00:00'),
      night('2026-09-22T03:40:00', '2026-09-22T07:10:00'),
    ]);
    expect(by.get('2026-09-22')).toBe(240 + 210);
  });

  it('keeps separate nights separate', () => {
    const by = sleepMinutesByWakeDay([
      night('2026-09-20T23:00:00', '2026-09-21T07:00:00'),
      night('2026-09-21T23:00:00', '2026-09-22T06:00:00'),
    ]);
    expect(by.get('2026-09-21')).toBe(480);
    expect(by.get('2026-09-22')).toBe(420);
  });

  it('drops a session with no readable span rather than counting it as zero', () => {
    const by = sleepMinutesByWakeDay([
      night('2026-09-22T07:00:00', '2026-09-22T07:00:00'),
      night('2026-09-22T08:00:00', '2026-09-22T07:00:00'),
      night('nonsense', '2026-09-22T07:00:00'),
      night('2026-09-21T23:00:00', '2026-09-22T07:00:00'),
    ]);
    // Only the real one. A zero-length session must not exist as a key at all,
    // or it would read as "recorded, and it was nothing".
    expect(by.get('2026-09-22')).toBe(480);
  });

  it('has no entry for a day nothing was recorded on', () => {
    const by = sleepMinutesByWakeDay([]);
    expect(by.size).toBe(0);
    expect(by.get('2026-09-22')).toBeUndefined();
  });
});
