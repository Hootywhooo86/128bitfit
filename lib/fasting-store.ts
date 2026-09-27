/**
 * The running fast, shared by the Fuel card and the fasting screen.
 *
 * One module-level copy for the same reason as the health store: two mounts
 * with their own state would let the card say "fasting" after the screen
 * ended it.
 *
 * Persisted in the settings table, so a fast survives the app being killed —
 * the timer is a start time, not a ticking counter.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getSetting, setSetting } from '@/db/settings-queries';
import { parseFast, serializeFast, type Fast } from './fasting';

const KEY = 'fast';
const CHANNEL_ID = 'fasting';
const NOTIFICATION_ID = 'bitfit-fast-complete';

type State = { loaded: boolean; fast: Fast | null };

let state: State = { loaded: false, fast: null };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function publish(next: State) {
  state = next;
  for (const l of [...listeners]) l();
}

function load(): Promise<void> {
  if (!loading) {
    loading = getSetting(KEY)
      .then((raw) => publish({ loaded: true, fast: parseFast(raw) }))
      .catch(() => publish({ loaded: true, fast: null }));
  }
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getState = () => state;

export function useFast(): State {
  const s = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    void load();
  }, []);
  return s;
}

/**
 * Starts a fast. Returns a sentence when the reminder could not be scheduled,
 * so the screen can say the timer runs but will not buzz.
 */
export async function startFast(hours: number, now = Date.now()): Promise<string | null> {
  const fast: Fast = { startedAt: now, hours };
  await setSetting(KEY, serializeFast(fast));
  publish({ loaded: true, fast });
  return scheduleComplete(fast);
}

export async function endFast(): Promise<void> {
  await setSetting(KEY, '');
  publish({ loaded: true, fast: null });
  await cancelComplete();
}

async function scheduleComplete(fast: Fast): Promise<string | null> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  try {
    await cancelComplete();
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      return 'Notifications are off, so there will be no alert when the window ends. The timer still runs.';
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Fasting timer',
        description: 'Tells you when your fasting window is done',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }
    const seconds = Math.max(1, Math.round((fast.startedAt + fast.hours * 3_600_000 - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: { title: 'Fasting window done', body: `${fast.hours} hours complete.`, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: CHANNEL_ID,
      },
    });
    return null;
  } catch (e) {
    return `Could not schedule the end-of-window alert: ${e instanceof Error ? e.message : String(e)}. The timer still runs.`;
  }
}

async function cancelComplete(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
  } catch {
    // Nothing scheduled.
  }
}
