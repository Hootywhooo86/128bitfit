/**
 * openGym's backup format.
 *
 * Its own shape, not a set list:
 *
 *   { unit: "lb",
 *     customEx: [{ id, n, tg, sm, ... }],
 *     workouts: [{ d: "2024-06-24", start, end, name,
 *                  entries: [{ id, sets: [{ w, r, done }] }] }] }
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
import type { ImportResult, ImportedSet } from './parse';

type OgSet = { w?: unknown; r?: unknown; done?: unknown };
type OgEntry = { id?: unknown; sets?: unknown };
type OgWorkout = { d?: unknown; start?: unknown; name?: unknown; entries?: unknown };

export type OpenGymReport = {
  /** Exercises referenced by an id the backup has no name for. */
  unnamedIds: string[];
  namedCount: number;
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
        });
      }
    }
  }

  if (sets.length === 0) {
    return { error: 'That openGym backup has no completed sets in it.' };
  }

  return {
    sets,
    skipped,
    format: 'json',
    openGym: {
      unnamedIds: [...unnamed].sort(),
      namedCount: names.size,
    },
  };
}
