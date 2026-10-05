/**
 * Apple Health (HealthKit) implementation of HealthProvider, for iPhone.
 *
 * Only lib/health/index.ts should import this, and only on iOS: the native
 * module does not exist anywhere else.
 *
 * Two things HealthKit does differently from Health Connect, and how each is
 * kept honest:
 *
 * 1. It never says whether a READ was refused. Apple hides it on purpose — a
 *    denied type just returns nothing, exactly like a type with no data. So
 *    "0 steps" cannot be taken from an empty answer alone. A counter is only
 *    reported as zero for a day once HealthKit has shown it has at least one
 *    sample of that type at all (everRecorded); until then it stays null, which
 *    the UI renders as "no reading", never as 0.
 *
 * 2. It needs an entitlement that only a paid Apple developer signature can
 *    grant. A copy sideloaded with a free Apple ID installs and runs, but every
 *    HealthKit call fails. That is detected once and reported as unavailable,
 *    with the reason, rather than as "not connected" — connecting would never
 *    work in that build.
 */
import { Linking } from 'react-native';
import {
  AuthorizationRequestStatus,
  AuthorizationStatus,
  ComparisonPredicateOperator,
  currentAppSource,
  deleteObjects,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  authorizationStatusFor,
  requestAuthorization,
  saveCorrelationSample,
  saveQuantitySample,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
import { dayKey, eachDay, endOfLocalDay, previousDay, startOfLocalDay } from './dates';
import { describeError, type DiagnosticStep } from './diagnose';
import { healthKitTypeForHc, hcTypeForHealthKit, percentFromFraction, sleepMinutesFromStages } from './healthkit-map';
import {
  emptyHealthDay,
  type HealthAvailability,
  type HealthDay,
  type HealthGrants,
  type HealthHydrationEntry,
  type HealthNutritionEntry,
  type HealthPermissionState,
  type HealthProvider,
  type HealthScope,
  type HealthWeightEntry,
  type HealthWindow,
  type HealthWorkoutEntry,
  type HealthWorkoutSession,
  type HealthWriteResult,
  type HeartRateSample,
} from './types';

/** What the rest of the app calls this app's own records — see db/detected-queries. */
const OWN_SOURCE = 'com.hootywhooo86.bit128fit';

// Typed loosely on purpose: the library's identifier unions are huge, and the
// strings here are checked against HealthKit at runtime by every call anyway.
type Id = any;

const Q = (name: string): Id => `HKQuantityTypeIdentifier${name}`;
const SLEEP: Id = 'HKCategoryTypeIdentifierSleepAnalysis';
const WORKOUT: Id = 'HKWorkoutTypeIdentifier';

const NUTRIENTS = {
  calories: Q('DietaryEnergyConsumed'),
  protein: Q('DietaryProtein'),
  fat: Q('DietaryFatTotal'),
  carb: Q('DietaryCarbohydrates'),
  fiber: Q('DietaryFiber'),
  sugars: Q('DietarySugar'),
  saturatedFat: Q('DietaryFatSaturated'),
  sodium: Q('DietarySodium'),
} as const;

/** Each scope's HealthKit types, read and written. Mirrors ./scopes for Android. */
const SCOPE_TYPES: Record<HealthScope, { read: Id[]; write: Id[] }> = {
  steps: { read: [Q('StepCount')], write: [] },
  heartRate: { read: [Q('HeartRate')], write: [] },
  restingHeartRate: { read: [Q('RestingHeartRate')], write: [] },
  activeCalories: { read: [Q('ActiveEnergyBurned')], write: [] },
  totalCalories: { read: [Q('ActiveEnergyBurned'), Q('BasalEnergyBurned')], write: [] },
  distance: { read: [Q('DistanceWalkingRunning'), Q('DistanceCycling'), Q('DistanceWheelchair')], write: [] },
  sleep: { read: [SLEEP], write: [] },
  weight: { read: [Q('BodyMass')], write: [Q('BodyMass')] },
  height: { read: [Q('Height')], write: [] },
  bodyFat: { read: [Q('BodyFatPercentage')], write: [] },
  exercise: { read: [WORKOUT], write: [WORKOUT] },
  nutrition: { read: Object.values(NUTRIENTS), write: Object.values(NUTRIENTS) },
  hydration: { read: [Q('DietaryWater')], write: [Q('DietaryWater')] },
  oxygenSaturation: { read: [Q('OxygenSaturation')], write: [] },
  respiratoryRate: { read: [Q('RespiratoryRate')], write: [] },
  vo2Max: { read: [Q('VO2Max')], write: [] },
  bloodPressure: { read: [Q('BloodPressureSystolic'), Q('BloodPressureDiastolic')], write: [] },
  basalMetabolicRate: { read: [Q('BasalEnergyBurned')], write: [] },
};

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const TO_READ = uniq(Object.values(SCOPE_TYPES).flatMap((s) => s.read));
const TO_SHARE = uniq(Object.values(SCOPE_TYPES).flatMap((s) => s.write));

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ms = (d: unknown): number => (d instanceof Date ? d.getTime() : new Date(d as string).getTime());

/** Set once a HealthKit call has failed for want of the entitlement. */
let notEntitled: string | null = null;

function isEntitlementError(e: unknown): boolean {
  return /entitlement|not authorized to use|com\.apple\.developer\.healthkit/i.test(describeError(e));
}

/** The reason Apple Health can't be used in this copy, when that is the case. */
export function healthKitBlockedReason(): string | null {
  return notEntitled;
}

/** One request-status check per launch is enough; it is also the entitlement probe. */
async function requestStatus(): Promise<AuthorizationRequestStatus | null> {
  try {
    return await getRequestStatusForAuthorization({ toRead: TO_READ, toShare: TO_SHARE });
  } catch (e) {
    if (isEntitlementError(e)) notEntitled = describeError(e);
    return null;
  }
}

/**
 * Types HealthKit has shown at least one sample of. Only true is cached: a
 * type with nothing yet may get its first sample any minute.
 */
const recorded = new Set<string>();
async function everRecorded(id: Id): Promise<boolean> {
  if (recorded.has(id)) return true;
  try {
    const one = await queryQuantitySamples(id, { limit: 1 });
    if (one.length > 0) recorded.add(id);
    return one.length > 0;
  } catch {
    return false;
  }
}

const range = (startMs: number, endMs: number) => ({ date: { startDate: new Date(startMs), endDate: new Date(endMs) } });

/** Every sample of a type in a window, oldest first; null when the read failed. */
async function samples(id: Id, startMs: number, endMs: number, unit?: string) {
  try {
    return await queryQuantitySamples(id, { limit: 0, ascending: true, unit, filter: range(startMs, endMs) });
  } catch {
    return null;
  }
}

/**
 * Per-local-day sums for a counter, with HealthKit removing the overlap when
 * the phone and a watch both counted the same steps. Null when the read
 * failed or the type has never been recorded (see the module comment).
 */
async function dailySums(id: Id, days: string[], unit: string): Promise<Map<string, number> | null> {
  if (!(await everRecorded(id))) return null;
  const start = startOfLocalDay(days[0]);
  const end = endOfLocalDay(days[days.length - 1]);
  try {
    const stats = await queryStatisticsCollectionForQuantity(id, ['cumulativeSum'], start, { day: 1 }, {
      unit,
      filter: range(start.getTime(), end.getTime()),
    });
    // A day the query covered with nothing in it is a real zero.
    const out = new Map(days.map((d) => [d, 0]));
    for (const s of stats) {
      if (!s.startDate) continue;
      const key = dayKey(new Date(s.startDate));
      if (out.has(key)) out.set(key, num(s.sumQuantity?.quantity) ?? 0);
    }
    return out;
  } catch {
    return null;
  }
}

/** Point measurements: the latest reading of each day. */
async function latestPerDay(id: Id, startMs: number, endMs: number, unit: string, scale = (v: number) => v) {
  const got = await samples(id, startMs, endMs, unit);
  const out = new Map<string, number>();
  for (const s of got ?? []) {
    const v = num(s.quantity);
    if (v != null) out.set(dayKey(new Date(s.startDate)), scale(v)); // ascending: later wins
  }
  return out;
}

/** Metadata HealthKit uses to recognise our own record again, the way Health Connect uses clientRecordId. */
function syncMeta(clientId: string | undefined, version: number): Record<string, unknown> {
  const base = { HKMetadataKeyWasUserEntered: true };
  return clientId
    ? { ...base, HKMetadataKeySyncIdentifier: clientId, HKMetadataKeySyncVersion: Math.round(version) }
    : base;
}

function writeError(e: unknown, what: string): string {
  if (isEntitlementError(e)) return `Apple Health can't be used in this copy of the app, so ${what} wasn't saved there.`;
  const detail = describeError(e);
  if (/authoriz|permission|denied/i.test(detail)) return `Apple Health hasn't been allowed to save ${what}.`;
  return `Could not save ${what} to Apple Health: ${detail}`;
}

async function writeEach<T>(items: T[], what: string, save: (item: T) => Promise<unknown>): Promise<HealthWriteResult> {
  let written = 0;
  for (const item of items) {
    try {
      await save(item);
      written++;
    } catch (e) {
      return { written, error: writeError(e, what) };
    }
  }
  return { written, error: null };
}

export const healthKitProvider: HealthProvider = {
  name: 'Apple Health',

  async getAvailability(): Promise<HealthAvailability> {
    try {
      if (!isHealthDataAvailable()) return 'unavailable';
    } catch {
      return 'unavailable';
    }
    if ((await requestStatus()) == null && notEntitled) return 'unavailable';
    return 'available';
  },

  async getPermissionState(): Promise<HealthPermissionState> {
    const status = await requestStatus();
    if (status == null) return notEntitled ? 'denied' : 'unknown';
    if (status === AuthorizationRequestStatus.unnecessary) return 'granted';
    // Asked before, but there are types we have not asked about yet.
    const anyShared = TO_SHARE.some((t) => {
      try {
        return authorizationStatusFor(t) === AuthorizationStatus.sharingAuthorized;
      } catch {
        return false;
      }
    });
    return anyShared ? 'partial' : 'denied';
  },

  async getGrants(): Promise<HealthGrants> {
    const state = await this.getPermissionState();
    if (state !== 'granted' && state !== 'partial') return { read: [], write: [] };
    const scopes = Object.keys(SCOPE_TYPES) as HealthScope[];
    // Reads: HealthKit will not say, so every scope we asked for is listed.
    // A refused one simply comes back empty and shows as "no reading".
    const read = scopes.filter((s) => SCOPE_TYPES[s].read.length > 0);
    const write = scopes.filter(
      (s) =>
        SCOPE_TYPES[s].write.length > 0 &&
        SCOPE_TYPES[s].write.every((t) => {
          try {
            return authorizationStatusFor(t) === AuthorizationStatus.sharingAuthorized;
          } catch {
            return false;
          }
        })
    );
    return { read, write };
  },

  async requestPermissions(): Promise<HealthPermissionState> {
    try {
      await requestAuthorization({ toRead: TO_READ, toShare: TO_SHARE });
    } catch (e) {
      if (isEntitlementError(e)) notEntitled = describeError(e);
      return 'denied';
    }
    recorded.clear();
    return this.getPermissionState();
  },

  async readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    const days = eachDay(startDate, endDate);
    if (days.length === 0) return [];
    const byDate = new Map(days.map((d) => [d, emptyHealthDay(d)]));
    if (notEntitled) return days.map((d) => byDate.get(d)!);

    const startMs = startOfLocalDay(startDate).getTime();
    const endMs = endOfLocalDay(endDate).getTime();

    const [steps, active, basal, walkRun, cycling, wheelchair, water] = await Promise.all([
      dailySums(Q('StepCount'), days, 'count'),
      dailySums(Q('ActiveEnergyBurned'), days, 'kcal'),
      dailySums(Q('BasalEnergyBurned'), days, 'kcal'),
      dailySums(Q('DistanceWalkingRunning'), days, 'm'),
      dailySums(Q('DistanceCycling'), days, 'm'),
      dailySums(Q('DistanceWheelchair'), days, 'm'),
      dailySums(Q('DietaryWater'), days, 'mL'),
    ]);

    for (const [key, day] of byDate) {
      if (steps) day.steps = Math.round(steps.get(key) ?? 0);
      if (active) day.activeCalories = active.get(key) ?? 0;
      // Total is basal plus active, as Health Connect reports it; only when both were read.
      if (active && basal) day.totalCalories = (active.get(key) ?? 0) + (basal.get(key) ?? 0);
      const dist = [walkRun, cycling, wheelchair].filter((m): m is Map<string, number> => m != null);
      if (dist.length > 0) day.distanceMeters = dist.reduce((sum, m) => sum + (m.get(key) ?? 0), 0);
      if (water) day.hydrationMl = water.get(key) ?? 0;
    }

    // Heart rate: mean, min and max of the day's samples. No samples, no reading.
    const hr = await samples(Q('HeartRate'), startMs, endMs, 'count/min');
    if (hr) {
      const acc = new Map<string, { sum: number; n: number; min: number; max: number }>();
      for (const s of hr) {
        const bpm = num(s.quantity);
        if (bpm == null) continue;
        const key = dayKey(new Date(s.startDate));
        const a = acc.get(key) ?? { sum: 0, n: 0, min: bpm, max: bpm };
        a.sum += bpm;
        a.n += 1;
        a.min = Math.min(a.min, bpm);
        a.max = Math.max(a.max, bpm);
        acc.set(key, a);
      }
      for (const [key, a] of acc) {
        const day = byDate.get(key);
        if (!day || a.n === 0) continue;
        day.heartRateAvg = Math.round(a.sum / a.n);
        day.heartRateMin = Math.round(a.min);
        day.heartRateMax = Math.round(a.max);
      }
    }

    const points: [keyof HealthDay, Id, string, ((v: number) => number | null)?][] = [
      ['restingHeartRate', Q('RestingHeartRate'), 'count/min', Math.round],
      ['weightKg', Q('BodyMass'), 'kg'],
      ['bodyFatPercent', Q('BodyFatPercentage'), '%', percentFromFraction],
      ['oxygenSaturation', Q('OxygenSaturation'), '%', percentFromFraction],
      ['respiratoryRate', Q('RespiratoryRate'), 'count/min'],
    ];
    for (const [field, id, unit, scale] of points) {
      const latest = await latestPerDay(id, startMs, endMs, unit, (v) => (scale ? scale(v) ?? v : v));
      for (const [key, v] of latest) {
        const day = byDate.get(key);
        if (day) (day[field] as number | null) = v;
      }
    }

    // Sleep: a night that ends inside the range may start the evening before it.
    try {
      const nights = await queryCategorySamples(SLEEP, {
        limit: 0,
        ascending: true,
        filter: range(startOfLocalDay(previousDay(startDate)).getTime(), endMs),
      });
      const minutes = sleepMinutesFromStages(
        nights.map((s) => ({ value: Number(s.value), startMs: ms(s.startDate), endMs: ms(s.endDate) }))
      );
      for (const [key, m] of minutes) {
        const day = byDate.get(key);
        if (day) day.sleepMinutes = m;
      }
    } catch {
      // Unreadable sleep stays null: no reading, not zero hours.
    }

    return days.map((d) => byDate.get(d)!);
  },

  async readWindow(startMs: number, endMs: number): Promise<HealthWindow> {
    const none: HealthWindow = { heartRateAvg: null, heartRateMax: null, activeCalories: null };
    if (!(endMs > startMs) || notEntitled) return none;
    const [hr, active, walkRun, cycling] = await Promise.all([
      samples(Q('HeartRate'), startMs, endMs, 'count/min'),
      samples(Q('ActiveEnergyBurned'), startMs, endMs, 'kcal'),
      samples(Q('DistanceWalkingRunning'), startMs, endMs, 'm'),
      samples(Q('DistanceCycling'), startMs, endMs, 'm'),
    ]);
    const out = { ...none };
    const bpms = (hr ?? []).map((s) => num(s.quantity)).filter((v): v is number => v != null);
    // No samples is not a heart rate of zero — the watch was not on.
    if (bpms.length > 0) {
      out.heartRateAvg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
      out.heartRateMax = Math.round(Math.max(...bpms));
    }
    // Same honesty rule as readDays: zero only once the type is known to be readable.
    if (active && (active.length > 0 || (await everRecorded(Q('ActiveEnergyBurned'))))) {
      out.activeCalories = active.reduce((sum, s) => sum + (num(s.quantity) ?? 0), 0);
    }
    const dist = [...(walkRun ?? []), ...(cycling ?? [])];
    if (dist.length > 0) out.distanceM = dist.reduce((sum, s) => sum + (num(s.quantity) ?? 0), 0);
    return out;
  },

  async readHeartRateSeries(startMs: number, endMs: number): Promise<HeartRateSample[]> {
    if (!(endMs > startMs) || notEntitled) return [];
    const got = await samples(Q('HeartRate'), startMs, endMs, 'count/min');
    const out: HeartRateSample[] = [];
    for (const s of got ?? []) {
      const bpm = num(s.quantity);
      const t = ms(s.startDate);
      if (bpm != null && Number.isFinite(t)) out.push({ t, bpm: Math.round(bpm) });
    }
    return out.sort((a, b) => a.t - b.t);
  },

  async readWorkouts(startMs: number, endMs: number): Promise<HealthWorkoutSession[]> {
    if (!(endMs > startMs)) return [];
    if (notEntitled) throw new Error("Apple Health can't be used in this copy of the app.");
    let own: string | null = null;
    try {
      // A sideloaded copy may run under a changed bundle id, so ask rather than assume.
      own = currentAppSource().bundleIdentifier;
    } catch {
      own = null;
    }
    try {
      const workouts = await queryWorkoutSamples({ limit: 0, ascending: true, filter: range(startMs, endMs) });
      const out: HealthWorkoutSession[] = [];
      for (const w of workouts) {
        const start = ms(w.startDate);
        const end = ms(w.endDate);
        if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) continue;
        const meta = (w.metadata ?? {}) as Record<string, unknown>;
        const mapped = hcTypeForHealthKit(Number(w.workoutActivityType), {
          indoor: meta.HKIndoorWorkout ?? meta.HKMetadataKeyIndoorWorkout,
          swimmingLocation: meta.HKSwimmingLocationType ?? meta.HKMetadataKeySwimmingLocationType,
        });
        const bundle = w.sourceRevision?.source?.bundleIdentifier ?? null;
        out.push({
          id: w.uuid,
          type: mapped.type,
          title: mapped.title,
          startMs: start,
          endMs: end,
          source: bundle && own && bundle === own ? OWN_SOURCE : bundle,
        });
      }
      return out;
    } catch (e) {
      throw new Error(`Apple Health wouldn't share your workouts: ${describeError(e)}`);
    }
  },

  async writeEntries(entries: HealthWorkoutEntry[]): Promise<number> {
    if (entries.length === 0 || notEntitled) return 0;
    let n = 0;
    for (const e of entries.filter((x) => x.endedAt > x.startedAt)) {
      const { activityType, indoor } = healthKitTypeForHc(e.exerciseType ?? 70);
      try {
        // Duration and type only, no energy figure — see the note in ./types.
        await saveWorkoutSample(activityType as never, [], new Date(e.startedAt), new Date(e.endedAt), undefined, {
          ...syncMeta(e.clientId, e.endedAt),
          ...(indoor ? { HKIndoorWorkout: true } : {}),
          ...(e.title ? { HKWorkoutBrandName: e.title } : {}),
        } as never);
        n++;
      } catch {
        // The caller reports a short count; keep going with the rest.
      }
    }
    return n;
  },

  async writeNutrition(entries: HealthNutritionEntry[]): Promise<HealthWriteResult> {
    if (entries.length === 0) return { written: 0, error: null };
    return writeEach(entries, 'your food log', async (e) => {
      const start = new Date(e.at);
      const end = new Date(e.at + 60_000);
      const g = (v: number | null | undefined) => v;
      const parts: [Id, number | null | undefined, string][] = [
        [NUTRIENTS.calories, e.calories, 'kcal'],
        [NUTRIENTS.protein, g(e.protein), 'g'],
        [NUTRIENTS.fat, g(e.fat), 'g'],
        [NUTRIENTS.carb, g(e.carb), 'g'],
        [NUTRIENTS.fiber, g(e.fiber), 'g'],
        [NUTRIENTS.sugars, g(e.sugars), 'g'],
        [NUTRIENTS.saturatedFat, g(e.saturatedFat), 'g'],
        // Labels state sodium in milligrams; HealthKit's canonical unit is grams.
        [NUTRIENTS.sodium, e.sodium == null ? null : e.sodium / 1000, 'g'],
      ];
      const meta = syncMeta(e.clientId, e.at);
      const samples = parts
        .filter(([, v]) => v != null && Number.isFinite(v) && v >= 0)
        .map(([id, v, unit]) => ({ quantityType: id, quantity: v!, unit, startDate: start, endDate: end, metadata: meta }));
      if (samples.length === 0) return;
      await saveCorrelationSample('HKCorrelationTypeIdentifierFood', samples as never, start, end, {
        ...meta,
        ...(e.name ? { HKFoodType: e.name } : {}),
      } as never);
    });
  },

  async writeWeight(entries: HealthWeightEntry[]): Promise<HealthWriteResult> {
    const valid = entries.filter((e) => e.kg > 0);
    if (valid.length === 0) return { written: 0, error: null };
    return writeEach(valid, 'your weigh-in', (e) =>
      saveQuantitySample(Q('BodyMass'), 'kg', e.kg, new Date(e.at), new Date(e.at), syncMeta(e.clientId, e.at) as never)
    );
  },

  async writeHydration(entries: HealthHydrationEntry[]): Promise<HealthWriteResult> {
    const valid = entries.filter((e) => e.ml > 0);
    if (valid.length === 0) return { written: 0, error: null };
    return writeEach(valid, 'your water log', (e) =>
      saveQuantitySample(Q('DietaryWater'), 'mL', e.ml, new Date(e.at), new Date(e.at + 60_000), syncMeta(e.clientId, e.at) as never)
    );
  },

  async deleteEntries(scope, clientIds): Promise<HealthWriteResult> {
    if (clientIds.length === 0) return { written: 0, error: null };
    // By our own sync identifier only, so this can never reach another app's data.
    const types: Id[] = scope === 'nutrition' ? ['HKCorrelationTypeIdentifierFood', ...Object.values(NUTRIENTS)] : SCOPE_TYPES[scope].write;
    let removed = 0;
    try {
      for (const id of clientIds) {
        for (const t of types) {
          removed += await deleteObjects(t, {
            metadata: {
              withMetadataKey: 'HKMetadataKeySyncIdentifier',
              operatorType: ComparisonPredicateOperator.equalTo,
              value: id,
            },
          });
        }
      }
      return { written: removed, error: null };
    } catch (e) {
      return { written: removed, error: writeError(e, `the deleted ${scope} entry`) };
    }
  },

  openSettings(): void {
    // The Health app holds the per-app switches (Sharing → Apps). If it
    // cannot be opened, the iPhone Settings page for this app is the next best.
    void Linking.openURL('x-apple-health://').catch(() => Linking.openSettings());
  },
};

