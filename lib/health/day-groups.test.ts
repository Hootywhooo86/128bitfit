import { describe, expect, it } from 'vitest';
import { dailyTotals } from './day-groups';

const pick = (r: Record<string, unknown>) => (typeof r.COUNT_TOTAL === 'number' ? r.COUNT_TOTAL : null);

describe('dailyTotals', () => {
  const days = ['2026-10-05', '2026-10-06', '2026-10-07'];

  it('keys each group by its local start date', () => {
    const t = dailyTotals(
      [
        { startTime: '2026-10-05T00:00', result: { COUNT_TOTAL: 19790 } },
        { startTime: '2026-10-06T00:00', result: { COUNT_TOTAL: 26542 } },
        { startTime: '2026-10-07T00:00', result: { COUNT_TOTAL: 2479 } },
      ],
      days,
      pick
    );
    expect([...t]).toEqual([
      ['2026-10-05', 19790],
      ['2026-10-06', 26542],
      ['2026-10-07', 2479],
    ]);
  });

  it('a day with no group is a real zero, not missing', () => {
    const t = dailyTotals([{ startTime: '2026-10-06T00:00', result: { COUNT_TOTAL: 10 } }], days, pick);
    expect(t.get('2026-10-05')).toBe(0);
    expect(t.get('2026-10-07')).toBe(0);
  });

  it('ignores groups outside the days asked for, and malformed ones', () => {
    const t = dailyTotals(
      [
        { startTime: '2026-10-04T00:00', result: { COUNT_TOTAL: 99 } },
        { startTime: undefined, result: { COUNT_TOTAL: 99 } },
        { startTime: '2026-10-05T00:00' },
        { startTime: '2026-10-05T00:00', result: { COUNT_TOTAL: 'x' } },
      ],
      days,
      pick
    );
    expect([...t.values()]).toEqual([0, 0, 0]);
  });
});
