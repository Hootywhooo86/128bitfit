/**
 * Entry point for health data. Import from here, never from a platform module.
 *
 * Android gets Health Connect; everything else reports "unavailable". Swapping
 * in HealthKit later is a change to this file plus one new HealthProvider.
 *
 * The Android module is loaded lazily and defensively on purpose:
 * react-native-health-connect resolves its native module with
 * TurboModuleRegistry.getEnforcing at import time, which *throws* wherever that
 * module is not registered — iOS, web, and Expo Go. A static import would take
 * the whole app down at launch, so we require it only on Android and fall back
 * to the unavailable provider if it is not there.
 */
import { Platform } from 'react-native';
import { unavailableProvider } from './unavailable';
import type {
  HealthAvailability,
  HealthDay,
  HealthPermissionState,
  HealthProvider,
  HealthWorkoutEntry,
} from './types';

let resolved: HealthProvider | null = null;

function provider(): HealthProvider {
  if (resolved) return resolved;
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      resolved = require('./health-connect').healthConnectProvider as HealthProvider;
    } catch {
      // No native module in this binary (Expo Go, or a build predating the
      // config plugin). Health data is genuinely unavailable — say so.
      resolved = unavailableProvider;
    }
  } else {
    resolved = unavailableProvider;
  }
  return resolved;
}

/** Stable facade so callers keep one import regardless of platform. */
export const health: HealthProvider = {
  get name(): string {
    return provider().name;
  },
  getAvailability(): Promise<HealthAvailability> {
    return provider().getAvailability();
  },
  getPermissionState(): Promise<HealthPermissionState> {
    return provider().getPermissionState();
  },
  requestPermissions(): Promise<HealthPermissionState> {
    return provider().requestPermissions();
  },
  readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    return provider().readDays(startDate, endDate);
  },
  writeEntries(entries: HealthWorkoutEntry[]): Promise<number> {
    return provider().writeEntries(entries);
  },
  openSettings(): void {
    provider().openSettings();
  },
};

export * from './types';
export { dayKey, eachDay, today } from './dates';
