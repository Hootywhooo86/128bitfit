import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/**
 * loadActiveWorkout was rewritten from several queries per exercise to a few
 * for the whole workout. `oneByOne` below is the old implementation, kept as
 * the reference: the new one must return exactly what it did, on a history
 * built to include everything that should be left out (warm-ups, drop sets,
 * abandoned sessions, the session itself) and an exercise done twice in one
 * workout.
 */
const sqlite = new DatabaseSync(':memory:');
const proxy = drizzle(
  async (query, params, method) => {
    const stmt = sqlite.prepare(query);
    if (method === 'run') {
      stmt.run(...(params as never[]));
      return { rows: [] };
    }
    const rows = stmt.all(...(params as never[])).map((r) => Object.values(r));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows } as { rows: unknown[] };
  },
  { schema }
);
vi.mock('./client', () => ({ db: proxy }));
vi.mock('@/lib/health/mirror', () => ({
  mirrorWorkout: () => undefined,
  mirrorWorkoutRemoved: () => undefined,
}));
vi.mock('@/lib/family', () => ({
  familyStrength: () => undefined,
  familyWorkoutRemoved: () => undefined,
}));

const q = await import('./workout-queries');
const { exercises, sessionExercises, sets, workoutSessions } = schema;

/** The old loadActiveWorkout, query for query. */
async function oneByOne(sessionId: string) {
  const session = await q.getSessionById(sessionId);
  if (!session) return null;
  const seRows = await proxy
    .select({
      id: sessionExercises.id,
      sessionId: sessionExercises.sessionId,
      exerciseId: sessionExercises.exerciseId,
      position: sessionExercises.position,
      restSeconds: sessionExercises.restSeconds,
      notes: sessionExercises.notes,
      supersetGroup: sessionExercises.supersetGroup,
      track: sessionExercises.track,
      exerciseName: exercises.name,
      primaryMuscles: exercises.primaryMuscles,
      equipment: exercises.equipment,
      images: exercises.images,
      category: exercises.category,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position));
  const out = [];
  for (const se of seRows) {
    const setRows = await proxy.select().from(sets).where(eq(sets.sessionExerciseId, se.id)).orderBy(asc(sets.setIndex));
    const bestRow = await proxy
      .select({ weight: sets.weight, unit: sets.weightUnit })
      .from(sets)
      .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(sessionExercises.exerciseId, se.exerciseId),
          ne(workoutSessions.id, sessionId),
          eq(workoutSessions.status, 'completed'),
          eq(sets.completed, true),
          eq(sets.isWarmup, false),
          eq(sets.setType, 'normal'),
          sql`${sets.weight} > 0`
        )
      )
      .orderBy(desc(sets.weight))
      .limit(1);
    const images = JSON.parse(se.images ?? '[]');
    out.push({
      ...se,
      images: undefined,
      primaryMuscles: JSON.parse(se.primaryMuscles ?? '[]'),
      image: typeof images[0] === 'string' ? images[0] : null,
      best: bestRow[0]?.weight != null ? { weight: bestRow[0].weight, unit: bestRow[0].unit ?? 'lb' } : null,
      sets: setRows,
      lastPerformance: await q.getLastPerformance(se.exerciseId, sessionId),
    });
  }
  return { session, exercises: out.map(({ images: _drop, ...rest }) => rest) };
}

const migrations = readdirSync(join(__dirname, '..', 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(__dirname, '..', 'drizzle', f), 'utf8'));

beforeEach(() => {
  for (const t of sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) for (const s of m.split('--> statement-breakpoint')) if (s.trim()) sqlite.exec(s);
});

const DAY = 86_400;
const T0 = 1_780_000_000;

