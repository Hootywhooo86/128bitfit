import { describe, expect, it } from 'vitest';
import {
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  SECONDARY_SET_WEIGHT,
  emptyTally,
  loadLevel,
  neglectedMuscles,
  rankMuscles,
  tallyMuscleSets,
} from './muscle-load';

describe('the load scale from the brief', () => {
  it.each([
    [0, 'none'],
    [1, 'light'],
    [3, 'light'],
    [4, 'medium'],
    [7, 'medium'],
    [8, 'heavy'],
    [30, 'heavy'],
  ])('%i sets is %s', (sets, expected) => {
    expect(loadLevel(sets)).toBe(expected);
  });

  it('treats the boundaries exactly as written: 1-3, 4-7, 8+', () => {
    expect(loadLevel(3.9)).toBe('light');
    expect(loadLevel(4)).toBe('medium');
    expect(loadLevel(7.9)).toBe('medium');
    expect(loadLevel(8)).toBe('heavy');
  });

  it('never reports load for nothing, including junk input', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(loadLevel(bad)).toBe('none');
    }
  });

  it('counts a half set as trained, not untrained', () => {
    expect(loadLevel(SECONDARY_SET_WEIGHT)).toBe('light');
  });
});

describe('tallying sets across exercises', () => {
  it('gives a full set to the target muscle', () => {
    const t = tallyMuscleSets([
      { completedSets: 4, primaryMuscles: ['chest'], secondaryMuscles: [] },
    ]);
    expect(t.chest).toBe(4);
  });

  it('gives assisting muscles half, so a press day is not a triceps day', () => {
    const t = tallyMuscleSets([
      { completedSets: 4, primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] },
    ]);
    expect(t.chest).toBe(4);
    expect(t.triceps).toBe(2);
    expect(t.shoulders).toBe(2);
  });

  it('accumulates across exercises', () => {
    const t = tallyMuscleSets([
      { completedSets: 3, primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] },
      { completedSets: 3, primaryMuscles: ['triceps'], secondaryMuscles: [] },
    ]);
    expect(t.chest).toBe(3);
    expect(t.triceps).toBe(4.5);
  });

  it('ignores exercises with no completed sets', () => {
    const t = tallyMuscleSets([
      { completedSets: 0, primaryMuscles: ['chest'], secondaryMuscles: [] },
      { completedSets: -2, primaryMuscles: ['lats'], secondaryMuscles: [] },
    ]);
    expect(t.chest).toBe(0);
    expect(t.lats).toBe(0);
  });

  it('ignores unknown muscle names instead of guessing', () => {
    // A typo should surface as a missing muscle, not as load on the wrong one.
    const t = tallyMuscleSets([
      { completedSets: 5, primaryMuscles: ['pecs', ''], secondaryMuscles: ['tricep'] },
    ]);
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });

  it('normalises case and stray whitespace from the data', () => {
    const t = tallyMuscleSets([
      { completedSets: 2, primaryMuscles: [' Chest '], secondaryMuscles: ['TRICEPS'] },
    ]);
    expect(t.chest).toBe(2);
    expect(t.triceps).toBe(1);
  });

  it('rounds half sets to one decimal rather than trailing noise', () => {
    const t = tallyMuscleSets([
      { completedSets: 1, primaryMuscles: [], secondaryMuscles: ['glutes'] },
      { completedSets: 1, primaryMuscles: [], secondaryMuscles: ['glutes'] },
      { completedSets: 1, primaryMuscles: [], secondaryMuscles: ['glutes'] },
    ]);
    expect(t.glutes).toBe(1.5);
  });

  it('starts from a tally containing every group', () => {
    expect(Object.keys(emptyTally()).sort()).toEqual([...MUSCLE_GROUPS].sort());
  });
});

describe('ranking and balance', () => {
  it('ranks heaviest first', () => {
    const t = tallyMuscleSets([
      { completedSets: 9, primaryMuscles: ['quadriceps'], secondaryMuscles: [] },
      { completedSets: 2, primaryMuscles: ['chest'], secondaryMuscles: [] },
    ]);
    const ranked = rankMuscles(t);
    expect(ranked[0]).toEqual({ muscle: 'quadriceps', sets: 9 });
    expect(ranked[1]).toEqual({ muscle: 'chest', sets: 2 });
  });

  it('names the least-trained muscles', () => {
    const t = tallyMuscleSets([
      { completedSets: 9, primaryMuscles: ['quadriceps'], secondaryMuscles: [] },
    ]);
    const neglected = neglectedMuscles(t, 3);
    expect(neglected).toHaveLength(3);
    expect(neglected).not.toContain('quadriceps');
  });

  it('says nothing when nothing has been trained', () => {
    // With an empty tally every muscle is equally neglected; that is noise.
    expect(neglectedMuscles(emptyTally())).toEqual([]);
  });
});

describe('presentation', () => {
  it('has a label for every group, so no raw data string reaches the UI', () => {
    for (const m of MUSCLE_GROUPS) {
      expect(MUSCLE_LABELS[m]).toBeTruthy();
      expect(MUSCLE_LABELS[m]).not.toBe(m === 'neck' ? '' : undefined);
    }
  });
});
