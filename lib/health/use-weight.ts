/**
 * The latest weigh-in, from wherever it actually came from.
 *
 * Reads the last fortnight from Health Connect so a reading from a smart scale
 * shows up without the user re-typing it, and merges it with the app's own
 * entries. See lib/weight-source.ts for why both are read.
 *
 * "Not read yet" is a state of its own: until the answer is in, the caller
 * renders nothing rather than the empty prompt, so a user who has a weight on
 * file never gets a flash of "log your first weigh-in".
 */
import { useCallback, useEffect, useState } from 'react';
import { latestWeight, type LatestWeight, type WeightReading } from '../weight-source';
import { dayKey } from './dates';
import { health } from './index';
import { useAppResume } from './use-app-resume';

/** Far enough back to catch a scale used weekly, short enough to stay cheap. */
const LOOKBACK_DAYS = 14;

export type LatestWeightState = { status: 'checking' } | LatestWeight;

/**
 * Reads Health Connect's most recent weight, or null when there is none to be
 * had — not granted, not available, nothing recorded. All three mean the same
 * thing here: no reading was taken.
 */
export async function healthWeight(): Promise<WeightReading | null> {
  try {
    if ((await health.getAvailability()) !== 'available') return null;
    const grants = await health.getGrants();
    if (!grants.read.includes('weight')) return null;

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (LOOKBACK_DAYS - 1));
    const days = await health.readDays(dayKey(start), dayKey(end));

    // Walk backwards to the most recent day that actually has a figure.
    for (let i = days.length - 1; i >= 0; i -= 1) {
      const kg = days[i].weightKg;
      if (kg != null && kg > 0) {
        // readDays keeps the latest reading of the day but not its clock time;
        // the end of that local day is the closest honest stamp, and it is only
        // ever compared against other weigh-ins.
        const [y, m, d] = days[i].date.split('-').map(Number);
        return { kg, at: new Date(y, m - 1, d, 23, 59, 59).getTime() };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** `local` is the app's own newest entry, or null if there is none. */
export function useLatestWeight(local: WeightReading | null) {
  const [state, setState] = useState<LatestWeightState>({ status: 'checking' });

  const refresh = useCallback(async () => {
    setState(latestWeight(local, await healthWeight()));
  }, [local]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const fromHealth = await healthWeight();
      // A local entry alone is still an answer, so this never stays on
      // "checking" because Health Connect was slow or absent.
      if (alive) setState(latestWeight(local, fromHealth));
    })();
    return () => {
      alive = false;
    };
  }, [local]);

  // A scale pushes its reading while the app is backgrounded; without this the
  // weigh-in does not appear until the screen is mounted again.
  useAppResume(() => void refresh());

  return { state, refresh };
}
