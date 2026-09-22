import { describe, expect, it } from 'vitest';
import backup from './__fixtures__/opengym.json';
import { isOpenGymBackup, parseOpenGym } from './opengym';

/**
 * The fixture is a slice of a real openGym backup, trimmed to its shape. The
 * generic set parser reported "no sets found" for the real file, which is what
 * these exist to stop happening again.
 */
describe('recognising the format', () => {
  it('spots an openGym backup', () => {
    expect(isOpenGymBackup(backup)).toBe(true);
  });

  it('does not claim a plain set list or a nested export', () => {
    expect(isOpenGymBackup([{ exerciseName: 'Row', date: '2025-01-01' }])).toBe(false);
    expect(isOpenGymBackup({ workouts: [{ name: 'x', exercises: [] }] })).toBe(false);
    expect(isOpenGymBackup(null)).toBe(false);
    expect(isOpenGymBackup({})).toBe(false);
  });
});

describe('reading it', () => {
  const r = parseOpenGym(backup);

  it('imports the completed sets', () => {
    if ('error' in r) throw new Error(r.error);
    // Two from the first exercise, one custom, one from the second workout.
    expect(r.sets).toHaveLength(4);
  });

  it('skips a set the user never performed', () => {
    // openGym keeps planned sets with done:false. Importing them would invent
    // training that did not happen.
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.filter((s) => s.exerciseName === 'bayesin cable curl')).toHaveLength(1);
  });

  it('names a custom exercise from customEx', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.map((s) => s.exerciseName)).toContain('bayesin cable curl');
  });

  it('keeps the id as a placeholder for an exercise the backup cannot name', () => {
    // The built-in catalogue is not in the file. Losing the dates, weights and
    // reps over a missing label would be the worse trade.
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.map((s) => s.exerciseName)).toContain('openGym 0218');
    expect(r.openGym?.unnamedIds).toEqual(['0009', '0218']);
    expect(r.openGym?.namedCount).toBe(1);
  });

  it('takes the unit from the top-level setting, not per set', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.every((s) => s.weightUnit === 'lb')).toBe(true);
  });

  it('reads the date from `d`, or from the epoch start when there is none', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[0].date).toBe('2024-06-24');
    // The second workout has only `start`.
    expect(r.sets.find((s) => s.workoutName === 'Legs')?.date).toMatch(/^2024-06-/);
  });

  it('carries the workout name through', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[0].workoutName).toBe('2. Back and Biceps');
  });

  it('numbers sets within their exercise', () => {
    if ('error' in r) throw new Error(r.error);
    const first = r.sets.filter((s) => s.exerciseName === 'openGym 0218');
    expect(first.map((s) => s.setIndex)).toEqual([1, 2]);
  });

  it('reports a workout with no exercises rather than dropping it silently', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.skipped).toEqual([{ row: 3, reason: 'no exercises' }]);
  });

  it('refuses a backup with nothing completed in it', () => {
    const empty = parseOpenGym({ unit: 'kg', workouts: [{ d: '2025-01-01', entries: [] }] });
    expect('error' in empty).toBe(true);
  });
});
