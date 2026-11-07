import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/** The map under a workout reads that workout's ticked sets, while it is still running. */
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

const { getSessionMuscleTally } = await import('./muscle-queries');

const migrations = readdirSync(join(__dirname, '..', 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(__dirname, '..', 'drizzle', f), 'utf8'));

beforeEach(() => {
  for (const t of sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) for (const s of m.split('--> statement-breakpoint')) if (s.trim()) sqlite.exec(s);
  sqlite.exec(`insert into exercises (id, name, category, primary_muscles, secondary_muscles) values
    ('bp', 'Bench Press', 'strength', '["chest"]', '["triceps","shoulders"]'),
    ('curl', 'Curl', 'strength', '["biceps"]', '[]')`);
  const ses = sqlite.prepare('insert into workout_sessions (id, started_at, status) values (?, ?, ?)');
  const se = sqlite.prepare('insert into session_exercises (id, session_id, exercise_id, position) values (?, ?, ?, ?)');
  const st = sqlite.prepare('insert into sets (id, session_exercise_id, set_index, reps, weight, completed) values (?, ?, ?, ?, ?, ?)');
  ses.run('live', 1_780_000_000, 'in_progress');
  ses.run('other', 1_779_000_000, 'completed');
  se.run('live-bp', 'live', 'bp', 0);
  se.run('live-curl', 'live', 'curl', 1);
  se.run('other-curl', 'other', 'curl', 0);
  st.run('a', 'live-bp', 0, 5, 100, 1);
  st.run('b', 'live-bp', 1, 5, 100, 1);
  st.run('c', 'live-bp', 2, 5, 100, 0);
  st.run('d', 'other-curl', 0, 10, 20, 1);
});

describe('getSessionMuscleTally', () => {
  it('counts only ticked sets of that workout, even before it is finished', async () => {
    const t = await getSessionMuscleTally('live');
    expect(t.chest).toBe(2);
    expect(t.triceps).toBe(1);
    expect(t.shoulders).toBe(1);
    // The curl has no ticked sets here; the other workout's curl is not this one.
    expect(t.biceps).toBe(0);
  });

  it('is all zeros for a workout with nothing ticked', async () => {
    const t = await getSessionMuscleTally('nope');
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
});
