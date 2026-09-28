import { describe, expect, it } from 'vitest';
import { repeatPlan, type RepeatSource } from './repeat-workout';

const set = (completed: boolean, extra: Partial<{ isWarmup: boolean; setType: string }> = {}) => ({
  completed,
  isWarmup: false,
  setType: 'normal',
  ...extra,
});
const ex = (id: string, sets: RepeatSource['sets'], group: string | null = null): RepeatSource => ({
  exerciseId: id,
  restSeconds: 90,
  notes: null,
  supersetGroup: group,
  sets,
});

describe('repeating a workout', () => {
  it('keeps the order and counts the working sets that were done', () => {
    const plan = repeatPlan(
      [
        ex('squat', [set(true, { isWarmup: true }), set(true), set(true), set(true), set(false)]),
        ex('curl', [set(true), set(true), set(true, { setType: 'drop' })]),
      ],
      () => 'g'
    );
    expect(plan.map((p) => [p.exerciseId, p.workingSets])).toEqual([
      ['squat', 3],
      ['curl', 2],
    ]);
  });

  it('keeps an exercise that was skipped, at its planned sets', () => {
    expect(repeatPlan([ex('dip', [set(false), set(false)])], () => 'g')[0].workingSets).toBe(2);
    expect(repeatPlan([ex('dip', [])], () => 'g')[0].workingSets).toBe(1);
  });

  it('gives the copy its own superset groups', () => {
    let n = 0;
    const plan = repeatPlan(
      [ex('a', [set(true)], 'old1'), ex('b', [set(true)], 'old1'), ex('c', [set(true)]), ex('d', [set(true)], 'old2')],
      () => `new${++n}`
    );
    expect(plan.map((p) => p.supersetGroup)).toEqual(['new1', 'new1', null, 'new2']);
  });
});
