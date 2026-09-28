/**
 * Active calories for a cardio session.
 *
 * In order of honesty, the same ladder as lib/workout-energy.ts:
 *
 *   1. Health Connect's ActiveCaloriesBurned for the session window: a watch
 *      or the phone measured it, so it is shown as measured.
 *   2. Heart rate (Keytel et al. 2005). Built for steady aerobic work, which
 *      is exactly what a walk, run or ride is — unlike lifting.
 *   3. The work done: ACSM metabolic equations for walking and running
 *      (distance and climb), Compendium METs by speed for cycling.
 *   4. Nothing, and a note saying what is missing.
 *
 * Everything is ACTIVE calories — above what the body burns at rest — so it
 * lines up with Health Connect's own figure and is never double-counted
 * against the resting part of TDEE. Estimates carry their basis and a caveat;
 * the screen shows them as estimates.
 *
 * Pure: numbers in, a result out.
 */
import type { SexOption } from './body';
import type { Sport } from './cardio';
import type { EnergyResult } from './workout-energy';

export type CardioEnergyInput = {
  sport: Sport;
  movingS: number | null;
  distanceM: number | null;
  climbM: number | null;
  avgHeartRate: number | null;
  measuredKcal: number | null;
  weightKg: number | null;
  age: number | null;
  sex: SexOption | null;
};

/** Oxygen → energy: about 5 kcal per litre of O2 on a mixed diet. */
const KCAL_PER_L_O2 = 5;

/** What resting costs, per kg per minute (1 MET = 3.5 ml O2/kg/min). */
const REST_KCAL_PER_KG_MIN = (3.5 / 1000) * KCAL_PER_L_O2;

/** ACSM: net O2 (ml/kg) per metre moved and per metre climbed. */
const ACSM = {
  walk: { horizontal: 0.1, vertical: 1.8 },
  run: { horizontal: 0.2, vertical: 0.9 },
};

/** Above ~8 km/h (134 m/min) a person is running whatever the sport says. */
const RUN_FROM_M_PER_MIN = 134;

/** Compendium of Physical Activities (2011), bicycling by speed. */
function cyclingMets(kmh: number): number {
  if (kmh < 16.1) return 4.0;
  if (kmh < 19.3) return 6.8;
  if (kmh < 22.5) return 8.0;
  if (kmh < 25.7) return 10.0;
  if (kmh < 30.6) return 12.0;
  return 15.8;
}

/** Fixed METs where speed says little. */
const FLAT_METS: Partial<Record<Sport['id'], { mets: number; label: string }>> = {
  mtb: { mets: 8.5, label: 'mountain biking, general' },
  ebike: { mets: 4.0, label: 'e-bike riding, where the motor does part of the work' },
  indoor_ride: { mets: 6.8, label: 'stationary cycling at moderate effort' },
  wheelchair: { mets: 3.8, label: 'wheelchair propulsion, moderate' },
};

function keytelKcalPerMin(hr: number, weightKg: number, age: number, male: boolean): number {
  const kjPerMin = male
    ? -55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age
    : -20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age;
  return Math.max(0, kjPerMin) / 4.184;
}

export function cardioEnergy(input: CardioEnergyInput): EnergyResult {
  if (input.measuredKcal != null && input.measuredKcal > 0) {
    return { status: 'measured', kcal: Math.round(input.measuredKcal), source: 'Health Connect' };
  }
  const minutes = (input.movingS ?? 0) / 60;
  if (!(minutes > 0)) return { status: 'unknown', missing: ['a duration'] };
  if (input.weightKg == null) return { status: 'unknown', missing: ['your body weight'] };
  const kg = input.weightKg;
  const rest = REST_KCAL_PER_KG_MIN * kg * minutes;

  if (input.avgHeartRate != null && input.age != null && input.sex != null && input.sex !== 'prefer_not') {
    const gross = keytelKcalPerMin(input.avgHeartRate, kg, input.age, input.sex === 'male') * minutes;
    return {
      status: 'estimated',
      kcal: Math.max(0, Math.round(gross - rest)),
      basis: `${Math.round(minutes)} min at ${Math.round(input.avgHeartRate)} bpm average`,
      caveat: 'From heart rate, which tracks effort well on steady cardio but varies with heat, caffeine and fitness.',
    };
  }

  const { sport } = input;
  const dist = input.distanceM != null && input.distanceM > 0 ? input.distanceM : null;
  const climb = Math.max(0, input.climbM ?? 0);

  if (sport.group === 'cycle' || sport.id === 'indoor_ride' || sport.id === 'wheelchair') {
    const flat = FLAT_METS[sport.id];
    let mets: number;
    let what: string;
    if (flat) {
      mets = flat.mets;
      what = flat.label;
    } else if (dist) {
      const kmh = dist / 1000 / (minutes / 60);
      mets = cyclingMets(kmh);
      what = `cycling at ${kmh.toFixed(1)} km/h`;
    } else {
      return { status: 'unknown', missing: ['a distance'] };
    }
    return {
      status: 'estimated',
      kcal: Math.round((mets - 1) * REST_KCAL_PER_KG_MIN * kg * minutes),
      basis: `${Math.round(minutes)} min of ${what} (${mets} METs) at ${Math.round(kg)} kg`,
      caveat: 'A typical figure for that activity; wind, hills and effort move it a lot. A heart-rate reading would be closer.',
    };
  }

  // On foot: the work done moving your weight that far and that high.
  if (!dist) return { status: 'unknown', missing: ['a distance'] };
  const mPerMin = dist / minutes;
  const running = sport.id === 'run' || sport.id === 'trail_run' || mPerMin >= RUN_FROM_M_PER_MIN;
  const eq = running ? ACSM.run : ACSM.walk;
  const o2MlPerKg = eq.horizontal * dist + eq.vertical * climb;
  const kcal = Math.round((o2MlPerKg * kg * KCAL_PER_L_O2) / 1000);
  const km = (dist / 1000).toFixed(2);
  return {
    status: 'estimated',
    kcal,
    basis: `${running ? 'Running' : 'Walking'} ${km} km${climb >= 1 ? ` with ${Math.round(climb)} m of climb` : ''} at ${Math.round(kg)} kg`,
    caveat: `ACSM ${running ? 'running' : 'walking'} equation: good for steady effort on firm ground, low on sand, snow or rough trail.`,
  };
}
