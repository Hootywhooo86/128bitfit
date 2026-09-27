/**
 * OS local notifications for rest timer.
 *
 * - Schedules a one-shot notification at rest end (works when screen locked / app backgrounded).
 * - Android: dedicated high-importance channel with sound + vibration.
 * - iOS/Android: category actions +15 / Skip on the rest-complete notification.
 *
 * Platform notes:
 * - iOS silent/Focus mode may suppress sound; vibration follows system settings.
 * - Notification action buttons appear when the rest-end notification is delivered
 *   (long-press / expand), not during the countdown itself.
 * - Web: no-op (caller keeps JS-only timer).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getRestPrefs } from '@/db/rest-settings';

export const REST_CHANNEL_ID = 'rest_timer';

/**
 * One channel per sound/vibration combination. Android fixes a channel's sound
 * and vibration when it is created, so a preference change has to move to a
 * different channel — reconfiguring the existing one does nothing.
 */
export function restChannelFor(sound: boolean, vibrate: boolean): string {
  if (sound && vibrate) return REST_CHANNEL_ID;
  if (sound) return 'rest_timer_sound';
  if (vibrate) return 'rest_timer_vibrate';
  return 'rest_timer_silent';
}
export const REST_CATEGORY_ID = 'rest_timer';
export const REST_ACTION_ADD_15 = 'rest_add_15';
export const REST_ACTION_SKIP = 'rest_skip';
export const REST_DATA_TYPE = 'rest_timer';

/** Stable id so we cancel/replace rather than stacking rest alerts. */
export const REST_NOTIFICATION_ID = 'bitfit-rest-timer';

export type RestNotificationData = {
  type: typeof REST_DATA_TYPE;
  sessionId?: string | null;
  sessionExerciseId?: string | null;
  endsAt: number;
};

let setupDone = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function notificationsSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function ensureRestNotificationSetup(): Promise<void> {
  if (!notificationsSupported() || setupDone) return;

  if (Platform.OS === 'android') {
    for (const [sound, vibrate, name] of [
      [true, true, 'Rest timer'],
      [true, false, 'Rest timer (sound only)'],
      [false, true, 'Rest timer (vibrate only)'],
      [false, false, 'Rest timer (silent)'],
    ] as const) {
      await Notifications.setNotificationChannelAsync(restChannelFor(sound, vibrate), {
        name,
        description: 'Alerts when your rest between sets is over',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: vibrate ? [0, 250, 150, 250] : null,
        enableVibrate: vibrate,
        sound: sound ? 'default' : null,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
  }

  // Category IDs must not contain `:` or `-` (expo-notifications).
  await Notifications.setNotificationCategoryAsync(REST_CATEGORY_ID, [
    {
      identifier: REST_ACTION_ADD_15,
      buttonTitle: '+15s',
      options: { opensAppToForeground: true },
    },
    {
      identifier: REST_ACTION_SKIP,
      buttonTitle: 'Skip',
      options: {
        opensAppToForeground: true,
        isDestructive: true,
      },
    },
  ]);

  setupDone = true;
}

export type PermissionOutcome = 'granted' | 'denied' | 'undetermined';

export async function getRestNotificationPermission(): Promise<PermissionOutcome> {
  if (!notificationsSupported()) return 'denied';
  const settings = await Notifications.getPermissionsAsync();
  if (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }
  if (settings.status === Notifications.PermissionStatus.DENIED || !settings.canAskAgain) {
    return 'denied';
  }
  return 'undetermined';
}

export async function requestRestNotificationPermission(): Promise<PermissionOutcome> {
  if (!notificationsSupported()) return 'denied';
  await ensureRestNotificationSetup();
  const settings = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  if (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }
  if (settings.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function scheduleRestEndNotification(
  endsAt: number,
  meta?: { sessionId?: string | null; sessionExerciseId?: string | null }
): Promise<string | null> {
  if (!notificationsSupported()) return null;
  await ensureRestNotificationSetup();

  const prefs = await getRestPrefs().catch(() => null);
  if (prefs && !prefs.lockScreen) {
    // The in-app countdown still runs; the user asked for no OS alert.
    await cancelRestNotification();
    return null;
  }
  const sound = prefs?.sound ?? true;
  const vibrate = prefs?.vibrate ?? true;

  const remainingMs = endsAt - Date.now();
  if (remainingMs < 500) {
    // Too soon to schedule; caller still has in-app path.
    return null;
  }

  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const data: RestNotificationData = {
    type: REST_DATA_TYPE,
    sessionId: meta?.sessionId ?? null,
    sessionExerciseId: meta?.sessionExerciseId ?? null,
    endsAt,
  };

  // Cancel any prior rest notification first.
  await cancelRestNotification();

  const id = await Notifications.scheduleNotificationAsync({
    identifier: REST_NOTIFICATION_ID,
    content: {
      title: 'Rest over',
      body: 'Time for your next set.',
      sound: sound ? 'default' : false,
      categoryIdentifier: REST_CATEGORY_ID,
      data,
      ...(Platform.OS === 'android'
        ? {
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ...(vibrate ? { vibrate: [0, 250, 150, 250] } : {}),
            color: '#ffffff',
          }
        : {
            interruptionLevel: 'timeSensitive' as const,
          }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: restChannelFor(sound, vibrate),
    },
  });

  return id;
}

export async function cancelRestNotification(_id?: string | null): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID);
  } catch {
    // ignore missing
  }
  try {
    await Notifications.dismissNotificationAsync(REST_NOTIFICATION_ID);
  } catch {
    // ignore missing
  }
}

export function isRestNotification(
  notification: Notifications.Notification
): notification is Notifications.Notification & {
  request: { content: { data: RestNotificationData } };
} {
  const data = notification.request.content.data as Partial<RestNotificationData> | undefined;
  return data?.type === REST_DATA_TYPE;
}

export async function findScheduledRestEndsAt(): Promise<{
  endsAt: number;
  sessionId: string | null;
  sessionExerciseId: string | null;
} | null> {
  if (!notificationsSupported()) return null;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const req of all) {
    const data = req.content.data as Partial<RestNotificationData> | undefined;
    if (data?.type !== REST_DATA_TYPE) continue;
    if (typeof data.endsAt === 'number' && data.endsAt > Date.now()) {
      return {
        endsAt: data.endsAt,
        sessionId: data.sessionId ?? null,
        sessionExerciseId: data.sessionExerciseId ?? null,
      };
    }
  }
  return null;
}
