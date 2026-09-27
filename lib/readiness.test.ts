import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLEEP_TARGET_MIN,
  GRADE_EMOJI,
  gradeFromScore,
  readiness,
  restQuality,
  type Grade,
} from './readiness';

const base = {
  sleepMinutes: 7 * 60,
  restingHr: 55,
  baselineRestingHr: 55,
  recentSets: 10,
};

describe('the grade scale', () => {
  it('runs worst to best', () => {
    const order: Grade[] = ['bad', 'poor', 'ok', 'good', 'great'];
    const scores = [10, 35, 55, 75, 95];
    expect(scores.map(gradeFromScore)).toEqual(order);
  });

  it('has a face for every grade', () => {
    for (const g of ['bad', 'poor', 'ok', 'good', 'great'] as Grade[]) {
      expect(GRADE_EMOJI[g].length).toBeGreaterThan(0);
    }
    expect(GRADE_EMOJI.bad).toBe('💩');
    expect(GRADE_EMOJI.great).toBe('👍👍');
  });
});

describe('rest quality', () => {
  it('grades a full night well', () => {
    const r = restQuality(7 * 60);
    expect(r.status).toBe('scored');
    if (r.status !== 'scored') return;
    expect(r.grade).toBe('great');
  });

  it('grades a short night badly', () => {
    expect((restQuality(3 * 60) as { grade: Grade }).grade).toBe('bad');
    expect((restQuality(5 * 60) as { grade: Grade }).grade).toBe('poor');
    expect((restQuality(6 * 60) as { grade: Grade }).grade).toBe('ok');
  });

  it('does not score oversleeping above a night on target', () => {
    // Twelve hours is not better than eight, and grading it higher would
    // reward the wrong thing.
    const onTarget = restQuality(7 * 60);
    const tooMuch = restQuality(12 * 60);
    if (onTarget.status !== 'scored' || tooMuch.status !== 'scored') throw new Error('scored');
    expect(onTarget.grade).toBe('great');
    expect(tooMuch.grade).toBe('good');
    expect(tooMuch.note).toMatch(/well over/);
  });

  it('respects a different target', () => {
    // Eight hours is on target for someone who needs eight, short for nine.
    expect((restQuality(8 * 60, 8 * 60) as { grade: Grade }).grade).toBe('great');
    expect((restQuality(6 * 60, 9 * 60) as { grade: Grade }).grade).toBe('poor');
  });

  it('says it has no data rather than scoring zero', () => {
    const r = restQuality(null);
    expect(r.status).toBe('not-enough-data');
    if (r.status !== 'not-enough-data') return;
    expect(r.missing).toContain('sleep');
  });
});

