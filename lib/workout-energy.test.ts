import { describe, expect, it } from 'vitest';
import { workoutEnergy, type EnergyInput } from './workout-energy';

const base: EnergyInput = {
  durationMinutes: 60,
  avgHeartRate: 120,
  measuredKcal: null,
  weightKg: 80,
  age: 35,
  sex: 'male',
};

describe('a measured figure beats an estimate', () => {
  it('uses Health Connect when it has one', () => {
    const r = workoutEnergy({ ...base, measuredKcal: 412 });
    expect(r.status).toBe('measured');
    if (r.status !== 'measured') return;
    expect(r.kcal).toBe(412);
    expect(r.source).toBe('Health Connect');
  });

  it('does not treat a zero as a measurement', () => {
    // 0 kcal for an hour of training is a missing record, not a reading.
    expect(workoutEnergy({ ...base, measuredKcal: 0 }).status).toBe('estimated');
  });
});

describe('estimating from heart rate', () => {
  const r = workoutEnergy(base);

  it('produces a figure in a plausible range for an hour at 120 bpm', () => {
    if (r.status !== 'estimated') throw new Error('expected an estimate');
    expect(r.kcal).toBeGreaterThan(300);
    expect(r.kcal).toBeLessThan(800);
  });

  it('is labelled an estimate and says what it is based on', () => {
    if (r.status !== 'estimated') throw new Error('expected an estimate');
    expect(r.basis).toContain('120 bpm');
    expect(r.basis).toContain('60 min');
  });

  it('admits the equation was not built for lifting', () => {
    if (r.status !== 'estimated') throw new Error('expected an estimate');
    expect(r.caveat).toMatch(/steady cardio/);
  });

  it('scales with effort and with time', () => {
    const harder = workoutEnergy({ ...base, avgHeartRate: 155 });
    const longer = workoutEnergy({ ...base, durationMinutes: 90 });
    if (r.status !== 'estimated' || harder.status !== 'estimated' || longer.status !== 'estimated') {
      throw new Error('estimated');
    }
    expect(harder.kcal).toBeGreaterThan(r.kcal);
    expect(longer.kcal).toBeGreaterThan(r.kcal);
  });

  it('never returns a negative figure for a very low heart rate', () => {
    const rest = workoutEnergy({ ...base, avgHeartRate: 45 });
    if (rest.status !== 'estimated') throw new Error('estimated');
    expect(rest.kcal).toBeGreaterThanOrEqual(0);
  });
});

describe('falling back without heart rate', () => {
  const r = workoutEnergy({ ...base, avgHeartRate: null });

  it('still estimates from time and weight', () => {
    if (r.status !== 'estimated') throw new Error('expected an estimate');
    expect(r.kcal).toBeGreaterThan(0);
  });

  it('names what it did not have', () => {
    if (r.status !== 'estimated') throw new Error('expected an estimate');
    expect(r.caveat).toMatch(/heart rate/);
    expect(r.caveat).toMatch(/does not know how hard/);
  });

  it('errs low rather than high', () => {
    // Overstating a burn is what costs someone their deficit.
    const withHr = workoutEnergy(base);
    if (r.status !== 'estimated' || withHr.status !== 'estimated') throw new Error('estimated');
    expect(r.kcal).toBeLessThan(withHr.kcal);
  });
});

describe('refusing to guess', () => {
  it('says what is missing rather than returning a number', () => {
    const noWeight = workoutEnergy({ ...base, weightKg: null });
    expect(noWeight.status).toBe('unknown');
    if (noWeight.status !== 'unknown') return;
    expect(noWeight.missing).toContain('body weight');
  });

  it('refuses a session with no duration', () => {
    const r = workoutEnergy({ ...base, durationMinutes: 0 });
    expect(r.status).toBe('unknown');
    if (r.status !== 'unknown') return;
    expect(r.missing).toContain('workout duration');
  });
});
