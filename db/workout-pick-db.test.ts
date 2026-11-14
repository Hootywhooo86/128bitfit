import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/** The workout picker's history: what was done, and how long since each muscle. */
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
// Its settings import reaches React Native, which vitest cannot parse.
vi.mock('./injury-queries', () => ({ getTellCoach: async () => false, listActiveInjuries: async () => [] }));

const { loadPickHistory, loadPickLibrary } = await import('./workout-pick-queries');

const migrations = readdirSync(join(__dirname, '..', 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(__dirname, '..', 'drizzle', f), 'utf8'));

const NOW = new Date(2026, 10, 14, 12);
const day = (d: number) => Math.floor(new Date(2026, 10, 14 - d, 9).getTime() / 1000);

beforeEach(() => {
  for (const t of sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) for (const s of m.split('--> statement-breakpoint')) if (s.trim()) sqlite.exec(s);
  sqlite.exec(`insert into exercises (id, name, category, primary_muscles, secondary_muscles, equipment, images) values
    ('bp', 'Bench Press', 'strength', '["chest"]', '["triceps"]', 'barbell', '["bp/0.jpg"]'),
    ('sq', 'Squat', 'strength', '["quadriceps"]', '[]', 'barbell', '[]'),
    ('odd', 'Odd', 'strength', '["pecs","Chest"]', 'not json', null, '[]')`);
  const ses = sqlite.prepare('insert into workout_sessions (id, started_at, status) values (?, ?, ?)');
  const se = sqlite.prepare('insert into session_exercises (id, session_id, exercise_id, position) values (?, ?, ?, ?)');
  const st = sqlite.prepare('insert into sets (id, session_exercise_id, set_index, reps, weight, completed) values (?, ?, ?, ?, ?, ?)');
  ses.run('old', day(9), 'completed');
  ses.run('recent', day(2), 'completed');
  ses.run('dropped', day(0), 'discarded');
  se.run('a', 'old', 'bp', 0);
  se.run('b', 'recent', 'bp', 0);
  se.run('c', 'dropped', 'sq', 0);
  st.run('1', 'a', 0, 5, 100, 1);
  st.run('2', 'b', 0, 5, 100, 1);
  st.run('3', 'c', 0, 5, 100, 1);
});

describe('workout pick history', () => {
  it('knows what was done and how many days since, from finished workouts only', async () => {
    const h = await loadPickHistory(NOW);
    expect([...h.done]).toEqual(['bp']);
    expect(h.daysSince.chest).toBe(2);
    expect(h.daysSince.quadriceps).toBeUndefined();
  });

  it('reads the library with muscles mapped onto the app groups', async () => {
    const lib = await loadPickLibrary();
    const odd = lib.find((x) => x.id === 'odd')!;
    expect(odd.primary).toEqual(['chest']);
    expect(odd.secondary).toEqual([]);
    expect(lib.find((x) => x.id === 'bp')!.hasImage).toBe(true);
  });
});
