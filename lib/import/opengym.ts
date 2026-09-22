/**
 * openGym's backup format.
 *
 * Its own shape, not a set list:
 *
 *   { unit: "lb",
 *     customEx: [{ id, n, tg, sm, bp, eq, desc, primaries, secondaries }],
 *     routines: [{ id, name, ex: [{ id, sets, reps, weight, mode, restSec }] }],
 *     bodyweight: [{ d: "2025-09-07", w: 288, t: 1757427286585 }],
 *     workouts: [{ d: "2024-06-24", start, end, name,
 *                  entries: [{ id, sets: [{ w, r, done }] }] }] }
 *
 * Four of those are worth having and only `workouts` used to be read. A backup
 * holds the user's own routines, the exercises they defined themselves, and a
 * year of weigh-ins; dropping all three and calling it an import was most of
 * the file on the floor.
 *
 * Two things make it awkward, and both are handled here rather than in the
 * generic parser:
 *
 *   - An entry names its exercise by **id**, not by name. Custom exercises are
 *     defined in `customEx`, but the built-in ones reference openGym's own
 *     catalogue, which the backup does not contain. Those keep their id as a
 *     placeholder name so the sets, dates, weights and reps — the part worth
 *     importing — are not thrown away over a missing label.
 *   - The weight unit is a single top-level setting, not per set.
 */
import { toMuscleGroup } from '../ai-exercise';
import type {
  ImportExtras,
  ImportResult,
  ImportedExercise,
  ImportedRoutine,
  ImportedRoutineExercise,
  ImportedSet,
  ImportedWeight,
} from './parse';

type OgSet = { w?: unknown; r?: unknown; done?: unknown; phase?: unknown };
type OgEntry = { id?: unknown; sets?: unknown };
type OgWorkout = { d?: unknown; start?: unknown; name?: unknown; entries?: unknown };

export type OpenGymReport = {
  /** Exercises referenced by an id the backup has no name for. */
  unnamedIds: string[];
  namedCount: number;
  /** Custom exercises whose muscles the backup did not record. */
  exercisesWithoutMuscles: number;
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** True for something shaped like an openGym backup. */
export function isOpenGymBackup(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.workouts)) return false;
  // Its workouts carry `d` and `entries`, which no other export here uses.
  const first = o.workouts.find((w) => w && typeof w === 'object') as OgWorkout | undefined;
  return first != null && 'entries' in first && ('d' in first || 'start' in first);
}

function isoDay(w: OgWorkout): string | null {
  if (typeof w.d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(w.d)) return w.d.slice(0, 10);
  const start = num(w.start);
  if (start != null) {
    // Epoch milliseconds. Converted in local time, so a late-evening session
    // keeps the day the user trained on.
    const date = new Date(start);
    if (!Number.isNaN(date.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    }
  }
  return null;
}

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

/** A positive whole number, or null. Zero sets is not a plan. */
const positiveInt = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n > 0 ? Math.round(n) : null;
};

/**
 * Custom exercises, with whatever the backup knew about them.
 *
 * Muscles come only from fields where the user actually named a muscle — `tg`,
 * `sm`, `primaries`, `secondaries`. `bp` ("upper legs", "waist") is a body
 * region, not a muscle: turning it into one would colour the muscle map with a
 * guess, so it goes in `category` where it is only ever read as a label.
 */
