import { describe, expect, it } from 'vitest';
import { agoText, stepHistory } from './step-history';

describe('stepHistory', () => {
  const today = '2026-10-05';

  it('lists newest first, scales bars to the longest day, marks today', () => {
    const h = stepHistory(
      [
        { date: '2026-10-03', steps: 5000 },
        { date: '2026-10-05', steps: 2500 },
        { date: '2026-10-04', steps: 10000 },
      ],
      today
    );
    expect(h.rows.map((r) => [r.date, r.fraction, r.today])).toEqual([
      ['2026-10-05', 0.25, true],
      ['2026-10-04', 1, false],
      ['2026-10-03', 0.5, false],
    ]);
  });

  it('keeps no reading apart from zero', () => {
    const h = stepHistory(
      [
        { date: '2026-10-04', steps: null },
        { date: '2026-10-03', steps: 0 },
        { date: '2026-10-02', steps: 4000 },
      ],
      today
    );
    expect(h.rows.find((r) => r.date === '2026-10-04')).toMatchObject({ steps: null, fraction: null });
    expect(h.rows.find((r) => r.date === '2026-10-03')).toMatchObject({ steps: 0, fraction: 0 });
  });

  it('averages finished days with a reading, once there are three', () => {
    const two = stepHistory(
      [
        { date: '2026-10-05', steps: 100 },
        { date: '2026-10-04', steps: 8000 },
        { date: '2026-10-03', steps: 6000 },
        { date: '2026-10-02', steps: null },
      ],
      today
    );
    expect(two).toMatchObject({ average: null, averageDays: 2, averageNeeds: 3 });
    const three = stepHistory(
      [
        { date: '2026-10-05', steps: 100 },
        { date: '2026-10-04', steps: 8000 },
        { date: '2026-10-03', steps: 6000 },
        { date: '2026-10-02', steps: 7000 },
      ],
      today
    );
    // Today's partial 100 is left out.
    expect(three).toMatchObject({ average: 7000, averageDays: 3 });
  });

  it('is empty-safe', () => {
    expect(stepHistory([], today)).toMatchObject({ rows: [], average: null, averageDays: 0 });
  });
});

describe('agoText', () => {
  const now = Date.parse('2026-10-05T23:36:00Z');
  it('reads naturally', () => {
    expect(agoText(now - 20_000, now)).toBe('just now');
    expect(agoText(now - 17 * 60_000, now)).toBe('17 min ago');
    expect(agoText(now - 125 * 60_000, now)).toBe('2 h 5 min ago');
    expect(agoText(now - 120 * 60_000, now)).toBe('2 h ago');
  });
});
