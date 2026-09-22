import { isOpenGymBackup, parseOpenGym } from './opengym';
/**
 * Reading a workout history out of someone else's export.
 *
 * Three shapes are accepted: Hevy's CSV, a generic CSV, and this app's own
 * JSON export. Pure — text in, rows out — because every failure here is a
 * parsing failure and they are all reproducible without a phone.
 *
 * The rule throughout: a field that cannot be read is `null`, and a row that
 * cannot be understood is reported, not silently dropped and not filled with
 * zeroes. An importer that quietly loses half a training history is worse than
 * one that refuses the file.
 */

export type ImportedSet = {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Start time as the file gave it, when it gave one. */
  startedAt: string | null;
  workoutName: string | null;
  exerciseName: string;
  setIndex: number;
  weight: number | null;
  /** The unit the file used. Converted on import, never assumed. */
  weightUnit: 'kg' | 'lb' | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
  /** A warm-up, where the source said so. Not a working set. */
  isWarmup?: boolean;
};

/**
 * A workout template, as opposed to a workout that happened.
 *
 * A CSV of sets has no such thing; only a full backup does. Kept separate from
 * ImportedSet for that reason — a routine is a plan, and importing one as if it
 * were training that took place would put lifts on the muscle map that nobody
 * did.
 */
export type ImportedRoutineExercise = {
  exerciseName: string;
  targetSets: number | null;
  targetReps: number | null;
  restSeconds: number | null;
  /** Anything the schema has no column for: target weight, cardio settings,
   *  and whatever the user wrote against the exercise. */
  notes: string | null;
};

export type ImportedRoutine = {
  name: string;
  notes: string | null;
  exercises: ImportedRoutineExercise[];
};

/** An exercise the source app defined itself, with whatever it knew about it. */
export type ImportedExercise = {
  name: string;
  equipment: string | null;
  /** Already mapped onto this app's muscle groups; unmappable ones are dropped. */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** The source's own grouping, e.g. "upper legs". Descriptive, not a muscle. */
  category: string | null;
};

/** A weigh-in from the source app's own body-weight log. */
export type ImportedWeight = {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Epoch milliseconds when the file gave one, else null. */
  at: number | null;
  value: number;
  unit: 'kg' | 'lb';
};

/**
 * Everything in a backup that is not a set.
 *
 * Optional throughout: a CSV of sets carries none of it, and an empty list is
 * a different thing from a format that cannot express the idea at all.
 */
export type ImportExtras = {
  routines: ImportedRoutine[];
  exercises: ImportedExercise[];
  weights: ImportedWeight[];
};

export type ImportReport = {
  sets: ImportedSet[];
  /** One line per row that could not be read, with the reason. */
  skipped: { row: number; reason: string }[];
  format: 'hevy-csv' | 'csv' | 'json';
  /** Routines, custom exercises and weigh-ins, when the format has them. */
  extras?: ImportExtras;
};

export type ImportResult = ImportReport | { error: string };

/* eslint-disable-next-line import/first */

/** RFC4180-ish: quoted fields, doubled quotes, embedded newlines and commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const src = text.replace(/^﻿/, ''); // Excel writes a BOM

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` from the formats these exports actually use. */
export function toIsoDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;

  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO, optionally with a time
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Hevy writes "12 Sep 2025, 18:04" and variants.
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) return `${m[3]}-${pad(mo + 1)}-${pad(Number(m[1]))}`;
  }

  // Slashed dates are ambiguous. Where one field is over 12 the order is
  // certain; where both could be a month the US reading is taken, which is what
  // these exports use.
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) return `${m[3]}-${pad(b)}-${pad(a)}`;
    if (b > 12 && a <= 12) return `${m[3]}-${pad(a)}-${pad(b)}`;
    if (a <= 12 && b <= 12) return `${m[3]}-${pad(a)}-${pad(b)}`;
  }
  return null;
}

function headerIndex(header: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[\s_]+/g, '_');
    if (key && !(key in out)) out[key] = i;
  });
  return out;
}

const pick = (cols: string[], idx: Record<string, number>, ...names: string[]) => {
  for (const n of names) {
    const i = idx[n];
    if (i != null && cols[i] != null && cols[i].trim() !== '') return cols[i];
  }
  return undefined;
};

