import { describe, expect, it } from 'vitest';
import { pickDetected, sourceName, sportForType, workoutTypeName, type DetectedSession } from './detected-workouts';

const MIN = 60_000;
const T = Date.UTC(2026, 9, 3, 13);
const s = (id: string, startMin: number, lenMin: number, extra: Partial<DetectedSession> = {}): DetectedSession => ({
  id,
  type: 79,
  title: null,
  startMs: T + startMin * MIN,
  endMs: T + (startMin + lenMin) * MIN,
  source: 'com.fitbit.FitbitMobile',
  ...extra,
});
const opts = { ownPackage: 'com.hootywhooo86.bit128fit', dismissed: new Set<string>() };

describe('detected workouts', () => {
  it('names types, and a title wins', () => {
    expect(workoutTypeName(79)).toBe('Walk');
    expect(workoutTypeName(36)).toBe('HIIT');
    expect(workoutTypeName(70)).toBe('Strength training');
    expect(workoutTypeName(999)).toBe('Workout');
    expect(workoutTypeName(79, 'Evening walk')).toBe('Evening walk');
  });

  it('maps cardio types to the app’s sports, and nothing else', () => {
    expect(sportForType(79)).toBe('walk');
    expect(sportForType(56)).toBe('run');
    expect(sportForType(70)).toBeNull();
  });

  it('leaves out its own, the hidden, the very short, and what you already logged', () => {
    const sessions = [
      s('walk', 0, 30),
      s('mine', 60, 30, { source: 'com.hootywhooo86.bit128fit' }),
      s('hidden', 120, 30),
      s('blip', 200, 2),
      s('gym', 300, 48, { type: 70 }),
    ];
    const logged = [{ startMs: T + 302 * MIN, endMs: T + 350 * MIN }];
    const out = pickDetected(sessions, logged, { ...opts, dismissed: new Set(['hidden']) });
    expect(out.map((x) => x.id)).toEqual(['walk']);
  });

  it('keeps one that only brushes a logged workout', () => {
    const logged = [{ startMs: T + 25 * MIN, endMs: T + 60 * MIN }];
    expect(pickDetected([s('walk', 0, 30)], logged, opts)).toHaveLength(1);
  });

  it('newest first', () => {
    expect(pickDetected([s('a', 0, 10), s('b', 100, 10)], [], opts).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('names known sources', () => {
    expect(sourceName('com.fitbit.FitbitMobile')).toBe('Fitbit');
    expect(sourceName(null)).toBe('another app');
  });
});
