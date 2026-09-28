import { describe, expect, it } from 'vitest';
import { sportById } from './cardio';
import { cardioEnergy, type CardioEnergyInput } from './cardio-energy';

const base = (over: Partial<CardioEnergyInput> = {}): CardioEnergyInput => ({
  sport: sportById('walk'),
  movingS: 3600,
  distanceM: 5000,
  climbM: 0,
  avgHeartRate: null,
  measuredKcal: null,
  weightKg: 70,
  age: null,
  sex: null,
  ...over,
});

describe('cardio energy', () => {
  it('uses a measured figure as-is and says so', () => {
    expect(cardioEnergy(base({ measuredKcal: 312.6 }))).toEqual({
      status: 'measured',
      kcal: 313,
      source: 'Health Connect',
    });
  });

  it('gives no number without body weight, and says what is missing', () => {
    expect(cardioEnergy(base({ weightKg: null }))).toEqual({ status: 'unknown', missing: ['your body weight'] });
    expect(cardioEnergy(base({ movingS: 0 }))).toEqual({ status: 'unknown', missing: ['a duration'] });
  });

  it('walking costs about half a kcal per kg per km, running about one', () => {
    // ACSM net: walking 0.1 ml/kg/m, running 0.2 ml/kg/m, × 5 kcal/L.
    expect(cardioEnergy(base()).status).toBe('estimated');
    expect(cardioEnergy(base())).toMatchObject({ kcal: 175 });
    expect(cardioEnergy(base({ sport: sportById('run'), distanceM: 10000 }))).toMatchObject({ kcal: 700 });
  });

  it('adds the cost of climbing', () => {
    const flat = cardioEnergy(base({ sport: sportById('hike') }));
    const hilly = cardioEnergy(base({ sport: sportById('hike'), climbM: 300 }));
    // 1.8 ml/kg per metre climbed walking: 300 m × 70 kg → 189 kcal more.
    expect(hilly.status === 'estimated' && flat.status === 'estimated' && hilly.kcal - flat.kcal).toBe(189);
  });

  it('treats a fast treadmill session as running', () => {
    const r = cardioEnergy(base({ sport: sportById('treadmill'), movingS: 1800, distanceM: 5000 }));
    expect(r).toMatchObject({ status: 'estimated', kcal: 350 });
    expect(r.status === 'estimated' && r.basis).toMatch(/^Running/);
  });

  it('needs a distance on foot rather than guessing a speed', () => {
    expect(cardioEnergy(base({ sport: sportById('treadmill'), distanceM: null }))).toEqual({
      status: 'unknown',
      missing: ['a distance'],
    });
  });

  it('prices cycling by speed', () => {
    // 20 km/h is 8 METs: (8 − 1) × 3.5 × 70 / 200 × 60 = 514.5
    const r = cardioEnergy(base({ sport: sportById('ride'), distanceM: 20000 }));
    expect(r).toMatchObject({ status: 'estimated', kcal: 515 });
    expect(r.status === 'estimated' && r.basis).toContain('20.0 km/h');
  });

  it('uses a fixed figure where speed says little', () => {
    expect(cardioEnergy(base({ sport: sportById('indoor_ride'), distanceM: null }))).toMatchObject({
      status: 'estimated',
      kcal: Math.round(5.8 * 3.5 * 70 / 200 * 60),
    });
  });

  it('prefers heart rate when it has it, net of resting', () => {
    const r = cardioEnergy(base({ avgHeartRate: 130, age: 35, sex: 'male' }));
    expect(r.status).toBe('estimated');
    expect(r.status === 'estimated' && r.basis).toContain('130 bpm');
    // Keytel male at 130 bpm, 70 kg, 35 y: 47.9 kJ/min = 11.45 kcal/min gross,
    // less 1.225 kcal/min resting, for 60 min.
    expect(r.status === 'estimated' && r.kcal).toBe(613);
  });

  it('never goes negative', () => {
    const r = cardioEnergy(base({ avgHeartRate: 60, age: 20, sex: 'female', weightKg: 120 }));
    expect(r.status === 'estimated' && r.kcal).toBe(0);
  });
});