function readCustomExercises(raw: unknown): ImportedExercise[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedExercise[] = [];

  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const rec = c as Record<string, unknown>;
    const name = str(rec.n);
    if (!name) continue;

    const groups = (value: unknown): string[] => {
      const list = Array.isArray(value) ? value : value == null ? [] : [value];
      const mapped: string[] = [];
      for (const item of list) {
        const text = str(item);
        const group = text ? toMuscleGroup(text) : null;
        if (group && !mapped.includes(group)) mapped.push(group);
      }
      return mapped;
    };

    // `primaries`/`secondaries` are the newer fields and win where present;
    // `tg`/`sm` are the older spelling of the same thing.
    const primary = groups(rec.primaries).length > 0 ? groups(rec.primaries) : groups(rec.tg);
    const secondaryAll =
      groups(rec.secondaries).length > 0 ? groups(rec.secondaries) : groups(rec.sm);
    // A muscle cannot be both, and primary wins — the same rule the AI
    // identifier follows, so an exercise reads the same however it arrived.
    const secondary = secondaryAll.filter((m) => !primary.includes(m));

    const equipment = str(rec.eq);
    const description = str(rec.desc);

    out.push({
      name,
      // "custom" is openGym saying it has no equipment for this, not a kind of
      // equipment. Recording it would put "custom" in the equipment filter.
      equipment: equipment && equipment !== 'custom' ? equipment : null,
      primaryMuscles: primary,
      secondaryMuscles: secondary,
      instructions: description ? [description] : [],
      category: str(rec.bp),
    });
  }
  return out;
}

/**
 * One line of extra detail for a routine exercise.
 *
 * routine_exercises has columns for sets, reps and rest and nothing else, but
 * the backup also carries a target weight, cardio settings and the user's own
 * note. Those go into `notes` rather than being dropped — a note the user wrote
 * about their own programming is not ours to throw away.
 */
function routineExerciseNote(e: Record<string, unknown>, unit: 'kg' | 'lb'): string | null {
  const bits: string[] = [];

  const minutes = num(e.min);
  const seconds = num(e.sec);
  const speed = num(e.speed);
  if (minutes != null) bits.push(`${minutes} min`);
  else if (seconds != null) bits.push(`${seconds} sec`);
  if (speed != null) bits.push(`speed ${speed}`);

  // A target of zero is bodyweight, which is worth nothing as a note.
  const weight = num(e.weight);
  if (weight != null && weight > 0) bits.push(`${weight} ${unit} target`);

  const increment = num(e.inc);
  if (increment != null && increment > 0) bits.push(`+${increment} ${unit} per session`);

  const note = str(e.note);
  const head = bits.join(' · ');
  if (head && note) return `${head}\n${note}`;
  return note ?? (head || null);
}

/**
 * The user's own routines.
 *
 * Exercises are referenced by the same ids the workout history uses, so the
 * names resolve the same way and an imported routine points at the same
 * exercise rows as the sessions that ran it.
 */
function readRoutines(
  raw: unknown,
  nameFor: (id: string) => string,
  unit: 'kg' | 'lb'
): ImportedRoutine[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedRoutine[] = [];

  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const name = str(rec.name);
    if (!name) continue;

    const exercises: ImportedRoutineExercise[] = [];
    const list = Array.isArray(rec.ex) ? rec.ex : [];
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const entry = e as Record<string, unknown>;
      const id = str(entry.id);
      if (!id) continue;
      exercises.push({
        exerciseName: nameFor(id),
        targetSets: positiveInt(entry.sets),
        // Cardio entries have minutes and a speed instead of reps. Recording a
        // rep target they never had would be inventing the plan.
        targetReps: positiveInt(entry.reps),
        restSeconds: positiveInt(entry.restSec),
        notes: routineExerciseNote(entry, unit),
      });
    }

    // An empty routine is a name with no plan behind it; there is nothing to
    // run and nothing to import.
    if (exercises.length === 0) continue;
    out.push({ name, notes: null, exercises });
  }
  return out;
}

/** The body-weight log: `{ d, w, t }` in the backup's single weight unit. */
function readWeights(raw: unknown, unit: 'kg' | 'lb'): ImportedWeight[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedWeight[] = [];

  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const rec = b as Record<string, unknown>;
    const value = num(rec.w);
    if (value == null || value <= 0) continue;

    const day = str(rec.d);
    const date = day && /^\d{4}-\d{2}-\d{2}/.test(day) ? day.slice(0, 10) : null;
    const at = num(rec.t);
    if (!date && at == null) continue;

    out.push({
      date: date ?? dayKeyOf(new Date(at!)),
      at,
      value,
      unit,
    });
  }
  return out;
}

