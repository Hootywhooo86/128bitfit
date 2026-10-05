import { describe, expect, it } from 'vitest';
import { sourceName, stepFreshness } from './step-freshness';

describe('stepFreshness', () => {
  const now = new Date('2026-10-05T23:36:00Z');
  const rows = [
    { startTime: '2026-10-05T15:35:00Z', endTime: '2026-10-05T15:40:00Z', count: 7, metadata: { dataOrigin: 'com.sec.android.app.shealth' } },
    { startTime: '2026-10-05T22:30:00Z', endTime: '2026-10-05T22:40:00Z', count: 300, metadata: { dataOrigin: 'com.sec.android.app.shealth' } },
    { startTime: '2026-10-05T16:25:00Z', endTime: '2026-10-05T16:30:00Z', count: 16, metadata: { dataOrigin: 'com.fitbit.FitbitMobile' } },
  ];

  it('finds the newest record and how old it is', () => {
    const f = stepFreshness(rows, now);
    expect(f.newestEnd?.toISOString()).toBe('2026-10-05T22:40:00.000Z');
    expect(f.minutesOld).toBe(56);
    expect(f.newest[0].count).toBe(300);
  });

  it('totals each writing app, biggest first', () => {
    expect(stepFreshness(rows, now).sources).toEqual([
      { origin: 'com.sec.android.app.shealth', records: 2, steps: 307 },
      { origin: 'com.fitbit.FitbitMobile', records: 1, steps: 16 },
    ]);
  });

  it('says nothing is fresh when there is nothing', () => {
    expect(stepFreshness([], now)).toMatchObject({ newestEnd: null, minutesOld: null, sources: [] });
  });

  it('falls back to the start time and an unknown app', () => {
    const f = stepFreshness([{ startTime: '2026-10-05T23:30:00Z', count: 5 }], now);
    expect(f.minutesOld).toBe(6);
    expect(f.sources[0].origin).toBe('unknown app');
  });

  it('names apps people know', () => {
    expect(sourceName('com.sec.android.app.shealth')).toBe('Samsung Health (com.sec.android.app.shealth)');
    expect(sourceName('com.example.thing')).toBe('com.example.thing');
  });
});
