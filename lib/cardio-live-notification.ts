/**
 * Distance, time and pace on the lock screen while recording.
 *
 * Its own quiet notification, updated from the location task as fixes come
 * in. The recording notification itself belongs to the location service and
 * can only be changed by restarting that service, which would risk a gap in
 * the track — not worth it for a nicer lock screen.
 *
 * Every figure comes from the same fixes and the same maths as the record
 * screen, so the two always agree.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { elapsedMs, getCardioFixes, getOpenCardioSession } from '@/db/cardio-queries';
import { getCardioSettings } from '@/db/map-settings';
import { cardioStats, formatDistance, formatDuration, formatPace, formatSpeed, sportById } from './cardio';

const CHANNEL_ID = 'cardio_live';
const NOTIFICATION_ID = 'bitfit-cardio-live';
/** Often enough to be current when you glance, rarely enough not to cost battery. */
const EVERY_MS = 15_000;

let lastPost = 0;
let channelReady = false;

export async function postLiveCardioStats(now = Date.now()): Promise<void> {
  if (Platform.OS !== 'android' || now - lastPost < EVERY_MS) return;
  lastPost = now;
  // Never asks from here: this runs with the screen off. Recording already
  // needed notifications for the location service's own one.
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const open = await getOpenCardioSession();
  if (!open) {
    await clearLiveCardioStats();
    return;
  }
  const sport = sportById(open.sport);
  const cfg = await getCardioSettings();
  const unit = cfg.distanceUnit;
  const stats = cardioStats(await getCardioFixes(open.id), sport, { autoPause: cfg.autoPause, unit });

  if (!channelReady) {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Cardio: live stats',
      description: 'Distance, time and pace while a walk, run or ride is recording',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      vibrationPattern: null,
      showBadge: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    channelReady = true;
  }

  const avg = sport.showSpeed
    ? `${formatSpeed(stats.avgSpeed, unit)} ${unit === 'mi' ? 'mph' : 'km/h'} avg`
    : `${formatPace(stats.avgPace)} /${unit} avg`;
  const parts = [
    `${formatDistance(stats.distanceM, unit)} ${unit}`,
    formatDuration(Math.round(elapsedMs(open, now) / 1000)),
    avg,
  ];
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: open.status === 'paused' ? `${sport.label} · paused` : sport.label,
      body: parts.join(' · '),
      sound: false,
      sticky: true,
      autoDismiss: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      data: { type: 'cardio_live' },
    },
    trigger: { channelId: CHANNEL_ID },
  });
}

export async function clearLiveCardioStats(): Promise<void> {
  lastPost = 0;
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    // Nothing showing.
  }
}
