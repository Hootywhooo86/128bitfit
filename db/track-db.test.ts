import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/** Weight x reps / weight x distance, against a real SQLite from the migrations. */
const sqlite = new DatabaseSync(':memory:');

vi.mock('./client', () => ({
  db: drizzle(
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
  ),
}));
vi.mock('@/lib/health/mirror', () => ({
  mirrorWorkout: () => undefined,
  mirrorWorkoutRemoved: () => undefined,
  mirrorWeight: () => undefined,
  mirrorWeightRemoved: () => undefined,
  mirrorWeights: () => undefined,
  mirrorMeal: () => undefined,
}));
vi.mock('@/lib/family', () => ({
  familyStrength: () => undefined,
  familyWorkoutRemoved: () => undefined,
}));

const q = await import('./workout-queries');

const dir = join(__dirname, '..', 'drizzle');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8'));

beforeEach(() => {
  for (const t of sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) for (const s of m.split('--> statement-breakpoint')) if (s.trim()) sqlite.exec(s);
  sqlite.exec(`insert into exercises (id, name, category) values ('fw', 'Farmers Walk', 'strongman'), ('bp', 'Bench Press', 'strength')`);
});

const setsOf = (seId: string) =>
  sqlite.prepare(`select reps, distance_m as d from sets where session_exercise_id = ? order by set_index`).all(seId);
const trackOf = (seId: string) =>
  (sqlite.prepare(`select track from session_exercises where id = ?`).get(seId) as { track: string }).track;

describe('logging by distance', () => {
  it('a carry starts on distance, a press on reps', async () => {
    const w = await q.startFreestyleWorkout();
    const fw = await q.addExerciseToSession(w, 'fw');
    const bp = await q.addExerciseToSession(w, 'bp');
    expect(trackOf(fw)).toBe('distance');
    expect(trackOf(bp)).toBe('reps');
  });

  it('switching is remembered for next time, and blanks the other number', async () => {
    const w = await q.startFreestyleWorkout();
    const bp = await q.addExerciseToSession(w, 'bp', { targetSets: 2 });
    await q.setSessionExerciseTrack(bp, 'distance');
    expect(trackOf(bp)).toBe('distance');
    expect(setsOf(bp)).toEqual([{ reps: null, d: null }, { reps: null, d: null }]);

    const again = await q.addExerciseToSession(w, 'bp');
    expect(trackOf(again)).toBe('distance');
  });

  it('pre-fills last time’s metres, never as reps', async () => {
    const w1 = await q.startFreestyleWorkout();
    const fw1 = await q.addExerciseToSession(w1, 'fw');
    const [set] = sqlite.prepare(`select id from sets where session_exercise_id = ?`).all(fw1) as { id: string }[];
    await q.completeSet(set.id, { weight: 90, reps: null, distanceM: 40 });
    await q.completeSession(w1);

    const w2 = await q.startFreestyleWorkout();
    const fw2 = await q.addExerciseToSession(w2, 'fw');
    expect(sqlite.prepare(`select reps, weight, distance_m as d from sets where session_exercise_id = ?`).get(fw2)).toEqual({
      reps: null,
      weight: 90,
      d: 40,
    });
  });
});
