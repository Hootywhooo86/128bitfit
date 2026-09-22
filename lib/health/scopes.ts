/**
 * How the app's scopes map onto Health Connect record types, and which
 * direction each is used in.
 *
 * Kept separate and pure so the mapping can be tested: the one mistake that
 * costs a whole build cycle is a scope whose Android manifest permission is
 * missing, because the config plugin does not declare permissions for you and
 * the request then silently returns nothing.
 */
import type { HealthScope } from './types';

export type Direction = 'read' | 'write';

export type ScopeSpec = {
  /** Health Connect record type. */
  recordType: string;
  /** Directions the app actually uses. Asking for more would be impolite. */
  directions: Direction[];
};

export const SCOPE_RECORDS: Record<HealthScope, ScopeSpec> = {
  steps: { recordType: 'Steps', directions: ['read', 'write'] },
  heartRate: { recordType: 'HeartRate', directions: ['read', 'write'] },
  restingHeartRate: { recordType: 'RestingHeartRate', directions: ['read'] },
  activeCalories: { recordType: 'ActiveCaloriesBurned', directions: ['read', 'write'] },
  totalCalories: { recordType: 'TotalCaloriesBurned', directions: ['read'] },
  distance: { recordType: 'Distance', directions: ['read', 'write'] },
  sleep: { recordType: 'SleepSession', directions: ['read'] },
  weight: { recordType: 'Weight', directions: ['read', 'write'] },
  height: { recordType: 'Height', directions: ['read'] },
  bodyFat: { recordType: 'BodyFat', directions: ['read', 'write'] },
  exercise: { recordType: 'ExerciseSession', directions: ['read', 'write'] },
  nutrition: { recordType: 'Nutrition', directions: ['read', 'write'] },
  hydration: { recordType: 'Hydration', directions: ['read', 'write'] },
  oxygenSaturation: { recordType: 'OxygenSaturation', directions: ['read'] },
  respiratoryRate: { recordType: 'RespiratoryRate', directions: ['read'] },
  vo2Max: { recordType: 'Vo2Max', directions: ['read'] },
  bloodPressure: { recordType: 'BloodPressure', directions: ['read'] },
  basalMetabolicRate: { recordType: 'BasalMetabolicRate', directions: ['read'] },
};

/**
 * `android.permission.health.READ_STEPS` and friends. Health Connect derives
 * the permission name from the record type, upper snake-cased, with two
 * irregular spellings that do not follow from the record type name.
 */
const IRREGULAR: Record<string, string> = {
  ExerciseSession: 'EXERCISE',
  SleepSession: 'SLEEP',
  TotalCaloriesBurned: 'TOTAL_CALORIES_BURNED',
  ActiveCaloriesBurned: 'ACTIVE_CALORIES_BURNED',
};

export function permissionSuffix(recordType: string): string {
  if (IRREGULAR[recordType]) return IRREGULAR[recordType];
  return recordType.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Every `android.permission.health.*` string the app needs, sorted. */
export function androidHealthPermissions(): string[] {
  const out = new Set<string>();
  for (const spec of Object.values(SCOPE_RECORDS)) {
    for (const dir of spec.directions) {
      out.add(`android.permission.health.${dir.toUpperCase()}_${permissionSuffix(spec.recordType)}`);
    }
  }
  return [...out].sort();
}

/** The permission objects passed to Health Connect's request call. */
export function healthConnectPermissions(): { accessType: Direction; recordType: string }[] {
  const out: { accessType: Direction; recordType: string }[] = [];
  for (const spec of Object.values(SCOPE_RECORDS)) {
    for (const dir of spec.directions) out.push({ accessType: dir, recordType: spec.recordType });
  }
  return out;
}
