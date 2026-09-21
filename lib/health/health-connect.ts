/**
 * Health Connect (Android) implementation of HealthProvider.
 *
 * Only lib/health/index.ts should import this; everything else goes through
 * the interface so the HealthKit implementation can slot in later.
 */
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';
import type { Permission } from 'react-native-health-connect';
import { dayKey, eachDay, endOfLocalDay, startOfLocalDay } from './dates';
import type {
  HealthAvailability,
  HealthDay,
  HealthPermissionState,
  HealthProvider,
  HealthWorkoutEntry,
} from './types';

/**
 * Least privilege: steps to show on Home, exercise writes to push finished
 * workouts back. Adding a record type here also means adding the matching
 * `android.permission.health.*` entry to app.json — the config plugin does not
 * declare permissions for you.
 */
const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'write', recordType: 'ExerciseSession' },
];

/** Health Connect's generic "other workout" type; we do not classify lifts further. */
const EXERCISE_TYPE_STRENGTH_TRAINING = 70;

let initialized = false;

/**
 * initialize() is cheap after the first success but not free, and it throws on
 * devices without a provider. Callers treat a throw as "unavailable".
 */
async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  initialized = await initialize();
  return initialized;
}

function hasAll(granted: { accessType: string; recordType: string }[]): boolean {
  return PERMISSIONS.every((want) =>
    granted.some(
      (g) => g.accessType === want.accessType && g.recordType === want.recordType
    )
  );
}

export const healthConnectProvider: HealthProvider = {
  name: 'Health Connect',

  async getAvailability(): Promise<HealthAvailability> {
    try {
      const status = await getSdkStatus();
      if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
      if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        return 'update_required';
      }
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  },

  async getPermissionState(): Promise<HealthPermissionState> {
    try {
      if (!(await ensureInitialized())) return 'denied';
      const granted = await getGrantedPermissions();
      return hasAll(granted as { accessType: string; recordType: string }[])
        ? 'granted'
        : 'denied';
    } catch {
      return 'unknown';
    }
  },

  async requestPermissions(): Promise<HealthPermissionState> {
    try {
      if (!(await ensureInitialized())) return 'denied';
      const granted = await requestPermission(PERMISSIONS);
      return hasAll(granted as { accessType: string; recordType: string }[])
        ? 'granted'
        : 'denied';
    } catch {
      return 'denied';
    }
  },

  async readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    const days = eachDay(startDate, endDate);
    if (days.length === 0) return [];

    // A failed read leaves every day null — "we did not get a reading" — rather
    // than reporting zero steps, which would be a lie.
    const blank: HealthDay[] = days.map((date) => ({ date, steps: null }));

    try {
      if (!(await ensureInitialized())) return blank;

      const { records } = await readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfLocalDay(startDate).toISOString(),
          endTime: endOfLocalDay(endDate).toISOString(),
        },
      });

      // The query succeeded, so every requested day now has a real reading.
      // Days with no records are genuinely zero.
      const totals = new Map<string, number>(days.map((d) => [d, 0]));

      for (const rec of records) {
        // Attribute each record to the local day it started in. Records that
        // straddle midnight are rare for steps and splitting them would imply
        // a precision the source does not have.
        const key = dayKey(new Date(rec.startTime));
        const prev = totals.get(key);
        if (prev == null) continue; // outside the requested range
        totals.set(key, prev + (rec.count ?? 0));
      }

      return days.map((date) => ({ date, steps: totals.get(date) ?? 0 }));
    } catch {
      return blank;
    }
  },

  async writeEntries(entries: HealthWorkoutEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    try {
      if (!(await ensureInitialized())) return 0;
      const records = entries
        // Health Connect rejects non-positive durations; drop them rather than
        // failing the whole batch.
        .filter((e) => e.endedAt > e.startedAt)
        .map((e) => ({
          recordType: 'ExerciseSession' as const,
          exerciseType: EXERCISE_TYPE_STRENGTH_TRAINING,
          title: e.title,
          startTime: new Date(e.startedAt).toISOString(),
          endTime: new Date(e.endedAt).toISOString(),
        }));
      if (records.length === 0) return 0;
      const ids = await insertRecords(records);
      return ids.length;
    } catch {
      return 0;
    }
  },

  openSettings(): void {
    openHealthConnectSettings();
  },
};
