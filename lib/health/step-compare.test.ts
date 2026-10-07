import { describe, expect, it } from 'vitest';
import { compareStepDays } from './step-compare';

// The phone is on UTC-7 for these tests.
const phoneDay = (d: Date) => {
  const s = new Date(d.getTime() - 7 * 3600_000);
  return s.toISOString().slice(0, 10);
};
const days = ['2026-10-05', '2026-10-06'];
const at = (iso: string, count: number, id: string | null, secs?: number, origin = 'com.fitbit.FitbitMobile') => ({
  startTime: iso,
  count,
  startZoneOffset: id == null ? null : { id, totalSeconds: secs },
  metadata: { dataOrigin: origin },
});

describe('compareStepDays', () => {
  it('agrees when every record is in the phone zone', () => {
    const c = compareStepDays(
      [at('2026-10-05T20:00:00Z', 100, '-07:00', -25200), at('2026-10-06T20:00:00Z', 50, '-07:00', -25200)],
      days,
      phoneDay
    );
    expect(c.map((d) => [d.byPhoneZone, d.byRecordZone])).toEqual([
      [100, 100],
      [50, 50],
    ]);
  });

  it('moves a record walked in another zone onto its own local day', () => {
    // 06:30 UTC Oct 6 is 23:30 Oct 5 on the phone (UTC-7) but 00:30 Oct 6 at UTC-6.
    const c = compareStepDays([at('2026-10-06T06:30:00Z', 300, '-06:00', -21600)], days, phoneDay);
    expect(c[0]).toMatchObject({ byPhoneZone: 300, byRecordZone: 0 });
    expect(c[1]).toMatchObject({ byPhoneZone: 0, byRecordZone: 300 });
  });

  it('a record with no offset uses the phone zone, and is counted as none', () => {
    const c = compareStepDays([at('2026-10-05T20:00:00Z', 40, null)], days, phoneDay);
    expect(c[0]).toMatchObject({ byPhoneZone: 40, byRecordZone: 40, zones: { none: 1 } });
  });

  it('totals steps per writing app', () => {
    const c = compareStepDays(
      [at('2026-10-05T20:00:00Z', 40, '-07:00', -25200), at('2026-10-05T21:00:00Z', 7, '-07:00', -25200, 'android')],
      days,
      phoneDay
    );
    expect(c[0].origins).toEqual({ 'com.fitbit.FitbitMobile': 40, android: 7 });
  });
});
