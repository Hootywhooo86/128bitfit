/**
 * Health Connect (Android) implementation of HealthProvider.
 *
 * Only lib/health/index.ts should import this; everything else goes through
 * the interface so the HealthKit implementation can slot in later.
 *
 * The record types and their Android permissions live in ./scopes, where a test
 * checks them against app.json — a scope the code requests but the manifest
 * does not declare is never granted and reads come back empty with no error.
 */
import {
  SdkAvailabilityStatus,
  aggregateGroupByPeriod,
  aggregateRecord,
  deleteRecordsByUuids,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';
import type { Permission } from 'react-native-health-connect';
import { SCOPE_RECORDS, healthConnectPermissions, type Direction } from './scopes';
import { dayKey, eachDay, endOfLocalDay, previousDay, startOfLocalDay } from './dates';
import { describeError, type DiagnosticStep } from './diagnose';
import { sleepMinutesByWakeDay } from './sleep';
import { readAllPages } from './paging';
import { dailyTotals, type PeriodGroup } from './day-groups';
import { sourceName, stepFreshness, type StepRow } from './step-freshness';
import {
  HEALTH_SCOPES,
  emptyHealthDay,
  type HealthAvailability,
  type HealthDay,
  type HealthGrants,
  type HealthHydrationEntry,
  type HealthNutritionEntry,
  type HealthPermissionState,
  type HealthProvider,
  type HealthWorkoutSession,
  type HealthScope,
  type HealthWeightEntry,
  type HealthWindow,
  type HeartRateSample,
  type HealthWorkoutEntry,
  type HealthWriteResult,
  type NewestSteps,
} from './types';

const PERMISSIONS = healthConnectPermissions() as Permission[];

/** Health Connect's strength-training exercise type. */
const EXERCISE_TYPE_STRENGTH_TRAINING = 70;

/**
 * RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY. Everything this app writes was
 * typed in by the user, and saying so lets other apps weigh it accordingly
 * instead of treating a typed meal like a sensor reading.
 */
const MANUAL_ENTRY = 3;

/**
 * Metadata that ties a Health Connect record back to our local row.
 *
 * clientRecordId is a key Health Connect scopes to this app: inserting the same
 * one again updates the record in place instead of adding a duplicate, which is
 * what makes editing a logged meal work, and it is how deleteEntries finds the
 * record to remove. clientRecordVersion rises with the edit so a stale retry
 * cannot overwrite a newer value.
 */
function metadataFor(clientId: string | undefined, version: number) {
  return clientId
    ? {
        metadata: {
          clientRecordId: clientId,
          clientRecordVersion: version,
          recordingMethod: MANUAL_ENTRY,
        },
      }
    : { metadata: { recordingMethod: MANUAL_ENTRY } };
}

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

type Granted = { accessType: string; recordType: string }[];

function grantsFrom(granted: Granted): HealthGrants {
  const has = (dir: Direction, recordType: string) =>
    granted.some((g) => g.accessType === dir && g.recordType === recordType);

  const read: HealthScope[] = [];
  const write: HealthScope[] = [];
  for (const scope of HEALTH_SCOPES) {
    const spec = SCOPE_RECORDS[scope];
    if (spec.directions.includes('read') && has('read', spec.recordType)) read.push(scope);
    if (spec.directions.includes('write') && has('write', spec.recordType)) write.push(scope);
  }
  return { read, write };
}

function stateFrom(granted: Granted): HealthPermissionState {
  const got = granted.length;
  if (got === 0) return 'denied';
  return got >= PERMISSIONS.length ? 'granted' : 'partial';
}

/**
 * Why the last read of each record type failed, for the diagnostics screen.
 *
 * tryRead has to return null on failure so one refused scope cannot blank the
 * others, but a bare null tells nobody anything — it is indistinguishable from
 * "not granted", which is how the steps fault stayed invisible through four
 * rounds of fixes. The reason is kept here instead of being thrown away.
 */
export const lastReadErrors = new Map<string, string>();

/** One record type over a time range, every page of it. */
function readAll<T>(recordType: string, startTime: string, endTime: string): Promise<T[]> {
  return readAllPages<T>(async (pageToken) => {
    const res = await readRecords(recordType as never, {
      timeRangeFilter: { operator: 'between', startTime, endTime },
      ...(pageToken ? { pageToken } : {}),
    } as never);
    return { records: res.records as T[], pageToken: (res as { pageToken?: string }).pageToken };
  });
}

/** A read that was not granted must not come back as zero. */
async function tryRead<T>(recordType: string, start: string, end: string): Promise<T[] | null> {
  try {
    const records = await readAll<T>(
      recordType,
      startOfLocalDay(start).toISOString(),
      endOfLocalDay(end).toISOString()
    );
    lastReadErrors.delete(recordType);
    return records;
  } catch (e) {
    lastReadErrors.set(recordType, describeError(e));
    return null;
  }
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

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
      return stateFrom((await getGrantedPermissions()) as Granted);
    } catch {
      return 'unknown';
    }
  },

  async getGrants(): Promise<HealthGrants> {
    try {
      if (!(await ensureInitialized())) return { read: [], write: [] };
      return grantsFrom((await getGrantedPermissions()) as Granted);
    } catch {
      return { read: [], write: [] };
    }
  },

  async requestPermissions(): Promise<HealthPermissionState> {
    try {
      if (!(await ensureInitialized())) return 'denied';
      return stateFrom((await requestPermission(PERMISSIONS)) as Granted);
    } catch {
      return 'denied';
    }
  },

  async readDays(startDate: string, endDate: string): Promise<HealthDay[]> {
    const days = eachDay(startDate, endDate);
    if (days.length === 0) return [];

    const blank = days.map(emptyHealthDay);
    if (!(await ensureInitialized())) return blank;

    const byDate = new Map(days.map((d, i) => [d, { ...blank[i] }]));
    /** Attribute a record to the local day it started in. */
    const dayOf = (rec: { startTime?: string; time?: string }) => {
      const t = rec.startTime ?? rec.time;
      return t ? byDate.get(dayKey(new Date(t))) : undefined;
    };

    // Read one at a time, not with Promise.all.
    //
    // Twelve concurrent reads is twelve simultaneous IPC calls into the Health
    // Connect provider, and tryRead turns any failure into null, which the UI
    // renders as a dash. The diagnostics screen proved a single Steps read
    // returning 95 records and 5170 steps on a device where the card showed
    // nothing, so the difference between the two paths is the batching. These
    // are local calls that take milliseconds; doing them in sequence costs
    // nothing worth the risk.
    const readAll = async () => {
      const out: (unknown[] | null)[] = [];
      for (const [type, from] of [
        ['Steps', startDate],
        ['HeartRate', startDate],
        ['RestingHeartRate', startDate],
        ['ActiveCaloriesBurned', startDate],
        ['TotalCaloriesBurned', startDate],
        ['Distance', startDate],
        // One day earlier than the rest: a night that ends inside the range
        // may have begun the evening before it, and reading from the range's
        // own start would miss the session entirely rather than misfile it.
        ['SleepSession', previousDay(startDate)],
        ['Weight', startDate],
        ['BodyFat', startDate],
        ['Hydration', startDate],
        ['OxygenSaturation', startDate],
        ['RespiratoryRate', startDate],
      ] as const) {
        out.push(await tryRead<unknown>(type, from, endDate));
      }
      return out;
    };

    const [steps, hr, resting, active, total, distance, sleep, weight, fat, water, spo2, resp] =
      (await readAll()) as [
        { startTime: string; count?: number }[] | null,
        { startTime: string; samples?: { beatsPerMinute?: number }[] }[] | null,
        { time: string; beatsPerMinute?: number }[] | null,
        { startTime: string; energy?: { inKilocalories?: number } }[] | null,
        { startTime: string; energy?: { inKilocalories?: number } }[] | null,
        { startTime: string; distance?: { inMeters?: number } }[] | null,
        { startTime: string; endTime: string }[] | null,
        { time: string; weight?: { inKilograms?: number } }[] | null,
        { time: string; percentage?: number }[] | null,
        { startTime: string; volume?: { inMilliliters?: number } }[] | null,
        { time: string; percentage?: number }[] | null,
        { time: string; rate?: number }[] | null,
      ];

    // A successful query means every day in range has a real reading, so days
    // with no records are genuinely zero. A failed or ungranted one stays null.
    //
    // This holds for counters — nobody walked, nobody drank, nobody burned
    // anything above basal. It does NOT hold for sleep: see below.
    const zeroAll = (field: keyof HealthDay) => {
      for (const d of byDate.values()) (d[field] as number | null) = 0;
    };
    const addTo = (field: keyof HealthDay, day: HealthDay | undefined, v: number | null) => {
      if (!day || v == null) return;
      (day[field] as number | null) = ((day[field] as number | null) ?? 0) + v;
    };

    if (steps) {
      zeroAll('steps');
      for (const r of steps) addTo('steps', dayOf(r), num(r.count));
    }
    if (active) {
      zeroAll('activeCalories');
      for (const r of active) addTo('activeCalories', dayOf(r), num(r.energy?.inKilocalories));
    }
    if (total) {
      zeroAll('totalCalories');
      for (const r of total) addTo('totalCalories', dayOf(r), num(r.energy?.inKilocalories));
    }
    if (distance) {
      zeroAll('distanceMeters');
      for (const r of distance) addTo('distanceMeters', dayOf(r), num(r.distance?.inMeters));
    }
    // Summing raw records double-counts whenever two apps record the same
    // thing — a watch and the phone both writing steps is the common case.
    // Health Connect's aggregate call removes the overlap by data-origin
    // priority, so each counter above is replaced with its aggregate where
    // one comes back. The sum stays only as the fallback for a day the
    // aggregate call refuses, with the reason recorded.
    const counters = [
      ['Steps', 'steps', steps, (r: Record<string, unknown>) => num(r.COUNT_TOTAL)],
      [
        'ActiveCaloriesBurned',
        'activeCalories',
        active,
        (r: Record<string, unknown>) => num((r.ACTIVE_CALORIES_TOTAL as { inKilocalories?: number })?.inKilocalories),
      ],
      [
        'TotalCaloriesBurned',
        'totalCalories',
        total,
        (r: Record<string, unknown>) => num((r.ENERGY_TOTAL as { inKilocalories?: number })?.inKilocalories),
      ],
      [
        'Distance',
        'distanceMeters',
        distance,
        (r: Record<string, unknown>) => num((r.DISTANCE as { inMeters?: number })?.inMeters),
      ],
    ] as const;
    for (const [recordType, field, read, pick] of counters) {
      // Not granted, or the read failed: stays null, exactly as before.
      if (!read) continue;
      // First choice: one grouped call for the whole range, bucketed by the
      // local time each record was made in (see ./day-groups). Matches how the
      // watch app counts a day, including days walked in another time zone.
      try {
        const groups = (await aggregateGroupByPeriod({
          recordType,
          timeRangeFilter: {
            operator: 'between',
            startTime: startOfLocalDay(startDate).toISOString(),
            endTime: endOfLocalDay(endDate).toISOString(),
          },
          timeRangeSlicer: { period: 'DAYS', length: 1 },
        } as never)) as unknown as PeriodGroup[];
        for (const [key, total] of dailyTotals(groups, days, pick)) {
          const day = byDate.get(key);
          if (day) (day[field] as number | null) = total;
        }
        lastReadErrors.delete(`${recordType} (aggregate)`);
        lastReadErrors.delete(`${recordType} (grouped)`);
        continue;
      } catch (e) {
        // Fall through to one call per day, as before.
        lastReadErrors.set(`${recordType} (grouped)`, describeError(e));
      }
      for (const [key, day] of byDate) {
        try {
          const result = (await aggregateRecord({
            recordType,
            timeRangeFilter: {
              operator: 'between',
              startTime: startOfLocalDay(key).toISOString(),
              endTime: endOfLocalDay(key).toISOString(),
            },
          } as never)) as unknown as Record<string, unknown>;
          const v = pick(result);
          // An aggregate over a day with no records is 0 — a real reading.
          (day[field] as number | null) = v ?? 0;
          lastReadErrors.delete(`${recordType} (aggregate)`);
        } catch (e) {
          lastReadErrors.set(`${recordType} (aggregate)`, describeError(e));
        }
      }
    }

    if (water) {
      zeroAll('hydrationMl');
      for (const r of water) addTo('hydrationMl', dayOf(r), num(r.volume?.inMilliliters));
    }
    if (sleep) {
      // Deliberately NOT zeroed, unlike every counter above.
      //
      // Nobody sleeps zero minutes. No SleepSession for a night means nothing
      // recorded it — the watch was off the wrist, the phone was charging — not
      // that the night happened and lasted no time. Zeroing it made the rest
      // card read "0h 0m of 7h" with the worst possible grade against it, which
      // is the app inventing a measurement and then judging the user for it.
      // A night with no reading stays null and the card says so.
      // Keyed by the morning of waking, not the evening of starting — see
      // ./sleep, where that rule lives so it can be tested. A night that ends
      // before the range (the one the widened read pulled in) has no entry in
      // byDate and is dropped.
      for (const [day, minutes] of sleepMinutesByWakeDay(sleep)) {
        const bucket = byDate.get(day);
        if (bucket) bucket.sleepMinutes = minutes;
      }
    }

    if (hr) {
      // Averaged across samples, and min/max kept — a mean alone hides the
      // spike that makes a heart rate interesting.
      const acc = new Map<string, { sum: number; n: number; min: number; max: number }>();
      for (const r of hr) {
        const key = dayKey(new Date(r.startTime));
        for (const s of r.samples ?? []) {
          const bpm = num(s.beatsPerMinute);
          if (bpm == null) continue;
          const a = acc.get(key) ?? { sum: 0, n: 0, min: bpm, max: bpm };
          a.sum += bpm;
          a.n += 1;
          a.min = Math.min(a.min, bpm);
          a.max = Math.max(a.max, bpm);
          acc.set(key, a);
        }
      }
      for (const [key, a] of acc) {
        const day = byDate.get(key);
        if (!day || a.n === 0) continue;
        day.heartRateAvg = Math.round(a.sum / a.n);
        day.heartRateMin = a.min;
        day.heartRateMax = a.max;
      }
    }

    // Point measurements: the latest reading of the day, never a sum.
    const latest = (
      field: keyof HealthDay,
      records: { time: string }[] | null,
      value: (r: never) => number | null
    ) => {
      if (!records) return;
      const seen = new Map<string, { at: number; v: number }>();
      for (const r of records) {
        const v = value(r as never);
        if (v == null) continue;
        const at = new Date(r.time).getTime();
        const key = dayKey(new Date(r.time));
        const prev = seen.get(key);
        if (!prev || at >= prev.at) seen.set(key, { at, v });
      }
      for (const [key, best] of seen) {
        const day = byDate.get(key);
        if (day) (day[field] as number | null) = best.v;
      }
    };

    latest('restingHeartRate', resting, (r: { beatsPerMinute?: number }) => num(r.beatsPerMinute));
    latest('weightKg', weight, (r: { weight?: { inKilograms?: number } }) => num(r.weight?.inKilograms));
    latest('bodyFatPercent', fat, (r: { percentage?: number }) => num(r.percentage));
    latest('oxygenSaturation', spo2, (r: { percentage?: number }) => num(r.percentage));
    latest('respiratoryRate', resp, (r: { rate?: number }) => num(r.rate));

    return days.map((d) => byDate.get(d)!);
  },

  async readHeartRateSeries(startMs: number, endMs: number): Promise<HeartRateSample[]> {
    if (!(endMs > startMs)) return [];
    try {
      if (!(await ensureInitialized())) return [];
      const records = await readAll<unknown>(
        'HeartRate',
        new Date(startMs).toISOString(),
        new Date(endMs).toISOString()
      );
      const out: HeartRateSample[] = [];
      for (const r of records as { samples?: { time?: string; beatsPerMinute?: number }[] }[]) {
        for (const s of r.samples ?? []) {
          const t = s.time ? Date.parse(s.time) : NaN;
          const bpm = num(s.beatsPerMinute);
          if (Number.isFinite(t) && bpm != null && t >= startMs && t <= endMs) out.push({ t, bpm });
        }
      }
      return out.sort((a, b) => a.t - b.t);
    } catch {
      return [];
    }
  },

  async readWindow(startMs: number, endMs: number): Promise<HealthWindow> {
    const none: HealthWindow = {
      heartRateAvg: null,
      heartRateMax: null,
      activeCalories: null,
    };
    if (!(endMs > startMs)) return none;
    try {
      if (!(await ensureInitialized())) return none;
      const range = {
        operator: 'between' as const,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      };
      const read = async <T>(recordType: string): Promise<T[] | null> => {
        try {
          return await readAll<T>(recordType, range.startTime, range.endTime);
        } catch {
          return null;
        }
      };

      const [hr, active, distance] = await Promise.all([
        read<{ samples?: { beatsPerMinute?: number }[] }>('HeartRate'),
        read<{ energy?: { inKilocalories?: number } }>('ActiveCaloriesBurned'),
        read<{ distance?: { inMeters?: number } }>('Distance'),
      ]);

      const out = { ...none };

      if (hr) {
        let sum = 0;
        let n = 0;
        let max = 0;
        for (const r of hr) {
          for (const sample of r.samples ?? []) {
            const bpm = num(sample.beatsPerMinute);
            if (bpm == null) continue;
            sum += bpm;
            n += 1;
            max = Math.max(max, bpm);
          }
        }
        // No samples in the window is not a heart rate of zero — it means the
        // watch was not on. Leave it null.
        if (n > 0) {
          out.heartRateAvg = Math.round(sum / n);
          out.heartRateMax = max;
        }
      }

      if (active) {
        // A granted, empty result genuinely means nothing was burned according
        // to the platform, which is a reading of zero rather than no reading.
        let kcal = 0;
        for (const r of active) kcal += num(r.energy?.inKilocalories) ?? 0;
        out.activeCalories = kcal;
      }

      // Unlike calories, no distance records is not 0 m: most workouts have no
      // distance at all, and "0 m" would claim one was measured.
      if (distance && distance.length > 0) {
        out.distanceM = distance.reduce((m, r) => m + (num(r.distance?.inMeters) ?? 0), 0);
      }

      return out;
    } catch {
      return none;
    }
  },

  async readWorkouts(startMs: number, endMs: number): Promise<HealthWorkoutSession[]> {
    if (!(endMs > startMs)) return [];
    try {
      if (!(await ensureInitialized())) return [];
      const records = await readAll<{
        exerciseType?: number;
        title?: string;
        startTime?: string;
        endTime?: string;
        metadata?: { id?: string; dataOrigin?: string };
      }>('ExerciseSession', new Date(startMs).toISOString(), new Date(endMs).toISOString());
      lastReadErrors.delete('ExerciseSession');
      const out: HealthWorkoutSession[] = [];
      for (const r of records) {
        const start = r.startTime ? Date.parse(r.startTime) : NaN;
        const end = r.endTime ? Date.parse(r.endTime) : NaN;
        if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) continue;
        out.push({
          id: r.metadata?.id ?? `${start}-${r.exerciseType ?? 0}`,
          type: r.exerciseType ?? 0,
          title: r.title?.trim() || null,
          startMs: start,
          endMs: end,
          source: r.metadata?.dataOrigin ?? null,
        });
      }
      return out.sort((a, b) => a.startMs - b.startMs);
    } catch (e) {
      const why = describeError(e);
      lastReadErrors.set('ExerciseSession', why);
      throw new Error(`Health Connect wouldn't share your workouts: ${why}`);
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
        // Duration and title only — see the note on HealthWorkoutEntry for why
        // no energy figure goes with it.
        .map((e) => ({
          recordType: 'ExerciseSession' as const,
          exerciseType: e.exerciseType ?? EXERCISE_TYPE_STRENGTH_TRAINING,
          title: e.title,
          startTime: new Date(e.startedAt).toISOString(),
          endTime: new Date(e.endedAt).toISOString(),
          ...metadataFor(e.clientId, e.endedAt),
        }));
      if (records.length === 0) return 0;
      const ids = await insertRecords(records as never);
      return ids.length;
    } catch {
      return 0;
    }
  },

  async writeNutrition(entries: HealthNutritionEntry[]): Promise<HealthWriteResult> {
    if (entries.length === 0) return { written: 0, error: null };
    try {
      if (!(await ensureInitialized())) {
        return { written: 0, error: 'Health Connect is not available on this phone.' };
      }
      const g = (v: number | null | undefined) =>
        v == null ? undefined : { inGrams: v };
      const records = entries.map((e) => ({
        recordType: 'Nutrition' as const,
        startTime: new Date(e.at).toISOString(),
        // A meal is a point in time for our purposes; Health Connect wants a
        // span, so give it a one-minute one rather than inventing a duration.
        endTime: new Date(e.at + 60_000).toISOString(),
        name: e.name,
        energy: e.calories == null ? undefined : { inKilocalories: e.calories },
        protein: g(e.protein),
        totalFat: g(e.fat),
        totalCarbohydrate: g(e.carb),
        dietaryFiber: g(e.fiber),
        sugar: g(e.sugars),
        saturatedFat: g(e.saturatedFat),
        // Labels state sodium in milligrams; Health Connect wants grams.
        sodium: e.sodium == null ? undefined : { inGrams: e.sodium / 1000 },
        ...metadataFor(e.clientId, e.at),
      }));
      const ids = await insertRecords(records as never);
      return { written: ids.length, error: null };
    } catch (e) {
      return { written: 0, error: writeError(e, 'nutrition') };
    }
  },

  async writeWeight(entries: HealthWeightEntry[]): Promise<HealthWriteResult> {
    if (entries.length === 0) return { written: 0, error: null };
    try {
      if (!(await ensureInitialized())) {
        return { written: 0, error: 'Health Connect is not available on this phone.' };
      }
      const records = entries
        .filter((e) => e.kg > 0)
        .map((e) => ({
          recordType: 'Weight' as const,
          time: new Date(e.at).toISOString(),
          weight: { value: e.kg, unit: 'kilograms' as const },
          ...metadataFor(e.clientId, e.at),
        }));
      if (records.length === 0) return { written: 0, error: null };
      const ids = await insertRecords(records as never);
      return { written: ids.length, error: null };
    } catch (e) {
      return { written: 0, error: writeError(e, 'weight') };
    }
  },

  async writeHydration(entries: HealthHydrationEntry[]): Promise<HealthWriteResult> {
    if (entries.length === 0) return { written: 0, error: null };
    try {
      if (!(await ensureInitialized())) {
        return { written: 0, error: 'Health Connect is not available on this phone.' };
      }
      const records = entries
        .filter((e) => e.ml > 0)
        .map((e) => ({
          recordType: 'Hydration' as const,
          startTime: new Date(e.at).toISOString(),
          endTime: new Date(e.at + 60_000).toISOString(),
          volume: { value: e.ml, unit: 'milliliters' as const },
          ...metadataFor(e.clientId, e.at),
        }));
      if (records.length === 0) return { written: 0, error: null };
      const ids = await insertRecords(records as never);
      return { written: ids.length, error: null };
    } catch (e) {
      return { written: 0, error: writeError(e, 'hydration') };
    }
  },

  async deleteEntries(
    scope: 'nutrition' | 'weight' | 'hydration' | 'exercise',
    clientIds: string[]
  ): Promise<HealthWriteResult> {
    if (clientIds.length === 0) return { written: 0, error: null };
    try {
      if (!(await ensureInitialized())) {
        return { written: 0, error: 'Health Connect is not available on this phone.' };
      }
      // By client id only: the uuid list stays empty so this can never reach a
      // record another app wrote.
      await deleteRecordsByUuids(SCOPE_RECORDS[scope].recordType as never, [], clientIds);
      return { written: clientIds.length, error: null };
    } catch (e) {
      return { written: 0, error: writeError(e, `the deleted ${scope} entry`) };
    }
  },

  async readNewestSteps(): Promise<NewestSteps | null> {
    const day = dayKey(new Date());
    const rows = await readAll<StepRow>('Steps', startOfLocalDay(day).toISOString(), endOfLocalDay(day).toISOString());
    const fresh = stepFreshness(rows, new Date(), 1);
    if (!fresh.newestEnd) return null;
    return { endMs: fresh.newestEnd.getTime(), source: fresh.newest[0]?.metadata?.dataOrigin ?? null };
  },

  openSettings(): void {
    openHealthConnectSettings();
  },
};

