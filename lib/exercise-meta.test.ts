import { describe, expect, it } from 'vitest';
import { capitalise, exerciseMetaLine, toggleById } from './exercise-meta';

const ex = (over: Partial<Parameters<typeof exerciseMetaLine>[0]> = {}) => ({
  equipment: 'body only',
  level: 'beginner',
  category: 'strength',
  primaryMuscles: '["abdominals","middle back","lats"]',
  ...over,
});

describe('the meta line under an exercise name', () => {
  it('uses the filter group, capitalised, and at most two muscles', () => {
    expect(exerciseMetaLine(ex())).toBe('Bodyweight · Beginner · Abdominals, Middle back');
    expect(exerciseMetaLine(ex({ equipment: 'e-z curl bar' }))).toBe('Barbell · Beginner · Abdominals, Middle back');
  });

  it('leaves out "Other" and anything unknown rather than printing a blank', () => {
    expect(exerciseMetaLine(ex({ equipment: 'other', level: null, primaryMuscles: '[]' }))).toBe('');
    expect(exerciseMetaLine(ex({ equipment: null, primaryMuscles: 'not json' }))).toBe('Beginner');
  });

  it('marks what you made yourself', () => {
    expect(exerciseMetaLine(ex({ category: 'custom', equipment: 'Smith machine' }))).toMatch(/^Machine · Yours · /);
  });

  it('capitalises only the first letter', () => {
    expect(capitalise('middle back')).toBe('Middle back');
    expect(capitalise('')).toBe('');
  });
});

describe('picking several exercises', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('keeps them in the order they were tapped', () => {
    expect(toggleById(toggleById(toggleById([], c), a), b).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('unpicks on a second tap and closes the gap', () => {
    expect(toggleById([c, a, b], a).map((x) => x.id)).toEqual(['c', 'b']);
    expect(toggleById([a], { id: 'a' })).toEqual([]);
  });
});
