import { describe, expect, it } from 'vitest';
import { workoutTypeName } from '@/lib/detected-workouts';
import {
  healthKitTypeForHc,
  hcTypeForHealthKit,
  percentFromFraction,
  sleepMinutesFromStages,
} from './healthkit-map';

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('HealthKit workout types', () => {
  it('maps the common ones onto Health Connect numbers', () => {
    expect(hcTypeForHealthKit(52)).toEqual({ type: 79, title: null }); // walk
    expect(hcTypeForHealthKit(37)).toEqual({ type: 56, title: null }); // run
    expect(hcTypeForHealthKit(50)).toEqual({ type: 70, title: null }); // strength
    expect(hcTypeForHealthKit(63)).toEqual({ type: 36, title: null }); // HIIT
    expect(hcTypeForHealthKit(24)).toEqual({ type: 37, title: null }); // hike
  });

  it('tells indoor runs, rides and rows, and open-water swims apart', () => {
    expect(hcTypeForHealthKit(37, { indoor: true }).type).toBe(57);
    expect(hcTypeForHealthKit(13, { indoor: 1 }).type).toBe(9);
    expect(hcTypeForHealthKit(13).type).toBe(8);
    expect(hcTypeForHealthKit(35, { indoor: true }).type).toBe(54);
    expect(hcTypeForHealthKit(46, { swimmingLocation: 2 }).type).toBe(73);
    expect(hcTypeForHealthKit(46, { swimmingLocation: 1 }).type).toBe(74);
  });

  it('keeps HealthKit’s own name where Health Connect has no number', () => {
    const m = hcTypeForHealthKit(79);
    expect(m).toEqual({ type: 0, title: 'Pickleball' });
    expect(workoutTypeName(m.type, m.title)).toBe('Pickleball');
  });

  it('unknown and "other" come through unnamed, so the app asks', () => {
    expect(hcTypeForHealthKit(3000)).toEqual({ type: 0, title: null });
    expect(hcTypeForHealthKit(12345)).toEqual({ type: 0, title: null });
  });

  it('writes the app’s own sports back as the right HealthKit types', () => {
    expect(healthKitTypeForHc(70)).toEqual({ activityType: 50, indoor: false });
    expect(healthKitTypeForHc(79)).toEqual({ activityType: 52, indoor: false });
    expect(healthKitTypeForHc(56)).toEqual({ activityType: 37, indoor: false });
    expect(healthKitTypeForHc(57)).toEqual({ activityType: 37, indoor: true });
    expect(healthKitTypeForHc(8)).toEqual({ activityType: 13, indoor: false });
    expect(healthKitTypeForHc(9)).toEqual({ activityType: 13, indoor: true });
    expect(healthKitTypeForHc(37)).toEqual({ activityType: 24, indoor: false });
    expect(healthKitTypeForHc(82)).toEqual({ activityType: 70, indoor: false });
    expect(healthKitTypeForHc(999)).toEqual({ activityType: 3000, indoor: false });
  });

  it('round-trips every cardio sport the app records', () => {
    for (const hc of [56, 57, 79, 37, 82, 8, 9]) {
      const { activityType, indoor } = healthKitTypeForHc(hc);
      expect(hcTypeForHealthKit(activityType, { indoor }).type).toBe(hc);
    }
  });
});

describe('HealthKit sleep', () => {
  it('files a night under the morning it ended, counting only asleep stages', () => {
    const night = [
      { value: 0, startMs: at(2026, 10, 3, 22, 30), endMs: at(2026, 10, 4, 7) }, // in bed
      { value: 3, startMs: at(2026, 10, 3, 23), endMs: at(2026, 10, 4, 2) }, // core 3h
      { value: 2, startMs: at(2026, 10, 4, 2), endMs: at(2026, 10, 4, 2, 30) }, // awake
      { value: 4, startMs: at(2026, 10, 4, 2, 30), endMs: at(2026, 10, 4, 4) }, // deep 1.5h
      { value: 5, startMs: at(2026, 10, 4, 4), endMs: at(2026, 10, 4, 6, 30) }, // REM 2.5h
    ];
    const out = sleepMinutesFromStages(night);
    expect(out.get('2026-10-04')).toBe(7 * 60);
    expect(out.has('2026-10-03')).toBe(false);
  });

  it('counts the same minutes once when phone and watch both recorded them', () => {
    const watch = { value: 3, startMs: at(2026, 10, 3, 23), endMs: at(2026, 10, 4, 6) };
    const phone = { value: 1, startMs: at(2026, 10, 4, 0), endMs: at(2026, 10, 4, 7) };
    expect(sleepMinutesFromStages([watch, phone]).get('2026-10-04')).toBe(8 * 60);
  });

  it('an afternoon nap is its own sleep, filed under its own day', () => {
    const night = { value: 1, startMs: at(2026, 10, 3, 23), endMs: at(2026, 10, 4, 6) };
    const nap = { value: 1, startMs: at(2026, 10, 4, 14), endMs: at(2026, 10, 4, 15) };
    expect(sleepMinutesFromStages([night, nap]).get('2026-10-04')).toBe(8 * 60);
  });

  it('nothing asleep is no entry, not zero', () => {
    const inBed = { value: 0, startMs: at(2026, 10, 3, 23), endMs: at(2026, 10, 4, 6) };
    expect(sleepMinutesFromStages([inBed]).size).toBe(0);
    expect(sleepMinutesFromStages([]).size).toBe(0);
  });
});

describe('HealthKit percentages', () => {
  it('fractions become percent, missing stays missing', () => {
    expect(percentFromFraction(0.215)).toBe(21.5);
    expect(percentFromFraction(0.98)).toBe(98);
    expect(percentFromFraction(null)).toBeNull();
    expect(percentFromFraction(NaN)).toBeNull();
  });
});
