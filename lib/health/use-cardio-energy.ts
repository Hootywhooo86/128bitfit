/**
 * Active calories for a finished cardio session, for its summary screen.
 *
 * Reads Health Connect for the session's own window — a measured figure or a
 * heart rate from a watch — and the newest weigh-in, then hands them to
 * lib/cardio-energy.ts. A typed-in session's window is a guess (it ends when
 * it was saved), so it never borrows readings from it.
 */
import { useEffect, useState } from 'react';
import { getAppSettings } from '@/db/settings-queries';
import { getLatestWeightEntry, weightInKg } from '@/db/weight-queries';
import { ageFromBirthday } from '../body';
import type { Sport } from '../cardio';
import { cardioEnergy } from '../cardio-energy';
import type { EnergyResult } from '../workout-energy';
import { latestWeight } from '../weight-source';
import { healthWeight } from './use-weight';
import { health } from './index';

const NO_READINGS = { heartRateAvg: null, heartRateMax: null, activeCalories: null };

export function useCardioEnergy(
  input: {
    sport: Sport;
    startedAt: number;
    endedAt: number | null;
    manual: boolean;
    movingS: number | null;
    distanceM: number | null;
    climbM: number | null;
  } | null
): EnergyResult | null {
  const [energy, setEnergy] = useState<EnergyResult | null>(null);

  useEffect(() => {
    if (!input) return;
    let alive = true;
    (async () => {
      const [settings, localWeight, scaleWeight, readings] = await Promise.all([
        getAppSettings(),
        getLatestWeightEntry(),
        healthWeight(),
        // Typed-in sessions too: a watch worn on the treadmill measured it.
        !input.endedAt
          ? Promise.resolve(NO_READINGS)
          : health.readWindow(input.startedAt, input.endedAt).catch(() => NO_READINGS),
      ]);
      const merged = latestWeight(
        localWeight?.loggedAt
          ? { kg: weightInKg(localWeight), at: new Date(localWeight.loggedAt).getTime() }
          : null,
        scaleWeight
      );
      const result = cardioEnergy({
        sport: input.sport,
        movingS: input.movingS,
        distanceM: input.distanceM,
        climbM: input.climbM,
        avgHeartRate: readings.heartRateAvg,
        measuredKcal: readings.activeCalories,
        weightKg: merged.status === 'have' ? merged.kg : null,
        age: ageFromBirthday(settings.birthday),
        sex: settings.sex,
      });
      if (alive) setEnergy(result);
    })().catch(() => {
      if (alive) setEnergy({ status: 'unknown', missing: ['health data'] });
    });
    return () => {
      alive = false;
    };
    // Keyed on the values, so a re-render does not re-read.
  }, [input?.sport.id, input?.startedAt, input?.endedAt, input?.manual, input?.movingS, input?.distanceM, input?.climbM]); // eslint-disable-line react-hooks/exhaustive-deps

  return energy;
}
