/**
 * What a finished session cost, for the summary screen.
 *
 * Pulls heart rate and any measured energy for the session's exact window —
 * not the day, which would be diluted by every hour the user was not training
 * — and hands them to lib/workout-energy.ts along with the body figures the
 * equations need.
 *
 * The status the result carries is the point: 'measured' came off a device,
 * 'estimated' is arithmetic, and the card renders them differently. A figure
 * that does not know which it is must not be shown at all.
 */
import { useEffect, useState } from 'react';
import { getAppSettings } from '@/db/settings-queries';
import { getLatestWeightEntry, weightInKg } from '@/db/weight-queries';
import { ageFromBirthday } from '../body';
import { workoutEnergy, type EnergyResult } from '../workout-energy';
import { latestWeight } from '../weight-source';
import { healthWeight } from './use-weight';
import { health } from './index';

export function useWorkoutEnergy(window: { startedAt: number; endedAt: number } | null) {
  const [energy, setEnergy] = useState<EnergyResult | null>(null);

  useEffect(() => {
    if (!window) return;
    let alive = true;
    (async () => {
      const [settings, localWeight, scaleWeight, readings] = await Promise.all([
        getAppSettings(),
        getLatestWeightEntry(),
        healthWeight(),
        health.readWindow(window.startedAt, window.endedAt).catch(() => ({
          heartRateAvg: null,
          heartRateMax: null,
          activeCalories: null,
        })),
      ]);

      // Whichever weigh-in is newer, typed or from a scale — the equations
      // only need a current figure in kilograms, not one the user entered.
      const merged = latestWeight(
        localWeight?.loggedAt
          ? { kg: weightInKg(localWeight), at: new Date(localWeight.loggedAt).getTime() }
          : null,
        scaleWeight
      );
      const kg = merged.status === 'have' ? merged.kg : null;

      const result = workoutEnergy({
        durationMinutes: (window.endedAt - window.startedAt) / 60000,
        avgHeartRate: readings.heartRateAvg,
        measuredKcal: readings.activeCalories,
        weightKg: kg,
        age: ageFromBirthday(settings.birthday),
        sex: settings.sex,
      });
      if (alive) setEnergy(result);
    })().catch(() => {
      // No figure is the honest outcome when the read failed.
      if (alive) setEnergy({ status: 'unknown', missing: ['health data'] });
    });
    return () => {
      alive = false;
    };
    // Keyed on the instants, not the object, so a re-render does not re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window?.startedAt, window?.endedAt]);

  return energy;
}