/** Local calendar day for an instant. Local, so an evening weigh-in keeps its day. */
function dayKeyOf(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function parseOpenGym(data: unknown): ImportResult & { openGym?: OpenGymReport } {
  if (!isOpenGymBackup(data)) {
    return { error: 'That does not look like an openGym backup.' };
  }
  const o = data as Record<string, unknown>;

  const unit: 'kg' | 'lb' = o.unit === 'kg' ? 'kg' : 'lb';

  // Custom exercises carry their own names; built-ins do not.
  const names = new Map<string, string>();
  if (Array.isArray(o.customEx)) {
    for (const c of o.customEx) {
      if (!c || typeof c !== 'object') continue;
      const rec = c as Record<string, unknown>;
      const id = typeof rec.id === 'string' ? rec.id : null;
      const name = typeof rec.n === 'string' ? rec.n.trim() : '';
      if (id && name) names.set(id, name);
    }
  }

  const sets: ImportedSet[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const unnamed = new Set<string>();
  let row = 0;

  for (const raw of o.workouts as unknown[]) {
    row += 1;
    if (!raw || typeof raw !== 'object') {
      skipped.push({ row, reason: 'not a workout' });
      continue;
    }
    const w = raw as OgWorkout;
    const date = isoDay(w);
    if (!date) {
      skipped.push({ row, reason: 'no readable date' });
      continue;
    }
    const workoutName = typeof w.name === 'string' && w.name.trim() ? w.name.trim() : null;
    const entries = Array.isArray(w.entries) ? w.entries : [];
    if (entries.length === 0) {
      skipped.push({ row, reason: 'no exercises' });
      continue;
    }

    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const entry = e as OgEntry;
      const id = typeof entry.id === 'string' ? entry.id : null;
      if (!id) continue;

      let exerciseName = names.get(id);
      if (!exerciseName) {
        unnamed.add(id);
        // Keeping the id as the name loses the label but keeps the training.
        exerciseName = `openGym ${id}`;
      }

      const entrySets = Array.isArray(entry.sets) ? entry.sets : [];
      let index = 0;
      for (const st of entrySets) {
        if (!st || typeof st !== 'object') continue;
        const s = st as OgSet;
        // openGym keeps planned sets that were never performed. Importing them
        // would invent training that did not happen.
        if (s.done === false) continue;
        const weight = num(s.w);
        const reps = num(s.r);
        if (weight == null && reps == null) continue;
        index += 1;
        sets.push({
          date,
          startedAt: num(w.start) != null ? new Date(num(w.start)!).toISOString() : null,
          workoutName,
          exerciseName,
          setIndex: index,
          weight,
          weightUnit: weight == null ? null : unit,
          reps,
          rpe: null,
          notes: null,
          // openGym marks warm-ups; dropping the flag would count them as
          // working sets, inflating volume and the muscle map and letting a
          // light warm-up be judged for a personal record.
          isWarmup: s.phase === 'warmup',
        });
      }
    }
  }

  // Everything in the backup that is not a set: the user's routines, the
  // exercises they defined, and their weigh-ins. Read after the history so the
  // same id-to-name map is used and a routine points at the same exercises.
  const nameFor = (id: string): string => {
    const known = names.get(id);
    if (known) return known;
    unnamed.add(id);
    return `openGym ${id}`;
  };
  const extras: ImportExtras = {
    routines: readRoutines(o.routines, nameFor, unit),
    exercises: readCustomExercises(o.customEx),
    weights: readWeights(o.bodyweight, unit),
  };

  const hasExtras =
    extras.routines.length > 0 || extras.exercises.length > 0 || extras.weights.length > 0;

  if (sets.length === 0 && !hasExtras) {
    return { error: 'That openGym backup has no completed sets in it.' };
  }

  return {
    sets,
    skipped,
    format: 'json',
    extras,
    openGym: {
      unnamedIds: [...unnamed].sort(),
      namedCount: names.size,
      exercisesWithoutMuscles: extras.exercises.filter(
        (e) => e.primaryMuscles.length === 0 && e.secondaryMuscles.length === 0
      ).length,
    },
  };
}
