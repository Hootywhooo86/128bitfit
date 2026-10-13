import { describe, expect, it } from 'vitest';
import { cardioEvent, healthDayEvent, strengthEvent } from './events';

describe('family events', () => {
  it('a strength workout, in the shape Tracker reads', () => {
    const e = strengthEvent({
      id: 's1',
      startedAt: new Date(2026, 9, 13, 18, 0),
      endedAt: new Date(2026, 9, 13, 19, 5),
      exerciseCount: 4,
      completedSets: 16,
      names: ['Squat', 'Bench Press'],
    });
    expect(e).toEqual({
      id: 'fit-workout-s1',
      app: 'fit',
      type: 'workout.logged',
      at: new Date(2026, 9, 13, 18, 0).getTime(),
      data: { kind: 'strength', name: 'Squat · Bench Press', minutes: 65, exercises: 4, sets: 16 },
    });
  });

  it('an unfinished length is null, not zero', () => {
    const e = strengthEvent({ id: 's2', startedAt: new Date(), endedAt: null, exerciseCount: 0, completedSets: 0, names: [] });
    expect(e?.data).toMatchObject({ minutes: null, name: 'Workout' });
  });

  it('a cardio session in minutes and km', () => {
    const e = cardioEvent({ id: 'c1', sportLabel: 'Run', startedAt: 1, movingS: 1830, elapsedS: 2000, distanceM: 5234 });
    expect(e).toMatchObject({ id: 'fit-cardio-c1', data: { kind: 'cardio', name: 'Run', minutes: 31, km: 5.23 } });
  });

  it('a health day keeps not-measured as null, and a blank day is not sent', () => {
    const e = healthDayEvent({ date: '2026-10-13', steps: 8432, sleepMinutes: null, restingHeartRate: 58, activeCalories: 312.6, distanceMeters: null });
    expect(e).toMatchObject({
      id: 'fit-health-2026-10-13',
      type: 'health.day',
      at: new Date(2026, 9, 13).getTime(),
      data: { date: '2026-10-13', steps: 8432, sleepMinutes: null, restingHeartRate: 58, activeCalories: 313, km: null },
    });
    expect(healthDayEvent({ date: '2026-10-12', steps: null, sleepMinutes: null, restingHeartRate: null, activeCalories: null, distanceMeters: null })).toBeNull();
  });

  it('zero steps is a reading and is sent', () => {
    const e = healthDayEvent({ date: '2026-10-11', steps: 0, sleepMinutes: null, restingHeartRate: null, activeCalories: null, distanceMeters: null });
    expect(e?.data.steps).toBe(0);
  });
});