describe('readiness', () => {
  it('refuses to score without sleep', () => {
    const r = readiness({ ...base, sleepMinutes: null });
    expect(r.status).toBe('not-enough-data');
    if (r.status !== 'not-enough-data') return;
    expect(r.missing).toContain('sleep');
  });

  it('scores on sleep alone, but not to the top of the scale', () => {
    // No baseline heart rate means not enough signal to call someone primed.
    const r = readiness({
      sleepMinutes: 8 * 60,
      restingHr: null,
      baselineRestingHr: null,
      recentSets: null,
    });
    if (r.status !== 'scored') throw new Error('expected a score');
    expect(r.score).toBeLessThanOrEqual(80);
    expect(r.grade).toBe('good');
    expect(r.reasons.join(' ')).toMatch(/sleep only/);
  });

  it('drops the score for a short night', () => {
    const rested = readiness(base);
    const tired = readiness({ ...base, sleepMinutes: 4 * 60 });
    if (rested.status !== 'scored' || tired.status !== 'scored') throw new Error('scored');
    expect(tired.score).toBeLessThan(rested.score);
    expect(tired.grade === 'bad' || tired.grade === 'poor').toBe(true);
  });

  it('counts heart rate against the user, not an absolute number', () => {
    // 60 bpm is high for one person and low for another. Only the delta counts.
    const highForThem = readiness({ ...base, restingHr: 62, baselineRestingHr: 52 });
    const lowForThem = readiness({ ...base, restingHr: 62, baselineRestingHr: 70 });
    if (highForThem.status !== 'scored' || lowForThem.status !== 'scored') throw new Error('scored');
    expect(highForThem.score).toBeLessThan(lowForThem.score);
    expect(highForThem.reasons.join(' ')).toMatch(/above your usual/);
  });

  it('does not let one odd heart-rate reading swamp the score', () => {
    const wild = readiness({ ...base, restingHr: 140, baselineRestingHr: 55 });
    if (wild.status !== 'scored') throw new Error('scored');
    // Capped, so a bad reading costs at most 20 points rather than all of them.
    expect(wild.score).toBeGreaterThan(0);
  });

  it('takes something off for a heavy couple of days', () => {
    const light = readiness({ ...base, recentSets: 5 });
    const heavy = readiness({ ...base, recentSets: 70 });
    if (light.status !== 'scored' || heavy.status !== 'scored') throw new Error('scored');
    expect(heavy.score).toBeLessThan(light.score);
    expect(heavy.reasons.join(' ')).toMatch(/sets in the last two days/);
  });

  it('stays inside 0 to 100', () => {
    const best = readiness({
      sleepMinutes: 9 * 60,
      restingHr: 40,
      baselineRestingHr: 60,
      recentSets: 0,
    });
    const worst = readiness({
      sleepMinutes: 30,
      restingHr: 90,
      baselineRestingHr: 50,
      recentSets: 90,
    });
    if (best.status !== 'scored' || worst.status !== 'scored') throw new Error('scored');
    expect(best.score).toBeLessThanOrEqual(100);
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });

  it('explains itself in plain sentences', () => {
    const r = readiness(base);
    if (r.status !== 'scored') throw new Error('scored');
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons[0]).toMatch(/sleep/);
  });

  it('uses seven hours as the default target', () => {
    expect(DEFAULT_SLEEP_TARGET_MIN).toBe(420);
  });
});

/**
 * Reported from a real phone: the rest card read "💩 Rest — 0h 0m of 7h" on a
 * night nothing had recorded. Zero minutes is not a bad night, it is an absent
 * reading, and grading it is the app inventing a measurement and then judging
 * the user for it.
 */
describe('a night with no reading', () => {
  it('does not grade zero minutes as the worst possible rest', () => {
    const r = restQuality(0);
    expect(r.status).toBe('not-enough-data');
    if (r.status === 'not-enough-data') expect(r.missing).toContain('sleep');
  });

  it('treats a negative reading the same way', () => {
    expect(restQuality(-30).status).toBe('not-enough-data');
  });

  it('still grades a genuinely short night', () => {
    // The fix must not swallow a real three-hour night, which is a bad one.
    const r = restQuality(180);
    expect(r.status).toBe('scored');
    if (r.status === 'scored') expect(r.grade).toBe('bad');
  });

  it('gives no readiness score from zero sleep', () => {
    const r = readiness({
      sleepMinutes: 0,
      restingHr: 58,
      baselineRestingHr: 56,
      recentSets: 10,
    });
    expect(r.status).toBe('not-enough-data');
    if (r.status === 'not-enough-data') expect(r.missing).toContain('sleep');
  });

  it('still scores a real night that was short', () => {
    const r = readiness({
      sleepMinutes: 200,
      restingHr: 58,
      baselineRestingHr: 56,
      recentSets: 10,
    });
    expect(r.status).toBe('scored');
  });
});

describe('the legend bands', () => {
  it('cover 0–100 with no gaps or overlaps, and agree with the grade', async () => {
    const { READINESS_BANDS, gradeFromScore } = await import('./readiness');
    expect(READINESS_BANDS[0].min).toBe(0);
    expect(READINESS_BANDS[READINESS_BANDS.length - 1].max).toBe(100);
    for (let i = 1; i < READINESS_BANDS.length; i++) {
      expect(READINESS_BANDS[i].min).toBe(READINESS_BANDS[i - 1].max + 1);
    }
    for (const b of READINESS_BANDS) {
      expect(gradeFromScore(b.min)).toBe(b.grade);
      expect(gradeFromScore(b.max)).toBe(b.grade);
    }
  });
});
