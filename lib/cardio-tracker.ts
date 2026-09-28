/**
 * GPS recording that keeps going with the screen off.
 *
 * The phone's location service delivers fixes to a TaskManager task through
 * an Android foreground service — the "Recording your walk" notification — so
 * a pocketed phone keeps recording. A JS timer or a screen-bound watcher would
 * stop the moment the screen did, the same reason the rest timer is an OS
 * notification rather than a setTimeout.
 *
 * The task writes straight into SQLite. The record screen reads the track back
 * from there, so the screen, the notification and an app restart all agree on
 * one source of truth.
 *
 * Only "while using the app" location is asked for. A foreground service
 * started from the open app keeps that access with the screen off, so the
 * "Allow all the time" prompt, and the trip to system settings it means on
 * Android 11+, is not needed.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { recordFixes } from '@/db/cardio-queries';

export const CARDIO_TASK = 'bitfit-cardio-location';

type TaskData = { locations?: Location.LocationObject[] };

// Must run at import time, before any fix arrives: app/_layout.tsx imports
// this module so the task exists whenever the JS runtime does.
if (!TaskManager.isTaskDefined(CARDIO_TASK)) {
  TaskManager.defineTask<TaskData>(CARDIO_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    try {
      await recordFixes(
        data.locations.map((l) => ({
          t: l.timestamp,
          lat: l.coords.latitude,
          lon: l.coords.longitude,
          alt: l.coords.altitude ?? null,
          accuracy: l.coords.accuracy ?? null,
          speed: l.coords.speed ?? null,
        }))
      );
    } catch {
      // A failed write loses these few fixes; the next batch still records.
      // There is no screen to tell from inside a background task.
    }
  });
}

export type LocationAccess = 'granted' | 'denied' | 'off';

/** Asks for location if it has not been decided yet. */
export async function ensureLocationAccess(): Promise<LocationAccess> {
  if (!(await Location.hasServicesEnabledAsync())) return 'off';
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

export async function startTracking(sportLabel: string): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(CARDIO_TASK)) return;
  await Location.startLocationUpdatesAsync(CARDIO_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    // Deliver promptly: batching would make the live trail lag.
    deferredUpdatesInterval: 0,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: `Recording your ${sportLabel.toLowerCase()}`,
      notificationBody: 'Open 128BIT FIT to pause or finish.',
      notificationColor: '#000000',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(CARDIO_TASK)) {
      await Location.stopLocationUpdatesAsync(CARDIO_TASK);
    }
  } catch {
    // Already stopped, or the task never registered: either way it is off.
  }
}