function unit(raw: string | undefined): 'kg' | 'lb' | null {
  const t = raw?.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith('kg')) return 'kg';
  if (t.startsWith('lb') || t === 'pounds') return 'lb';
  return null;
}

/**
 * A CSV of sets. Handles Hevy's column names and the common variants other
 * apps use; anything with a date, an exercise and a weight or reps will import.
 */
export function parseSetCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: 'That file has no rows under its header.' };

  const idx = headerIndex(rows[0]);
  const hasExercise = 'exercise_title' in idx || 'exercise_name' in idx || 'exercise' in idx;
  const hasDate = 'start_time' in idx || 'date' in idx || 'workout_date' in idx;
  if (!hasExercise || !hasDate) {
    return {
      error:
        'That CSV has no exercise or date column. Expected something like "exercise_title" and "start_time".',
    };
  }
  const hevy = 'exercise_title' in idx && 'start_time' in idx;

  const sets: ImportedSet[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const counter = new Map<string, number>();

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const rawDate = pick(cols, idx, 'start_time', 'date', 'workout_date');
    const date = toIsoDay(rawDate);
    const exerciseName = pick(cols, idx, 'exercise_title', 'exercise_name', 'exercise')?.trim();

    if (!exerciseName) {
      skipped.push({ row: r + 1, reason: 'no exercise name' });
      continue;
    }
    if (!date) {
      skipped.push({ row: r + 1, reason: rawDate ? `unreadable date "${rawDate}"` : 'no date' });
      continue;
    }

    const weight = num(pick(cols, idx, 'weight_kg', 'weight_lbs', 'weight'));
    const reps = num(pick(cols, idx, 'reps', 'repetitions'));
    if (weight == null && reps == null) {
      skipped.push({ row: r + 1, reason: 'no weight and no reps' });
      continue;
    }

    // The unit comes from the column name where the file encodes it there, then
    // from a unit column, and stays null rather than being assumed.
    let weightUnit: 'kg' | 'lb' | null = null;
    if ('weight_kg' in idx && pick(cols, idx, 'weight_kg') != null) weightUnit = 'kg';
    else if ('weight_lbs' in idx && pick(cols, idx, 'weight_lbs') != null) weightUnit = 'lb';
    else weightUnit = unit(pick(cols, idx, 'weight_unit', 'unit'));

    const key = `${date}|${exerciseName}`;
    const n = (counter.get(key) ?? 0) + 1;
    counter.set(key, n);

    sets.push({
      date,
      startedAt: rawDate?.trim() || null,
      workoutName: pick(cols, idx, 'title', 'workout_name', 'workout')?.trim() || null,
      exerciseName,
      setIndex: num(pick(cols, idx, 'set_index', 'set')) ?? n,
      weight,
      weightUnit,
      reps,
      rpe: num(pick(cols, idx, 'rpe')),
      notes: pick(cols, idx, 'notes', 'exercise_notes')?.trim() || null,
    });
  }

  if (sets.length === 0) return { error: 'No rows in that file could be read as a set.' };
  return { sets, skipped, format: hevy ? 'hevy-csv' : 'csv' };
}

function findSetRows(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  for (const key of ['sets', 'workouts', 'sessions', 'rows', 'data', 'history']) {
    if (Array.isArray(o[key])) return o[key] as unknown[];
  }
  const tables = o.tables;
  if (tables && typeof tables === 'object') {
    const t = tables as Record<string, unknown>;
    if (Array.isArray(t.sets)) return t.sets as unknown[];
  }
  return null;
}

/**
 * Flattens a nested export: workouts, each with exercises, each with sets.
 *
 * This is the shape most apps actually write — openGym among them — and the
 * first version of this importer only handled a flat array of sets, so those
 * files came back as "no sets found". The date comes from the workout and the
 * exercise name from the exercise, because the set itself carries neither.
 */
