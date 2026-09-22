import { describe, expect, it } from 'vitest';
import appJson from '@/app.json';
import {
  SCOPE_RECORDS,
  androidHealthPermissions,
  healthConnectPermissions,
  permissionSuffix,
} from './scopes';
import { HEALTH_SCOPES } from './types';

describe('scope map', () => {
  it('covers every scope the app declares', () => {
    const mapped = Object.keys(SCOPE_RECORDS);
    expect([...HEALTH_SCOPES].sort()).toEqual(mapped.sort());
  });

  it('asks for at least one direction per scope', () => {
    for (const [scope, spec] of Object.entries(SCOPE_RECORDS)) {
      expect(spec.directions.length, scope).toBeGreaterThan(0);
    }
  });

  it('maps each scope to a distinct record type', () => {
    const types = Object.values(SCOPE_RECORDS).map((s) => s.recordType);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('permission naming', () => {
  it('snake-cases a record type', () => {
    expect(permissionSuffix('HeartRate')).toBe('HEART_RATE');
    expect(permissionSuffix('OxygenSaturation')).toBe('OXYGEN_SATURATION');
    expect(permissionSuffix('Steps')).toBe('STEPS');
    expect(permissionSuffix('Vo2Max')).toBe('VO2_MAX');
  });

  it('uses the irregular spellings Health Connect actually defines', () => {
    // These do not follow from the record type name, and getting one wrong
    // means the permission is never granted and the read returns nothing.
    expect(permissionSuffix('ExerciseSession')).toBe('EXERCISE');
    expect(permissionSuffix('SleepSession')).toBe('SLEEP');
  });
});

/**
 * The failure this guards against is invisible until you run the app: the
 * config plugin does not declare health permissions, so a scope the code asks
 * for but the manifest does not declare is simply never granted, and the read
 * comes back empty with no error anywhere.
 */
describe('app.json declares exactly what the code asks for', () => {
  const declared = (appJson.expo.android.permissions as string[]).filter((p) =>
    p.includes('.health.')
  );

  it('declares every permission the code requests', () => {
    const missing = androidHealthPermissions().filter((p) => !declared.includes(p));
    expect(missing).toEqual([]);
  });

  it('declares nothing the code does not request', () => {
    const wanted = new Set(androidHealthPermissions());
    expect(declared.filter((p) => !wanted.has(p))).toEqual([]);
  });

  it('declares one permission per requested record type and direction', () => {
    expect(declared.length).toBe(healthConnectPermissions().length);
  });
});
