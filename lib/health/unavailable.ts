/**
 * The provider used when there is no health data to be had — iOS, web, Expo Go,
 * or an Android phone with no Health Connect.
 *
 * Every read returns null, never zero. "No provider" is not "zero steps", and
 * the UI must be able to tell the difference. Every write reports honestly that
 * it wrote nothing and why, rather than silently succeeding.
 */
import {
  emptyHealthDay,
  type HealthAvailability,
  type HealthDay,
  type HealthGrants,
  type HealthPermissionState,
  type HealthProvider,
  type HealthWindow,
  type HealthWriteResult,
} from './types';
import { eachDay } from './dates';

const NO_PROVIDER = 'Health Connect is not available on this phone.';
const nothing = (): HealthWriteResult => ({ written: 0, error: NO_PROVIDER });

export const unavailableProvider: HealthProvider = {
  name: 'Unavailable',

  async getAvailability(): Promise<HealthAvailability> {
    return 'unavailable';
  },

  async getPermissionState(): Promise<HealthPermissionState> {
    return 'denied';
  },

  async getGrants(): Promise<HealthGrants> {
    return { read: [], write: [] };
  },

  async requestPermissions(): Promise<HealthPermissionState> {
    return 'denied';
  },

  async readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    return eachDay(startDate, endDate).map(emptyHealthDay);
  },

  async readWindow(): Promise<HealthWindow> {
    return { heartRateAvg: null, heartRateMax: null, activeCalories: null };
  },

  async writeEntries(): Promise<number> {
    return 0;
  },

  async writeNutrition(): Promise<HealthWriteResult> {
    return nothing();
  },

  async writeWeight(): Promise<HealthWriteResult> {
    return nothing();
  },

  async writeHydration(): Promise<HealthWriteResult> {
    return nothing();
  },

  async deleteEntries(): Promise<HealthWriteResult> {
    // Nothing was ever written here, so nothing needs removing. That is a
    // success, not the NO_PROVIDER failure the writes report.
    return { written: 0, error: null };
  },

  openSettings(): void {
    // Nothing to open.
  },
};
