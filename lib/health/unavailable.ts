/**
 * Provider used where no health integration exists (iOS until HealthKit lands,
 * and web). It reports "unavailable" honestly instead of returning zeros.
 */
import type {
  HealthAvailability,
  HealthDay,
  HealthPermissionState,
  HealthProvider,
} from './types';
import { eachDay } from './dates';

export const unavailableProvider: HealthProvider = {
  name: 'Health',
  async getAvailability(): Promise<HealthAvailability> {
    return 'unavailable';
  },
  async getPermissionState(): Promise<HealthPermissionState> {
    return 'denied';
  },
  async requestPermissions(): Promise<HealthPermissionState> {
    return 'denied';
  },
  async readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    return eachDay(startDate, endDate).map((date) => ({ date, steps: null }));
  },
  async writeEntries(): Promise<number> {
    return 0;
  },
  openSettings(): void {
    // Nothing to open.
  },
};
