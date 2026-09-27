import { getSetting, setSetting } from './settings-queries';

/**
 * Rest-timer preferences, from the prototype's `train:timer` page.
 *
 * The default length is what an exercise gets when nothing more specific set
 * one: added mid-workout, or a new row in the builder. A routine's own rest
 * always wins.
 */
export type RestPrefs = {
  defaultSeconds: number;
  sound: boolean;
  vibrate: boolean;
  /** Schedule the OS notification, so it fires with the phone locked. */
  lockScreen: boolean;
};

export const REST_DEFAULT_SECONDS = 60;
export const REST_MIN_SECONDS = 15;
export const REST_MAX_SECONDS = 600;

const KEYS = {
  defaultSeconds: 'rest_default_seconds',
  sound: 'rest_sound',
  vibrate: 'rest_vibrate',
  lockScreen: 'rest_lock_screen',
} as const;

export function clampRest(seconds: number): number {
  if (!Number.isFinite(seconds)) return REST_DEFAULT_SECONDS;
  const stepped = Math.round(seconds / 15) * 15;
  return Math.min(REST_MAX_SECONDS, Math.max(REST_MIN_SECONDS, stepped));
}

export async function getRestPrefs(): Promise<RestPrefs> {
  const [secs, sound, vibrate, lock] = await Promise.all([
    getSetting(KEYS.defaultSeconds),
    getSetting(KEYS.sound),
    getSetting(KEYS.vibrate),
    getSetting(KEYS.lockScreen),
  ]);
  return {
    defaultSeconds: secs == null ? REST_DEFAULT_SECONDS : clampRest(Number(secs)),
    sound: sound !== '0',
    vibrate: vibrate !== '0',
    lockScreen: lock !== '0',
  };
}

export async function getDefaultRestSeconds(): Promise<number> {
  return (await getRestPrefs()).defaultSeconds;
}

export async function updateRestPrefs(patch: Partial<RestPrefs>): Promise<RestPrefs> {
  if (patch.defaultSeconds != null) await setSetting(KEYS.defaultSeconds, String(clampRest(patch.defaultSeconds)));
  if (patch.sound != null) await setSetting(KEYS.sound, patch.sound ? '1' : '0');
  if (patch.vibrate != null) await setSetting(KEYS.vibrate, patch.vibrate ? '1' : '0');
  if (patch.lockScreen != null) await setSetting(KEYS.lockScreen, patch.lockScreen ? '1' : '0');
  return getRestPrefs();
}
