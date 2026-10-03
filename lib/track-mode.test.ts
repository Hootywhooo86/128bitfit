import { describe, expect, it } from 'vitest';
import { defaultTrack, distanceRecord, distanceBests, formatLoadDistance, loadDistance, parseTrackPrefs, trackFor } from './track-mode';

describe('which exercises start on distance', () => {
  it('carries and sleds', () => {
    for (const n of ["Farmer's Walk", 'Farmers Walk', 'Suitcase Carry', 'Yoke Walk', 'Sled Push', 'Sled Drag - Harness', 'Prowler Sprint', 'Sandbag Walk']) {
      expect(defaultTrack(n)).toBe('distance');
    }
  });
  it('everything else, including lifts that move', () => {
    for (const n of ['Bench Press', 'Walking Lunge', 'Barbell Squat', 'Cable Crunch', 'Sled Leg Press']) {
      expect(defaultTrack(n)).toBe('reps');
    }
  });
  it('a remembered choice wins over the default', () => {
    expect(trackFor('fw', "Farmer's Walk", { fw: 'reps' })).toBe('reps');
    expect(trackFor('bp', 'Bench Press', { bp: 'distance' })).toBe('distance');
    expect(trackFor('bp', 'Bench Press', {})).toBe('reps');
  });
  it('reads the stored map defensively', () => {
    expect(parseTrackPrefs('{"a":"distance","b":"sideways"}')).toEqual({ a: 'distance' });
    expect(parseTrackPrefs('not json')).toEqual({});
  });
});

describe('load x distance', () => {
  const done = (weight: number | null, distanceM: number | null, extra = {}) => ({ weight, distanceM, completed: true, ...extra });
  it('adds finished sets: 2 x 45 lb carried 40 m, three times', () => {
    expect(loadDistance([done(90, 40), done(90, 40), done(90, 40)])).toBe(10800);
  });
  it('skips unfinished, warm-up and half-filled sets, and is null with nothing', () => {
    expect(loadDistance([{ weight: 90, distanceM: 40, completed: false }, done(45, 20, { isWarmup: true }), done(null, 40)])).toBeNull();
  });
  it('bests', () => {
    expect(distanceBests([done(90, 40), done(100, 30), done(null, 60)])).toEqual({ heaviest: 100, furthest: 60 });
  });
  it('formats', () => {
    expect(formatLoadDistance(10800, 'lb')).toBe('10,800 lb·m');
  });
});

describe('carry records', () => {
  const done = (weight: number, distanceM: number) => ({ weight, distanceM, completed: true });
  const history = [done(90, 40), done(70, 60)];
  it('heaviest load carried', () => {
    expect(distanceRecord({ weight: 100, distanceM: 20 }, history, 'lb')).toBe('Heaviest yet: 100 lb over 20 m');
  });
  it('furthest at a load at least as heavy', () => {
    expect(distanceRecord({ weight: 90, distanceM: 50 }, history, 'lb')).toBe('Furthest yet at 90 lb: 50 m');
    expect(distanceRecord({ weight: 70, distanceM: 50 }, history, 'lb')).toBeNull();
  });
  it('no record the first time', () => {
    expect(distanceRecord({ weight: 90, distanceM: 40 }, [], 'lb')).toBeNull();
  });
});
