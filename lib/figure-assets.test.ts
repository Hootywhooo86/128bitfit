import { describe, expect, it } from 'vitest';
import exercisesJson from '@/assets/data/exercises.json';
import figureJson from '@/assets/figure/figure.json';
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from './muscle-load';

type RawExercise = { primaryMuscles?: string[]; secondaryMuscles?: string[] };

const mapped = new Set<string>([
  ...(figureJson.front.muscles as string[]),
  ...(figureJson.back.muscles as string[]),
]);

/**
 * There should be no such thing as an unknown muscle: the app owns the list and
 * the artwork. These make that a build failure rather than a muscle that
 * silently never lights up on the map.
 */
describe('muscle coverage is closed, not best-effort', () => {
  it('every muscle in the shipped exercise data is a known group', () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    const unknown = new Set<string>();
    for (const e of exercisesJson as RawExercise[]) {
      for (const m of [...(e.primaryMuscles ?? []), ...(e.secondaryMuscles ?? [])]) {
        if (!known.has(m)) unknown.add(m);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('every known group has artwork on at least one view', () => {
    expect(MUSCLE_GROUPS.filter((m) => !mapped.has(m))).toEqual([]);
  });

  it('the artwork names nothing that is not a known group', () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    expect([...mapped].filter((m) => !known.has(m))).toEqual([]);
  });

  it('every group has a display label', () => {
    expect(MUSCLE_GROUPS.filter((m) => !MUSCLE_LABELS[m])).toEqual([]);
  });

  it('puts each muscle on the view it is actually visible from', () => {
    // Drawing glutes on the front or pecs on the back would colour the wrong
    // part of the body, which is worse than not colouring it at all.
    const front = new Set(figureJson.front.muscles as MuscleGroup[]);
    const back = new Set(figureJson.back.muscles as MuscleGroup[]);
    for (const m of ['chest', 'abdominals', 'quadriceps', 'biceps'] as MuscleGroup[]) {
      expect(front.has(m), `${m} on front`).toBe(true);
      expect(back.has(m), `${m} not on back`).toBe(false);
    }
    for (const m of ['glutes', 'hamstrings', 'lower back', 'middle back'] as MuscleGroup[]) {
      expect(back.has(m), `${m} on back`).toBe(true);
      expect(front.has(m), `${m} not on front`).toBe(false);
    }
  });
});
