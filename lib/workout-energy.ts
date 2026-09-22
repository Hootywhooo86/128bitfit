/**
 * Energy burned in a session.
 *
 * Two sources, in order of honesty:
 *
 *   1. Health Connect's own ActiveCaloriesBurned for the session window. That
 *      is a *measurement* from the watch or phone and is used as-is.
 *   2. Failing that, an estimate from duration and average heart rate, clearly
 *      labelled as one.
 *
 * The distinction is the whole point. A measured figure and a guess must never
 * be shown the same way — CLAUDE.md forbids it, and a number presented as
 * measured is what got the original prototype thrown away.
 *
 * Pure: readings in, figure out.
 */
import type { SexOption } from './body';

export type EnergyResult =
  | { status: 'measured'; kcal: number; source: string }
  | { status: 'estimated'; kcal: number; basis: string; caveat: string }
  | { status: 'unknown'; missing: string[] };

export type EnergyInput = {
  durationMinutes: number;
  /** Mean heart rate across the session, if it was recorded. */
  avgHeartRate: number | null;
  /** From Health Connect for the same window, if granted and present. */
  measuredKcal: number | null;
  weightKg: number | null;
  age: number | null;
  sex: SexOption | null;
};

/**
 * Keytel et al. (2005), the standard heart-rate energy equations.
 *
 * kJ/min, converted to kcal. Validated on steady aerobic work, so it is a poor
 * fit for lifting — that is exactly why the result is labelled an estimate and
 * carries a caveat naming the limitation.
 */
function keytelKcalPerMin(hr: number, weightKg: number, age: number, male: boolean): number {
  const kjPerMin = male
    ? -55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age
    : -20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age;
  return Math.max(0, kjPerMin) / 4.184;
}

/**
 * Fallback when heart rate is missing: a MET figure for resistance training.
 *
 * The Compendium of Physical Activities puts general weight lifting around 3.5
 * METs and vigorous effort around 6. The lower figure is used, because
 * overstating what someone burned is the error that costs them a deficit.
 */
const RESISTANCE_METS = 3.5;

export function workoutEnergy(input: EnergyInput): EnergyResult {
  if (input.measuredKcal != null && input.measuredKcal > 0) {
    return {
      status: 'measured',
      kcal: Math.round(input.measuredKcal),
      source: 'Health Connect',
    };
  }

  const minutes = input.durationMinutes;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { status: 'unknown', missing: ['workout duration'] };
  }

  if (input.weightKg == null) {
    return { status: 'unknown', missing: ['body weight'] };
  }

  if (input.avgHeartRate != null && input.age != null && input.sex != null) {
    const male = input.sex === 'male';
    const perMin = keytelKcalPerMin(input.avgHeartRate, input.weightKg, input.age, male);
    const kcal = Math.round(perMin * minutes);
    return {
      status: 'estimated',
      kcal,
      basis: `${Math.round(minutes)} min at ${Math.round(input.avgHeartRate)} bpm average`,
      caveat:
        'Heart-rate energy equations are validated on steady cardio, so lifting — where the rate spikes and drops between sets — is outside what they were built for.',
    };
  }

  // No heart rate: fall back to METs, which only needs weight and time.
  const kcal = Math.round((RESISTANCE_METS * 3.5 * input.weightKg) / 200 * minutes);
  const missingBits: string[] = [];
  if (input.avgHeartRate == null) missingBits.push('heart rate');
  if (input.age == null) missingBits.push('age');
  if (input.sex == null) missingBits.push('sex');
  return {
    status: 'estimated',
    kcal,
    basis: `${Math.round(minutes)} min of resistance training at ${RESISTANCE_METS} METs`,
    caveat: `A rough figure from time and body weight only — no ${missingBits.join(
      ', '
    )} to work from. It does not know how hard you went.`,
  };
}
