import { describe, expect, it } from 'vitest';
import {
  FUEL_HISTORY_DAYS,
  canGoEarlier,
  canGoLater,
  chipLabel,
  clampFuelDay,
  dayKey,
  dayOffset,
  daysBetween,
  describeFuelDay,
  earliestFuelDay,
  fuelWindow,
  parseDayKey,
  shiftFuelDay,
  startOfDay,
} from './fuel-day';

/** Local time throughout: the day you ate on is the day in your timezone. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

describe('the window', () => {
  const now = at(2026, 9, 24, 21, 30);

  it('reaches back 30 days counting today, matching the 30-day average', () => {
    expect(dayKey(earliestFuelDay(now))).toBe('2026-08-26');
    expect(dayOffset(earliestFuelDay(now), now)).toBe(FUEL_HISTORY_DAYS - 1);
  });

  it('lists every day oldest first and ends on today', () => {
    const days = fuelWindow(now);
    expect(days).toHaveLength(FUEL_HISTORY_DAYS);
    expect(dayKey(days[0])).toBe('2026-08-26');
    expect(dayKey(days[days.length - 1])).toBe('2026-09-24');
  });

  it('refuses a day after today — you cannot have eaten tomorrow yet', () => {
    expect(dayKey(clampFuelDay(at(2026, 9, 25), now))).toBe('2026-09-24');
    expect(canGoLater(at(2026, 9, 24), now)).toBe(false);
  });

  it('stops at the far end instead of walking off it', () => {
    expect(dayKey(clampFuelDay(at(2026, 1, 1), now))).toBe('2026-08-26');
    expect(canGoEarlier(earliestFuelDay(now), now)).toBe(false);
    expect(canGoEarlier(at(2026, 8, 27), now)).toBe(true);
  });

  it('clamps rather than steps when a step would leave the window', () => {
    expect(dayKey(shiftFuelDay(at(2026, 8, 26), -1, now))).toBe('2026-08-26');
    expect(dayKey(shiftFuelDay(at(2026, 9, 24), 1, now))).toBe('2026-09-24');
    expect(dayKey(shiftFuelDay(at(2026, 9, 24), -1, now))).toBe('2026-09-23');
  });

  it('normalises to midnight so a time of day never leaks into the selection', () => {
    expect(startOfDay(at(2026, 9, 24, 23, 59)).getHours()).toBe(0);
    expect(clampFuelDay(at(2026, 9, 20, 23, 59), now).getHours()).toBe(0);
  });
});

describe('day keys', () => {
  it('round-trips a local date without drifting into the previous day', () => {
    // toISOString() here would give 2026-09-23 west of UTC. That is the bug
    // this function exists to not have.
    const d = at(2026, 9, 24, 0, 30);
    expect(dayKey(d)).toBe('2026-09-24');
    expect(dayKey(parseDayKey('2026-09-24')!)).toBe('2026-09-24');
  });

  it('rejects anything that is not a real day', () => {
    expect(parseDayKey('2026-02-31')).toBeNull(); // parses, then silently becomes 3 March
    expect(parseDayKey('2026-9-4')).toBeNull();
    expect(parseDayKey('yesterday')).toBeNull();
    expect(parseDayKey('')).toBeNull();
    expect(parseDayKey(undefined)).toBeNull();
    expect(parseDayKey(null)).toBeNull();
  });

  it('parses to midnight, not to the current time on that date', () => {
    const d = parseDayKey('2026-09-24')!;
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe('counting days', () => {
  it('counts calendar days, not elapsed hours', () => {
    // 23:30 to 00:30 is one hour and also one day. Dividing a millisecond
    // difference would call this zero.
    expect(daysBetween(at(2026, 9, 23, 23, 30), at(2026, 9, 24, 0, 30))).toBe(1);
  });

  it('ignores the time of day at both ends', () => {
    // Midnight to noon the next day is 36 hours, which a millisecond
    // difference rounds to two days. It is one.
    expect(daysBetween(at(2026, 9, 23, 0, 0), at(2026, 9, 24, 12, 0))).toBe(1);
    expect(daysBetween(at(2026, 9, 23, 12, 0), at(2026, 9, 24, 0, 0))).toBe(1);
  });

  it('survives a DST change, where a calendar day is 23 or 25 hours long', () => {
    // Day arithmetic here goes through setDate and Date.UTC rather than adding
    // 86400000ms, so the spans containing US spring-forward (2026-03-08) and
    // autumn-back (2026-11-01) are still one day each.
    expect(daysBetween(at(2026, 3, 8, 0, 0), at(2026, 3, 9, 0, 0))).toBe(1);
    expect(daysBetween(at(2026, 11, 1, 0, 0), at(2026, 11, 2, 0, 0))).toBe(1);
    expect(dayKey(shiftFuelDay(at(2026, 3, 9), -1, at(2026, 3, 20)))).toBe('2026-03-08');
    expect(dayKey(shiftFuelDay(at(2026, 11, 2), -1, at(2026, 11, 10)))).toBe('2026-11-01');
  });

  it('goes negative for a day still to come', () => {
    expect(dayOffset(at(2026, 9, 25), at(2026, 9, 24))).toBe(-1);
  });

  it('spans a month and a year boundary', () => {
    expect(daysBetween(at(2025, 12, 31), at(2026, 1, 1))).toBe(1);
    expect(daysBetween(at(2026, 8, 31), at(2026, 9, 1))).toBe(1);
  });

  it('steps back over a month end instead of producing day zero', () => {
    expect(dayKey(shiftFuelDay(at(2026, 9, 1), -1, at(2026, 9, 24)))).toBe('2026-08-31');
  });
});

describe('what the header says', () => {
  const now = at(2026, 9, 24);

  it('names the two days you would otherwise have to work out', () => {
    expect(describeFuelDay(at(2026, 9, 24), now)).toBe('Today');
    expect(describeFuelDay(at(2026, 9, 23), now)).toBe('Yesterday');
  });

  it('gives a dated label further back, never "2 days ago"', () => {
    const label = describeFuelDay(at(2026, 9, 22), now);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(label).toMatch(/22/);
  });

  it('labels a chip with a weekday and the date', () => {
    const { weekday, date } = chipLabel(at(2026, 9, 22));
    expect(weekday).toHaveLength(3);
    expect(weekday).toBe(weekday.toUpperCase());
    expect(date).toBe('22');
  });
});
