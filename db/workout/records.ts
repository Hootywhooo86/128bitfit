import {
  and,
  eq,
  lt,
  ne,
} from 'drizzle-orm';
import { db } from '../client';
import { distanceRecord } from '@/lib/track-mode';
import {
  livePr,
  prFor,
  recordFrom,
  type ExerciseRecord,
  type PrKind,
  type PrResult,
  type RecordSet,
} from '@/lib/personal-records';
import {
  exercises,
  sessionExercises,
  sets,
  workoutSessions,
} from '../schema';

/**
 * The record an exercise held before a given moment.
 *
 * `before` excludes the set being judged and everything after it, or a set
 * would beat itself and every lift would be a trophy. Warm-ups are left out:
 * they are not attempts at anything.
 */
/**
 * The working sets a record is built from. Drop and rest-pause sets are out:
 * a rest-pause mini-set's reps would inflate the estimated 1RM, and neither is
 * a lift anyone would call their best.
 */
async function recordSetsBefore(exerciseId: string, before: Date | null): Promise<RecordSet[]> {
  const rows = await db
    .select({
      weight: sets.weight,
      reps: sets.reps,
      unit: sets.weightUnit,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal'),
        eq(workoutSessions.status, 'completed'),
        ...(before ? [lt(workoutSessions.startedAt, before)] : [])
      )
    );
  return rows.map(toRecordSet);
}

const toRecordSet = (r: { weight: number | null; reps: number | null; unit: string | null }): RecordSet => ({
  weight: r.weight,
  reps: r.reps,
  unit: r.unit === 'kg' ? 'kg' : 'lb',
});

export async function recordBefore(
  exerciseId: string,
  before: Date | null
): Promise<ExerciseRecord> {
  return recordFrom(await recordSetsBefore(exerciseId, before));
}

/**
 * Whether the set just ticked is a record — for the trophy during the workout.
 * Read after the tick has saved, so it never slows logging. See livePr.
 */
export async function liveRecordFor(setId: string): Promise<PrResult> {
  const [row] = await db
    .select({
      weight: sets.weight,
      reps: sets.reps,
      distanceM: sets.distanceM,
      unit: sets.weightUnit,
      isWarmup: sets.isWarmup,
      setType: sets.setType,
      exerciseId: sessionExercises.exerciseId,
      sessionId: sessionExercises.sessionId,
      startedAt: workoutSessions.startedAt,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(eq(sets.id, setId))
    .limit(1);
  if (!row || row.isWarmup || row.setType !== 'normal') return { kinds: [], note: null };

  // A carry or sled: heaviest load moved, or furthest at that load.
  if (row.distanceM != null) {
    const before = await db
      .select({ weight: sets.weight, distanceM: sets.distanceM, completed: sets.completed, isWarmup: sets.isWarmup })
      .from(sets)
      .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(sessionExercises.exerciseId, row.exerciseId),
          eq(sets.completed, true),
          eq(sets.setType, 'normal'),
          ne(sets.id, setId),
          ne(workoutSessions.status, 'discarded')
        )
      );
    const note = distanceRecord(row, before, row.unit ?? 'lb');
    return note ? { kinds: ['weight'], note } : { kinds: [], note: null };
  }

  const today = await db
    .select({ weight: sets.weight, reps: sets.reps, unit: sets.weightUnit })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .where(
      and(
        eq(sessionExercises.sessionId, row.sessionId),
        eq(sessionExercises.exerciseId, row.exerciseId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal'),
        ne(sets.id, setId)
      )
    );

  return livePr(
    toRecordSet(row),
    await recordSetsBefore(row.exerciseId, row.startedAt ?? null),
    today.map(toRecordSet)
  );
}

export type SessionPr = {
  exerciseId: string;
  exerciseName: string;
  set: { weight: number | null; reps: number | null; unit: 'kg' | 'lb' };
  kinds: PrKind[];
  note: string;
};

/**
 * Which sets in a finished session were records.
 *
 * Judged against everything logged before that session started, so a session's
 * own later sets cannot make its earlier ones look worse and re-running the
 * same session gives the same answer every time.
 *
 * One record per exercise: three sets of a new best is one achievement, and
 * three trophies for it would make the word meaningless.
 */
export async function personalRecordsIn(sessionId: string): Promise<SessionPr[]> {
  const [session] = await db
    .select({ startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  if (!session) return [];

  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      exerciseName: exercises.name,
      weight: sets.weight,
      reps: sets.reps,
      unit: sets.weightUnit,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(
        eq(sessionExercises.sessionId, sessionId),
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(sets.setType, 'normal')
      )
    );

  const byExercise = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push(r);
    byExercise.set(r.exerciseId, list);
  }

  const out: SessionPr[] = [];
  for (const [exerciseId, list] of byExercise) {
    const previous = await recordBefore(exerciseId, session.startedAt ?? null);
    let best: SessionPr | null = null;
    for (const r of list) {
      const set = {
        weight: r.weight,
        reps: r.reps,
        unit: r.unit === 'kg' ? ('kg' as const) : ('lb' as const),
      };
      const pr = prFor(set, previous);
      if (pr.kinds.length === 0 || !pr.note) continue;
      // Keep the heaviest of the session's records for this exercise.
      if (best == null || (set.weight ?? 0) > (best.set.weight ?? 0)) {
        best = {
          exerciseId,
          exerciseName: r.exerciseName ?? 'Exercise',
          set,
          kinds: pr.kinds,
          note: pr.note,
        };
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

export type ExerciseBest = {
  exerciseId: string;
  name: string;
  record: ExerciseRecord;
};

/** Every exercise's best, heaviest first, for the Personal records screen. */
export async function listPersonalRecords(): Promise<ExerciseBest[]> {
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      name: exercises.name,
      weight: sets.weight,
      reps: sets.reps,
      unit: sets.weightUnit,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(
        eq(sets.completed, true),
        eq(sets.isWarmup, false),
        eq(workoutSessions.status, 'completed')
      )
    );

  const grouped = new Map<string, { name: string; sets: RecordSet[] }>();
  for (const r of rows) {
    const g = grouped.get(r.exerciseId) ?? { name: r.name ?? 'Exercise', sets: [] };
    g.sets.push({
      weight: r.weight,
      reps: r.reps,
      unit: r.unit === 'kg' ? 'kg' : 'lb',
    });
    grouped.set(r.exerciseId, g);
  }

  return [...grouped.entries()]
    .map(([exerciseId, g]) => ({ exerciseId, name: g.name, record: recordFrom(g.sets) }))
    .filter((e) => e.record.heaviest != null)
    .sort(
      (a, b) =>
        (b.record.bestEstimate?.oneRepMax ?? 0) - (a.record.bestEstimate?.oneRepMax ?? 0) ||
        (b.record.heaviest?.weight ?? 0) - (a.record.heaviest?.weight ?? 0) ||
        a.name.localeCompare(b.name)
    );
}
