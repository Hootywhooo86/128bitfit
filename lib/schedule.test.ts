import { describe, expect, it } from 'vitest';
import { EMPTY_WEEK, parseWeekPlan, planFor, sessionsPerWeek, weekdayIndex } from './schedule';

describe('weekly plan', () => {
  it('starts the week on Monday', () => {
    expect(weekdayIndex(new Date(2026, 8, 28))).toBe(0); // Mon 28 Sep 2026
    expect(weekdayIndex(new Date(2026, 8, 27))).toBe(6); // Sun
  });

  it('reads back what was saved, and nothing from garbage', () => {
    const plan = ['r1', 'rest', null, 'r2', null, null, 'rest'];
    expect(parseWeekPlan(JSON.stringify(plan))).toEqual(plan);
    expect(parseWeekPlan('{bad')).toEqual(EMPTY_WEEK);
    expect(parseWeekPlan(JSON.stringify([1, 2]))).toEqual(EMPTY_WEEK);
    expect(parseWeekPlan(null)).toEqual(EMPTY_WEEK);
  });

  it('never offers a deleted routine as today’s session', () => {
    const plan = ['gone', 'r1', 'rest', null, null, null, null];
    const ids = new Set(['r1']);
    expect(planFor(plan, new Date(2026, 8, 28), ids)).toBeNull(); // Mon → deleted
    expect(planFor(plan, new Date(2026, 8, 29), ids)).toBe('r1');
    expect(planFor(plan, new Date(2026, 8, 30), ids)).toBe('rest');
  });

  it('counts planned sessions, not rest days or blanks', () => {
    expect(sessionsPerWeek(['r1', 'rest', 'r1', null, 'gone', null, null], new Set(['r1']))).toBe(2);
  });
});
