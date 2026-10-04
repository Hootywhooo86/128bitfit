import { describe, expect, it } from 'vitest';
import { sortDetected, sourceName, sportForType, workoutTypeName, type DetectedSession } from './detected-workouts';

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

  it('drops only its own; holds back the hidden, the blips and what you logged, with reasons', () => {
    const sessions = [
      s('walk', 0, 30),
      s('mine', 60, 30, { source: 'com.hootywhooo86.bit128fit' }),
      s('hidden', 120, 30),
      s('blip', 200, 0.5),
      s('short', 220, 2),
      s('gym', 300, 48, { type: 70 }),
    ];
    const logged = [{ startMs: T + 302 * MIN, endMs: T + 350 * MIN }];
    const out = sortDetected(sessions, logged, { ...opts, dismissed: new Set(['hidden']) });
    expect(out.shown.map((x) => x.id)).toEqual(['short', 'walk']);
    expect(out.hidden.map((h) => [h.session.id, h.reason])).toEqual([
      ['gym', 'logged'],
      ['blip', 'short'],
      ['hidden', 'dismissed'],
    ]);
  });

  it('keeps one that only brushes a logged workout', () => {
    const logged = [{ startMs: T + 25 * MIN, endMs: T + 60 * MIN }];
    expect(sortDetected([s('walk', 0, 30)], logged, opts).shown).toHaveLength(1);
  });

  it('a long logged session does not swallow a walk recorded inside it', () => {
    // App session left running for three hours; the watch caught a 30-minute walk in the middle.
    const logged = [{ startMs: T, endMs: T + 180 * MIN }];
    expect(sortDetected([s('walk', 60, 30)], logged, opts).shown.map((x) => x.id)).toEqual(['walk']);
  });

  it('a watch session of the same workout you logged is held back', () => {
    const logged = [{ startMs: T + 2 * MIN, endMs: T + 62 * MIN }];
    const out = sortDetected([s('lift', 0, 55, { type: 70 })], logged, opts);
    expect(out.shown).toHaveLength(0);
    expect(out.hidden[0].reason).toBe('logged');
  });

  it('newest first, with no cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`w${i}`, i * 60, 20));
    const out = sortDetected(many, [], opts).shown;
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe('w19');
  });

  it('names known sources', () => {
    expect(sourceName('com.fitbit.FitbitMobile')).toBe('Fitbit');
    expect(sourceName(null)).toBe('another app');
  });
});
