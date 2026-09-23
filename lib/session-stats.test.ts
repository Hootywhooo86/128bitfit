import { describe, expect, it } from 'vitest';
import { formatElapsed, sessionStats, type StatSet } from './session-stats';

const set = (o: Partial<StatSet> = {}): StatSet => ({
  completed: true,
  reps: 10,
  weight: 100,
  isWarmup: false,
  ...o,
});

describe('the numbers at the top of a session', () => {
  it('multiplies weight by reps over completed sets', () => {
    expect(sessionStats([set(), set()]).volume).toBe(2000);
  });

  it('counts only completed sets as done, but all of them as total', () => {
    const s = sessionStats([set(), set({ completed: false }), set({ completed: false })]);
    expect(s.setsDone).toBe(1);
    expect(s.setsTotal).toBe(3);
  });

  it('ignores a set that was not completed, however heavy it was planned', () => {
    expect(sessionStats([set({ completed: false, weight: 500 })]).volume).toBe(0);
  });

  it('counts a warm-up as a set but not as volume', () => {
    // Warm-ups are work you did, so hiding them misreports the session; they
    // are deliberately light, so counting them inflates the only number whose
    // use is comparing weeks.
    const s = sessionStats([set({ isWarmup: true, weight: 45 }), set()]);
    expect(s.setsDone).toBe(2);
    expect(s.volume).toBe(1000);
  });

  it('flags a bodyweight set as work the volume cannot see', () => {
    const s = sessionStats([set({ weight: null })]);
    expect(s.setsDone).toBe(1);
    expect(s.volume).toBe(0);
    expect(s.volumePartial).toBe(true);
  });

  it('does not flag a session where every completed set had both numbers', () => {
    expect(sessionStats([set(), set()]).volumePartial).toBe(false);
  });

  it('treats a genuine zero weight as a reading, not as missing', () => {
    // 0 lb on an assisted machine is a real entry; null is "not recorded".
    const s = sessionStats([set({ weight: 0 })]);
    expect(s.volume).toBe(0);
    expect(s.volumePartial).toBe(false);
  });

  it('is not poisoned by a non-finite value', () => {
    const s = sessionStats([set(), set({ weight: Number.NaN })]);
    expect(s.volume).toBe(1000);
    expect(s.volumePartial).toBe(true);
  });

  it('reads zero on an empty session rather than throwing', () => {
    expect(sessionStats([])).toEqual({
      setsDone: 0,
      setsTotal: 0,
      volume: 0,
      volumePartial: false,
    });
  });
});

describe('the elapsed clock', () => {
  it('is mm:ss under an hour', () => {
    expect(formatElapsed(35_000)).toBe('0:35');
    expect(formatElapsed(9 * 60_000 + 5_000)).toBe('9:05');
  });

  it('grows to h:mm:ss past an hour rather than counting to 90 minutes', () => {
    expect(formatElapsed(3600_000 + 7 * 60_000 + 3_000)).toBe('1:07:03');
  });

  it('never shows a negative time if the clock moves', () => {
    expect(formatElapsed(-5000)).toBe('0:00');
  });
});