function flattenWorkouts(rows: unknown[]): Record<string, unknown>[] | null {
  const out: Record<string, unknown>[] = [];
  let sawNesting = false;

  for (const w of rows) {
    if (!w || typeof w !== 'object') continue;
    const workout = w as Record<string, unknown>;
    const exList =
      (Array.isArray(workout.exercises) && workout.exercises) ||
      (Array.isArray(workout.entries) && workout.entries) ||
      (Array.isArray(workout.items) && workout.items) ||
      null;
    if (!exList) continue;
    sawNesting = true;

    const workoutDate =
      pickStr(workout, 'date', 'startedAt', 'start_time', 'startTime', 'performed_at', 'created_at');
    const workoutName = pickStr(workout, 'name', 'title', 'routine', 'workoutName');

    for (const e of exList) {
      if (!e || typeof e !== 'object') continue;
      const ex = e as Record<string, unknown>;
      const exerciseName =
        pickStr(ex, 'name', 'exercise', 'exerciseName', 'title') ??
        (typeof ex.exercise === 'object' && ex.exercise
          ? pickStr(ex.exercise as Record<string, unknown>, 'name', 'title')
          : undefined);

      const setList =
        (Array.isArray(ex.sets) && ex.sets) ||
        (Array.isArray(ex.logs) && ex.logs) ||
        (Array.isArray(ex.entries) && ex.entries) ||
        null;

      // An exercise with no set list is still one performance of it.
      const asSets: unknown[] = setList ?? [ex];

      for (const [i, st] of asSets.entries()) {
        if (!st || typeof st !== 'object') continue;
        const set = st as Record<string, unknown>;
        out.push({
          ...set,
          exerciseName: exerciseName ?? pickStr(set, 'exerciseName', 'exercise', 'name'),
          date: pickStr(set, 'date', 'startedAt', 'start_time') ?? workoutDate,
          workoutName,
          setIndex: typeof set.setIndex === 'number' ? set.setIndex : i + 1,
        });
      }
    }
  }
  return sawNesting ? out : null;
}

function pickStr(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Epoch timestamps turn up as numbers in these exports.
      const d = new Date(v > 1e12 ? v : v * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return undefined;
}

/** This app's own JSON export, or anything with the same set shape. */
export function parseSetJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }

  // openGym writes its own shape — ids instead of names, a top-level unit —
  // and needs its own reader rather than a looser generic one.
  if (isOpenGymBackup(data)) return parseOpenGym(data);

  let rows = findSetRows(data);
  if (!rows) {
    return {
      error:
        'No sets found in that JSON. Expected an array of sets, a nested workouts export, or an export with a "sets" table.',
    };
  }
  // A nested export — workouts containing exercises containing sets — is
  // flattened first. Most apps write that shape, not a flat set list.
  const flattened = flattenWorkouts(rows);
  if (flattened && flattened.length > 0) rows = flattened;

  const sets: ImportedSet[] = [];
  const skipped: { row: number; reason: string }[] = [];
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      skipped.push({ row: i + 1, reason: 'not an object' });
      return;
    }
    const r = row as Record<string, unknown>;
    const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : undefined);
    const nu = (k: string) =>
      typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : null;

    const exerciseName = (str('exerciseName') ?? str('exercise') ?? str('name') ?? '').trim();
    const date = toIsoDay(str('date') ?? str('loggedAt') ?? str('startedAt') ?? str('start_time'));
    if (!exerciseName) {
      skipped.push({ row: i + 1, reason: 'no exercise name' });
      return;
    }
    if (!date) {
      skipped.push({ row: i + 1, reason: 'no readable date' });
      return;
    }
    sets.push({
      date,
      startedAt: str('startedAt') ?? str('start_time') ?? null,
      workoutName: str('workoutName') ?? str('title') ?? null,
      exerciseName,
      setIndex: nu('setIndex') ?? nu('set') ?? sets.length + 1,
      weight: nu('weight') ?? nu('weightKg') ?? nu('weight_kg'),
      weightUnit: unit(str('weightUnit') ?? str('unit')),
      reps: nu('reps'),
      rpe: nu('rpe'),
      notes: str('notes') ?? null,
    });
  });

  if (sets.length === 0) return { error: 'No rows in that JSON could be read as a set.' };
  return { sets, skipped, format: 'json' };
}

/** Picks the parser from the filename, falling back to sniffing the content. */
export function parseImport(filename: string, text: string): ImportResult {
  const name = filename.toLowerCase();
  if (name.endsWith('.json')) return parseSetJson(text);
  if (name.endsWith('.csv')) return parseSetCsv(text);
  const head = text.trimStart();
  return head.startsWith('{') || head.startsWith('[') ? parseSetJson(text) : parseSetCsv(text);
}
