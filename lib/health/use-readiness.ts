/**
 * Today's readiness and rest, from Health Connect.
 *
 * Reads the last eight days so the resting heart rate has a baseline to be
 * compared against — an absolute bpm says nothing without knowing whose heart
 * it is. With no history there is no baseline, and readiness says so rather
 * than inventing one.
 */
import { useCallback, useEffect, useState } from 'react';
import { readiness, restQuality, type Readiness, type RestQuality } from '../readiness';
import { dayKey } from './dates';
import { health } from './index';
import { useHealthRefresh } from './use-health-refresh';

export type ReadinessState =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'denied'; missing: string[] }
  | { status: 'ready'; readiness: Readiness; rest: RestQuality };

const BASELINE_DAYS = 8;

export function useReadiness(recentSets: number | null) {
  const [state, setState] = useState<ReadinessState>({ status: 'checking' });

  const refresh = useCallback(async () => {
    if ((await health.getAvailability()) !== 'available') {
      return setState({ status: 'unavailable' });
    }
    const grants = await health.getGrants();
    const missing: string[] = [];
    if (!grants.read.includes('sleep')) missing.push('sleep');
    if (!grants.read.includes('restingHeartRate')) missing.push('resting heart rate');
    if (!grants.read.includes('sleep')) {
      // Sleep is the one term readiness cannot do without.
      return setState({ status: 'denied', missing });
    }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (BASELINE_DAYS - 1));
    const days = await health.readDays(dayKey(start), dayKey(end));
    if (days.length === 0) return setState({ status: 'denied', missing });

    const todayReading = days[days.length - 1];
    const earlier = days.slice(0, -1);

    // The baseline is the user's own average over the previous days. Days with
    // no reading are left out rather than counted as zero.
    const priorHr = earlier.map((d) => d.restingHeartRate).filter((v): v is number => v != null);
    const baselineRestingHr =
      priorHr.length >= 3 ? priorHr.reduce((a, b) => a + b, 0) / priorHr.length : null;

    setState({
      status: 'ready',
      readiness: readiness({
        sleepMinutes: todayReading.sleepMinutes,
        restingHr: todayReading.restingHeartRate,
        baselineRestingHr,
        recentSets,
      }),
      rest: restQuality(todayReading.sleepMinutes),
    });
  }, [recentSets]);

  useEffect(() => {
    let alive = true;
    refresh().catch(() => {
      // A failed read is not a score of zero.
      if (alive) setState({ status: 'denied', missing: ['sleep'] });
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  // Last night's sleep lands in Health Connect while the app is closed, and a
  // pull to refresh has to reach this card too.
  useHealthRefresh(() => {
    refresh().catch(() => {
      /* Already handled on mount; a failed resume keeps the last reading. */
    });
  });

  return { state, refresh };
}