/** The unswallowed view, for the diagnostics screen. */
export async function diagnoseHealthKit(): Promise<DiagnosticStep[]> {
  const out: DiagnosticStep[] = [];
  const add = (label: string, value: string, ok: boolean | null = null) => out.push({ label, value, ok });
  try {
    const avail = isHealthDataAvailable();
    add('Health data on this device', avail ? 'yes' : 'no', avail);
    if (!avail) return out;
  } catch (e) {
    add('Health data on this device', describeError(e), false);
    return out;
  }
  try {
    const status = await getRequestStatusForAuthorization({ toRead: TO_READ, toShare: TO_SHARE });
    const names: Record<number, string> = {
      [AuthorizationRequestStatus.unknown]: 'unknown',
      [AuthorizationRequestStatus.shouldRequest]: 'not asked yet',
      [AuthorizationRequestStatus.unnecessary]: 'asked',
    };
    add('Permission request', names[status] ?? String(status), status === AuthorizationRequestStatus.unnecessary);
  } catch (e) {
    add('Permission request', describeError(e), false);
    if (isEntitlementError(e)) {
      add('Why', 'This copy is not signed with the Apple Health entitlement (a free Apple ID cannot grant it).', false);
    }
    return out;
  }
  try {
    const day = dayKey(new Date());
    const steps = await dailySums(Q('StepCount'), [day], 'count');
    add('Steps today', steps ? String(Math.round(steps.get(day) ?? 0)) : 'no reading (none ever recorded, or not allowed)', steps != null);
  } catch (e) {
    add('Steps today', describeError(e), false);
  }
  return out;
}
