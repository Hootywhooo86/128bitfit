import { describe, expect, it } from 'vitest';
import { calorieRingState } from './calorie-ring';

describe('nothing logged is not zero eaten', () => {
  it('reports empty when nothing has been logged', () => {
    expect(calorieRingState(null, 2200)).toEqual({ status: 'empty', target: 2200 });
  });

  it('reports a logged zero as a real reading, not as empty', () => {
    // Someone can log a 0 kcal drink. That is a measurement; absence is not.
    const state = calorieRingState(0, 2200);
    expect(state.status).toBe('under');
    expect(state).toMatchObject({ eaten: 0, remaining: 2200, pct: 0 });
  });
});

describe('under target', () => {
  it('computes what is left and how far along', () => {
    expect(calorieRingState(1100, 2200)).toEqual({
      status: 'under',
      eaten: 1100,
      target: 2200,
      remaining: 1100,
      pct: 0.5,
    });
  });

  it('treats exactly on target as under, not over', () => {
    const state = calorieRingState(2200, 2200);
    expect(state.status).toBe('under');
    expect(state).toMatchObject({ remaining: 0, pct: 1 });
  });
});

describe('over target', () => {
  it('reports the overage as a positive number', () => {
    expect(calorieRingState(2500, 2200)).toEqual({
      status: 'over',
      eaten: 2500,
      target: 2200,
      exceededBy: 300,
      pct: 1,
    });
  });

  it('caps the bar at full rather than overflowing the layout', () => {
    const state = calorieRingState(99_999, 2200);
    expect(state.status).toBe('over');
    if (state.status === 'empty') throw new Error('expected a logged state');
    expect(state.pct).toBe(1);
  });
});

describe('degenerate inputs', () => {
  it('does not divide by a zero or missing target', () => {
    const state = calorieRingState(500, 0);
    if (state.status === 'empty') throw new Error('expected a logged state');
    expect(state.pct).toBe(0);
    expect(Number.isFinite(state.pct)).toBe(true);
  });

  it('survives a non-finite consumed value without rendering NaN', () => {
    const state = calorieRingState(Number.NaN, 2200);
    expect(state.status).toBe('under');
    if (state.status === 'empty') throw new Error('expected a logged state');
    expect(Number.isFinite(state.pct)).toBe(true);
  });
});