/** One honest sentence. A silent no-op here would look like a successful sync. */
function writeError(e: unknown, what: string): string {
  const detail = e instanceof Error ? e.message : String(e);
  if (/permission/i.test(detail)) {
    return `Health Connect has not granted permission to write ${what}.`;
  }
  return `Could not write ${what} to Health Connect: ${detail}`;
}

/**
 * Every step of the steps read, reported separately.
 *
 * The provider above deliberately collapses failures into "not connected",
 * which is right for the card and useless for finding out why. This runs the
 * same sequence with nothing swallowed, so a report can say which step failed
 * rather than leaving a dash to be interpreted.
 *
 * Deliberately does not reuse `initialized`: a cached true from earlier tells
 * us nothing about whether initialize() works now.
 */
export async function diagnoseHealthConnect(): Promise<DiagnosticStep[]> {
  const out: DiagnosticStep[] = [];
  const add = (label: string, value: string, ok: boolean | null = null) =>
    out.push({ label, value, ok });

  let status: number | null = null;
  try {
    status = await getSdkStatus();
    const names: Record<number, string> = {
      [SdkAvailabilityStatus.SDK_AVAILABLE]: 'available',
      [SdkAvailabilityStatus.SDK_UNAVAILABLE]: 'no Health Connect on this phone',
      [SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED]: 'needs updating',
    };
    add('SDK status', `${names[status] ?? 'unknown'} (${status})`,
      status === SdkAvailabilityStatus.SDK_AVAILABLE);
  } catch (e) {
    add('SDK status', describeError(e), false);
    return out;
  }

  let started = false;
  try {
    started = await initialize();
    add('initialize()', started ? 'true' : 'returned false', started);
  } catch (e) {
    // The case the card cannot distinguish from a refused permission.
    add('initialize()', `threw — ${describeError(e)}`, false);
    return out;
  }
  if (!started) return out;

  let granted: Granted = [];
  try {
    granted = (await getGrantedPermissions()) as Granted;
    add('Permissions granted', `${granted.length} of ${PERMISSIONS.length}`, granted.length > 0);
  } catch (e) {
    add('Permissions granted', `threw — ${describeError(e)}`, false);
    return out;
  }

  const grants = grantsFrom(granted);
  const readsSteps = grants.read.includes('steps');
  add('Steps permission', readsSteps ? 'granted' : 'NOT granted', readsSteps);
  add('All read scopes', grants.read.join(', ') || 'none', null);

  // The exact window the real read uses, so a timezone fault is visible.
  const day = dayKey(new Date());
  const start = startOfLocalDay(day);
  const end = endOfLocalDay(day);
  add('Day queried', day, null);
  add('Range sent', `${start.toISOString()} -> ${end.toISOString()}`, null);
  add('Device time', `${new Date().toString()}`, null);

  if (!readsSteps) return out;

  try {
    const records = await readAll<unknown>('Steps', start.toISOString(), end.toISOString());
    const rows = (records ?? []) as StepRow[];
    const total = rows.reduce((n, r) => n + (typeof r.count === 'number' ? r.count : 0), 0);
    add('Steps records', String(rows.length), rows.length > 0);
    add('Steps total', String(total), null);
    // Which app wrote them, and how recently. This app re-reads every minute;
    // steps that show up an hour late are the writing app's sync schedule,
    // and this is the line that shows it.
    const fresh = stepFreshness(rows, new Date());
    if (fresh.newestEnd) {
      add(
        'Newest step record',
        `ends ${fresh.newestEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${fresh.minutesOld} min ago`,
        null
      );
    }
    for (const src of fresh.sources) {
      add('  written by', `${sourceName(src.origin)}: ${src.records} records, ${src.steps} steps`, null);
    }
    for (const r of fresh.newest) {
      add('  newest', `${r.startTime ?? '?'} -> ${r.endTime ?? '?'} count=${r.count ?? '?'}`, null);
    }
  } catch (e) {
    add('Steps read', `threw — ${describeError(e)}`, false);
  }

  // The direct read above is NOT the path the Home card uses. The card goes
  // through readDays, which reads every record type and aggregates them. The
  // first report showed the direct read returning 5170 steps on a phone whose
  // card showed nothing, so the two have to be compared side by side rather
  // than one of them trusted.
  try {
    const [today] = await healthConnectProvider.readDays(day, day);
    add(
      'readDays steps (what the card shows)',
      today?.steps == null ? 'null — this is the dash' : String(today.steps),
      today?.steps != null
    );
  } catch (e) {
    add('readDays', `threw — ${describeError(e)}`, false);
  }

  // Anything tryRead swallowed on that call. Empty is the good case.
  for (const [type, reason] of lastReadErrors) {
    add(`  ${type} read failed`, reason, false);
  }

  return out;
}