function seed() {
  sqlite.exec(`insert into exercises (id, name, category, primary_muscles, images) values
    ('bp', 'Bench Press', 'strength', '["chest"]', '["bench/0.jpg"]'),
    ('sq', 'Squat', 'strength', '["quadriceps"]', '[]'),
    ('row', 'Barbell Row', 'strength', '["lats"]', '[]'),
    ('fw', 'Farmers Walk', 'strongman', '["forearms"]', '[]'),
    ('new', 'Never Done', 'strength', '[]', '[]')`);
  const ses = sqlite.prepare('insert into workout_sessions (id, started_at, ended_at, status) values (?, ?, ?, ?)');
  const se = sqlite.prepare('insert into session_exercises (id, session_id, exercise_id, position, track) values (?, ?, ?, ?, ?)');
  const st = sqlite.prepare(
    'insert into sets (id, session_exercise_id, set_index, reps, weight, weight_unit, completed, is_warmup, set_type, distance_m) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  // Three finished sessions, oldest first.
  for (let i = 0; i < 3; i++) {
    const sid = `done${i}`;
    ses.run(sid, T0 + i * DAY, T0 + i * DAY + 3600, 'completed');
    se.run(`${sid}-bp`, sid, 'bp', 0, 'reps');
    st.run(`${sid}-bp-w`, `${sid}-bp`, 0, 10, 45, 'lb', 1, 1, 'normal', null); // warm-up
    st.run(`${sid}-bp-1`, `${sid}-bp`, 1, 5, 185 + i * 5, 'lb', 1, 0, 'normal', null);
    st.run(`${sid}-bp-2`, `${sid}-bp`, 2, 5, 180 + i * 5, 'lb', 1, 0, 'normal', null);
    st.run(`${sid}-bp-d`, `${sid}-bp`, 3, 12, 300, 'lb', 1, 0, 'drop', null); // drop set: never a best
    st.run(`${sid}-bp-x`, `${sid}-bp`, 4, 5, 400, 'lb', 0, 0, 'normal', null); // not completed
    se.run(`${sid}-sq`, sid, 'sq', 1, 'reps');
    st.run(`${sid}-sq-1`, `${sid}-sq`, 0, 5, 100 + i * 10, 'kg', 1, 0, 'normal', null);
    // Squat twice in the last session: the later block is what counts.
    if (i === 2) {
      se.run(`${sid}-sq2`, sid, 'sq', 2, 'reps');
      st.run(`${sid}-sq2-1`, `${sid}-sq2`, 0, 8, 90, 'kg', 1, 0, 'normal', null);
    }
    se.run(`${sid}-fw`, sid, 'fw', 3, 'distance');
    st.run(`${sid}-fw-1`, `${sid}-fw`, 0, null, 50, 'lb', 1, 0, 'normal', 40 + i * 5);
  }
  // An abandoned session full of numbers nobody lifted.
  ses.run('quit', T0 + 4 * DAY, null, 'discarded');
  se.run('quit-bp', 'quit', 'bp', 0, 'reps');
  st.run('quit-bp-1', 'quit-bp', 0, 5, 500, 'lb', 1, 0, 'normal', null);
  // Row only ever done as warm-ups: no best, no last performance.
  ses.run('warm', T0 + 5 * DAY, T0 + 5 * DAY + 600, 'completed');
  se.run('warm-row', 'warm', 'row', 0, 'reps');
  st.run('warm-row-1', 'warm-row', 0, 10, 95, 'lb', 1, 1, 'normal', null);
  // Today's workout, in progress, with its own completed sets.
  ses.run('now', T0 + 6 * DAY, null, 'in_progress');
  se.run('now-bp', 'now', 'bp', 0, 'reps');
  st.run('now-bp-1', 'now-bp', 0, 5, 600, 'lb', 1, 0, 'normal', null); // today's own: excluded from history
  st.run('now-bp-2', 'now-bp', 1, 5, 195, 'lb', 0, 0, 'normal', null);
  se.run('now-sq', 'now', 'sq', 1, 'reps');
  se.run('now-row', 'now', 'row', 2, 'reps');
  se.run('now-fw', 'now', 'fw', 3, 'distance');
  se.run('now-new', 'now', 'new', 4, 'reps');
  se.run('now-bp2', 'now', 'bp', 5, 'reps'); // bench again later in the same workout
}

describe('loadActiveWorkout, batched', () => {
  it('returns exactly what the one-query-per-exercise version did', async () => {
    seed();
    const expected = await oneByOne('now');
    const actual = await q.loadActiveWorkout('now');
    expect(actual).toEqual(expected);
  });

  it('gets the history right, not just the same as before', async () => {
    seed();
    const w = (await q.loadActiveWorkout('now'))!;
    const by = (id: string) => w.exercises.find((e) => e.id === id)!;
    expect(by('now-bp').best).toEqual({ weight: 195, unit: 'lb' }); // not the drop set, the discard or today's 600
    expect(by('now-bp').lastPerformance?.sets.map((s) => s.weight)).toEqual([195, 190]);
    expect(by('now-bp').lastPerformance?.performedAt).toEqual(new Date((T0 + 2 * DAY) * 1000));
    expect(by('now-sq').lastPerformance?.sets.map((s) => s.weight)).toEqual([90]); // the later block
    expect(by('now-sq').best).toEqual({ weight: 120, unit: 'kg' });
    expect(by('now-row').best).toBeNull();
    expect(by('now-row').lastPerformance).toBeNull();
    expect(by('now-new').lastPerformance).toBeNull();
    expect(by('now-fw').lastPerformance?.sets[0]).toMatchObject({ distanceM: 50, weight: 50 });
    expect(by('now-bp').sets.map((s) => s.id)).toEqual(['now-bp-1', 'now-bp-2']);
    expect(by('now-bp').image).toBe('bench/0.jpg');
  });

  it('an empty workout and a missing one', async () => {
    seed();
    sqlite.exec(`insert into workout_sessions (id, started_at, status) values ('empty', ${T0 + 7 * DAY}, 'in_progress')`);
    expect(await q.loadActiveWorkout('empty')).toMatchObject({ exercises: [] });
    expect(await q.loadActiveWorkout('nope')).toBeNull();
  });
});
