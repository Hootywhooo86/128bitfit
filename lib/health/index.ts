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
import { describeError, type DiagnosticStep } from './diagnose';
import type {
  HealthAvailability,
  HealthDay,
  HealthGrants,
  HealthHydrationEntry,
  HealthNutritionEntry,
  HealthPermissionState,
  HealthProvider,
  HealthWeightEntry,
  HealthWindow,
  HeartRateSample,
  HealthWorkoutSession,
  HealthWorkoutEntry,
  HealthWriteResult,
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
  getGrants(): Promise<HealthGrants> {
    return provider().getGrants();
  },
  requestPermissions(): Promise<HealthPermissionState> {
    return provider().requestPermissions();
  },
  readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    return provider().readDays(startDate, endDate);
  },
  readWindow(startMs: number, endMs: number): Promise<HealthWindow> {
    return provider().readWindow(startMs, endMs);
  },
  readHeartRateSeries(startMs: number, endMs: number): Promise<HeartRateSample[]> {
    return provider().readHeartRateSeries(startMs, endMs);
  },
  readWorkouts(startMs: number, endMs: number): Promise<HealthWorkoutSession[]> {
    return provider().readWorkouts(startMs, endMs);
  },
  writeEntries(entries: HealthWorkoutEntry[]): Promise<number> {
    return provider().writeEntries(entries);
  },
  writeNutrition(entries: HealthNutritionEntry[]): Promise<HealthWriteResult> {
    return provider().writeNutrition(entries);
  },
  writeWeight(entries: HealthWeightEntry[]): Promise<HealthWriteResult> {
    return provider().writeWeight(entries);
  },
  writeHydration(entries: HealthHydrationEntry[]): Promise<HealthWriteResult> {
    return provider().writeHydration(entries);
  },
  deleteEntries(
    scope: 'nutrition' | 'weight' | 'hydration' | 'exercise',
    clientIds: string[]
  ): Promise<HealthWriteResult> {
    return provider().deleteEntries(scope, clientIds);
  },
  openSettings(): void {
    provider().openSettings();
  },
};

/**
 * The unswallowed view, for the diagnostics screen.
 *
 * Loaded the same lazy, defensive way as the provider — a static import would
 * take the app down at launch anywhere the native module is not registered.
 */
export async function diagnoseHealth(): Promise<DiagnosticStep[]> {
  if (Platform.OS !== 'android') {
    return [{ label: 'Platform', value: `${Platform.OS} — Health Connect is Android only`, ok: false }];
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./health-connect') as typeof import('./health-connect');
    return await mod.diagnoseHealthConnect();
  } catch (e) {
    return [
      {
        label: 'Native module',
        value: `not in this build — ${describeError(e)}`,
        ok: false,
      },
    ];
  }
}

export * from './types';
export { dayKey, eachDay, today } from './dates';
