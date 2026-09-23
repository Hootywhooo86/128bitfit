import { describe, expect, it } from 'vitest';
import type { MuscleWorkEntry } from './muscle-load';
import { gapReport, suggestSession, type PickableExercise } from './workout-gap';

const entry = (
  completedSets: number,
  primaryMuscles: string[],
  secondaryMuscles: string[] = []
): MuscleWorkEntry => ({ completedSets, primaryMuscles, secondaryMuscles });

describe('what the last 30 days say you have skipped', () => {
  it('says there is no history rather than calling every muscle neglected', () => {
    expect(gapReport([]).status).toBe('no_history');
    // Rows with no completed sets are not history either.
    expect(gapReport([entry(0, ['chest'])]).status).toBe('no_history');
  });

  it('refuses to rank when most of the work came from untagged exercises', () => {
    // The user's own backup had 101 of 109 exercises with no muscles on them.
    // Ranking on that would report chest as neglected when they benched all month.
    const r = gapReport([entry(20, [], []), entry(3, ['chest'])]);
    expect(r.status).toBe('untrustworthy');
    if (r.status === 'untrustworthy') {
      expect(r.untaggedSets).toBe(20);
      expect(r.taggedSets).toBe(3);
    }
  });

  it('still ranks when the tagged work is the majority', () => {
    const r = gapReport([entry(3, []), entry(10, ['chest'])]);
    expect(r.status).toBe('ok');
  });

  it('treats an equal split as usable, not as untrustworthy', () => {
    // Strictly greater, not >=: half the work attributed is enough to rank on.
    const r = gapReport([entry(5, []), entry(5, ['chest'])]);
    expect(r.status).toBe('ok');
  });

  it('puts the muscles with no sets first and keeps a trained one off the top', () => {
    const r = gapReport([entry(6, ['chest'], ['triceps'])]);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.neglected[0].sets).toBe(0);
    expect(r.neglected[0].level).toBe('none');
    const chest = r.neglected.find((g) => g.muscle === 'chest')!;
    expect(chest.sets).toBe(6);
    // Assisting counts half, and is still training.
    const triceps = r.neglected.find((g) => g.muscle === 'triceps')!;
    expect(triceps.sets).toBe(3);
    expect(r.neglected.indexOf(chest)).toBeGreaterThan(r.neglected.indexOf(r.neglected[0]));
  });

  it('does not let an untagged exercise dilute the tally it is excluded from', () => {
    const r = gapReport([entry(10, ['chest']), entry(4, [])]);
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.tally.chest).toBe(10);
    expect(r.untaggedSets).toBe(4);
  });
});

const ex = (
  id: string,
  name: string,
  primaryMuscles: string[],
  familiar = false
): PickableExercise => ({ id, name, primaryMuscles, secondaryMuscles: [], familiar });

describe('building a session out of the gaps', () => {
  const gaps = [
    { muscle: 'calves' as const, sets: 0, level: 'none' as const },
    { muscle: 'hamstrings' as const, sets: 0, level: 'none' as const },
    { muscle: 'glutes' as const, sets: 0, level: 'none' as const },
  ];

  it('prefers the exercise covering the most untrained muscles', () => {
    const out = suggestSession(gaps, [
      ex('a', 'Calf Raise', ['calves']),
      ex('b', 'Romanian Deadlift', ['hamstrings', 'glutes']),
    ]);
    expect(out[0].exercise.id).toBe('b');
    expect(out[0].covers.sort()).toEqual(['glutes', 'hamstrings']);
  });

  it('never counts an assisting muscle as covering the gap', () => {
    // A session picked on assistance leaves the muscle as untrained as it started.
    const out = suggestSession(gaps, [
      { id: 'a', name: 'Squat', primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'] },
    ]);
    expect(out).toEqual([]);
  });

  it('breaks a tie towards an exercise you have done before', () => {
    const out = suggestSession(gaps, [
      ex('a', 'Aaa Machine Curl', ['calves'], false),
      ex('b', 'Zzz Standing Raise', ['calves'], true),
    ]);
    expect(out[0].exercise.id).toBe('b');
  });

  it('is stable: the same history suggests the same session twice running', () => {
    const lib = [ex('a', 'Bbb', ['calves']), ex('b', 'Aaa', ['calves'])];
    expect(suggestSession(gaps, lib)[0].exercise.id).toBe(
      suggestSession(gaps, [...lib].reverse())[0].exercise.id
    );
  });

  it('stops rather than padding with exercises that miss the gap', () => {
    const out = suggestSession(gaps, [ex('a', 'Bench Press', ['chest'])], 5);
    expect(out).toEqual([]);
  });

  it('never repeats an exercise, and respects the cap', () => {
    const out = suggestSession(gaps, [
      ex('a', 'Calf Raise', ['calves']),
      ex('b', 'Leg Curl', ['hamstrings']),
      ex('c', 'Hip Thrust', ['glutes']),
    ], 2);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((o) => o.exercise.id)).size).toBe(2);
  });

  it('ignores a muscle name the library does not use rather than guessing', () => {
    const out = suggestSession(gaps, [ex('a', 'Mystery', ['pecs'])]);
    expect(out).toEqual([]);
  });
});

describe('muscle names the app does not recognise', () => {
  it('counts as unattributed, not as tagged work', () => {
    // An import that wrote "pecs" and "delts" has a name on every row and
    // still contributes nothing to the tally. Counting it as attributed would
    // let the trustworthiness check pass with every muscle reading zero.
    const r = gapReport([entry(20, ['pecs', 'delts']), entry(3, ['chest'])]);
    expect(r.status).toBe('untrustworthy');
    if (r.status === 'untrustworthy') expect(r.untaggedSets).toBe(20);
  });

  it('is excluded from the tally it cannot contribute to', () => {
    const r = gapReport([entry(10, ['chest']), entry(2, ['pecs'])]);
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.tally.chest).toBe(10);
    expect(r.taggedSets).toBe(10);
    expect(r.untaggedSets).toBe(2);
  });
});
