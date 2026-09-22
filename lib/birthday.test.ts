import { describe, expect, it } from 'vitest';
import { formatBirthday, fromIsoDate, maxBirthday, minBirthday, toIsoDate } from './birthday';

describe('toIsoDate', () => {
  it('uses the local calendar date, not UTC', () => {
    // Late evening local time is already tomorrow in UTC for anyone east of
    // Greenwich, and yesterday for anyone west. toISOString would report the
    // wrong birthday for one of them.
    const d = new Date(1990, 4, 17, 23, 30);
    expect(toIsoDate(d)).toBe('1990-05-17');
    const early = new Date(1990, 4, 17, 0, 15);
    expect(toIsoDate(early)).toBe('1990-05-17');
  });

  it('pads month and day', () => {
    expect(toIsoDate(new Date(2001, 0, 5))).toBe('2001-01-05');
  });
});

describe('fromIsoDate', () => {
  it('round-trips with toIsoDate', () => {
    expect(toIsoDate(fromIsoDate('1988-12-31')!)).toBe('1988-12-31');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(fromIsoDate('17/05/1990')).toBeNull();
    expect(fromIsoDate('')).toBeNull();
    expect(fromIsoDate(null)).toBeNull();
    expect(fromIsoDate(undefined)).toBeNull();
    expect(fromIsoDate('1990-5-17')).toBeNull();
  });

  it('rejects a date that does not exist rather than rolling it forward', () => {
    // new Date(2026, 1, 31) silently becomes 3 March.
    expect(fromIsoDate('2026-02-31')).toBeNull();
    expect(fromIsoDate('2026-13-01')).toBeNull();
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(fromIsoDate('2024-02-29')).not.toBeNull();
    expect(fromIsoDate('2025-02-29')).toBeNull();
  });
});

describe('picker bounds', () => {
  const now = new Date(2026, 8, 22);

  it('does not offer a birthday in the future', () => {
    expect(maxBirthday(now).getTime()).toBeLessThan(now.getTime());
  });

  it('spans a plausible human lifetime', () => {
    expect(minBirthday(now).getFullYear()).toBe(1906);
    expect(maxBirthday(now).getFullYear()).toBe(2013);
  });
});

describe('formatBirthday', () => {
  it('prompts rather than showing a blank or a fake date', () => {
    expect(formatBirthday(null)).toBe('Choose date');
    expect(formatBirthday('')).toBe('Choose date');
    expect(formatBirthday('nonsense')).toBe('Choose date');
  });

  it('shows a set date in a readable form', () => {
    expect(formatBirthday('1990-05-17')).toMatch(/1990/);
    expect(formatBirthday('1990-05-17')).not.toBe('Choose date');
  });
});
