/**
 * Platform-agnostic health data access.
 *
 * Health Connect (Android) is the only implementation today; HealthKit slots in
 * behind the same interface later. Nothing above this layer imports a platform
 * SDK directly.
 *
 * The honesty rule from CLAUDE.md is encoded in the types: a day's metric is
 * `number | null`, where `null` means "no reading was taken" and `0` means "we
 * read it and it was zero". Callers must render those differently and must
 * never substitute one for the other.
 */

/** Whether health data can be read on this device at all. */
export type HealthAvailability =
  /** Provider present and usable. */
  | 'available'
  /** No provider on this device, or an unsupported platform (iOS today, web). */
  | 'unavailable'
  /** Provider installed but too old to talk to; the user must update it. */
  | 'update_required';

/** Whether the user has granted us the data we ask for. */
export type HealthPermissionState =
  | 'granted'
  /** Asked and refused, or never asked. Both are "we have no data". */
  | 'denied'
  /** Not yet checked. */
  | 'unknown';

/**
 * One local calendar day of metrics.
 *
 * `null` is not zero. See the module comment.
 */
export type HealthDay = {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Steps counted that day, or null if the day could not be read. */
  steps: number | null;
};

/** A completed workout to push back to the platform's health store. */
export type HealthWorkoutEntry = {
  startedAt: number;
  endedAt: number;
  /** Shown in the health app's own UI. */
  title?: string;
};

export interface HealthProvider {
  /** For logs and the Settings screen, e.g. "Health Connect". */
  readonly name: string;

  getAvailability(): Promise<HealthAvailability>;

  /** Never prompts. Safe to call on every screen focus. */
  getPermissionState(): Promise<HealthPermissionState>;

  /** Prompts. Only call from an explicit user action. */
  requestPermissions(): Promise<HealthPermissionState>;

  /**
   * Read whole local days, inclusive of both ends. Days with no reading come
   * back with null metrics rather than being omitted, so callers can tell
   * "nothing recorded" from "not asked for".
   */
  readDays(startDate: string, endDate: string): Promise<HealthDay[]>;

  /** Returns how many entries were actually written. */
  writeEntries(entries: HealthWorkoutEntry[]): Promise<number>;

  /** Opens the platform health app so the user can change permissions. */
  openSettings(): void;
}
