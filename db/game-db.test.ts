import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/** The game layer against a real SQLite built from the migrations. */
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
// Health Connect needs a phone; nothing here is about it.
vi.mock('@/lib/health/mirror', () => ({
  mirrorWeight: () => undefined,
  mirrorWeightRemoved: () => undefined,
  mirrorWeights: () => undefined,
  mirrorMeal: () => undefined,
}));

const g = await import('./game-queries');
const { collectExport } = await import('@/lib/export/collect');

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

const T0 = Math.floor(new Date(2026, 8, 1, 18).getTime() / 1000);
const DAY = 86_400;

function seedWorkouts() {
  sqlite.exec(`insert into exercises (id, name, category, primary_muscles, secondary_muscles, images) values
    ('bp', 'Barbell Bench Press - Medium Grip', 'strength', '["chest"]', '["triceps"]', '[]')`);
  const ses = sqlite.prepare('insert into workout_sessions (id, started_at, ended_at, status) values (?, ?, ?, ?)');
  const se = sqlite.prepare('insert into session_exercises (id, session_id, exercise_id, position, track) values (?, ?, ?, 0, ?)');
  const st = sqlite.prepare(
    'insert into sets (id, session_exercise_id, set_index, reps, weight, weight_unit, completed, is_warmup, set_type) values (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  ses.run('s1', T0, T0 + 3600, 'completed');
  se.run('s1-bp', 's1', 'bp', 'reps');
  st.run('w', 's1-bp', 0, 10, 45, 'lb', 1, 1, 'normal'); // warm-up: not a working set
  st.run('a', 's1-bp', 1, 5, 225, 'lb', 1, 0, 'normal'); // 102 kg: TON UP
  st.run('b', 's1-bp', 2, 5, 100, 'kg', 0, 0, 'normal'); // not ticked
  ses.run('gone', T0 + DAY, null, 'discarded');
  se.run('gone-bp', 'gone', 'bp', 'reps');
  st.run('c', 'gone-bp', 0, 5, 300, 'lb', 1, 0, 'normal');
}

describe('loadGameHistory', () => {
  it('reads completed working sets only, in kg', async () => {
    seedWorkouts();
    const h = await g.loadGameHistory();
    expect(h.sessions).toHaveLength(1);
    expect(h.sessions[0].sets).toHaveLength(1);
    expect(h.sessions[0].sets[0].weightKg).toBeCloseTo(102.06, 1);
    expect(h.sessions[0].sets[0].primary).toEqual(['chest']);
  });

  it('is empty for a new user', async () => {
    const h = await g.loadGameHistory();
    expect(h.sessions).toEqual([]);
    expect(h.cardio).toEqual([]);
    expect(h.foodDays).toEqual([]);
    expect(h.weighIns).toEqual([]);
  });
});

describe('unlocks', () => {
  it('records each trophy once, dated the day it was won, and says so once', async () => {
    seedWorkouts();
    const now = new Date(2026, 9, 5);
    const first = await g.recordGameNews(await g.loadGame(now));
    expect(first.trophies).toEqual(expect.arrayContaining(['first-blood', 'ton-up']));
    const again = await g.recordGameNews(await g.loadGame(now));
    expect(again.trophies).toEqual([]);
    const view = await g.loadGame(now);
    expect(view.unlockedAt['ton-up']?.getTime()).toBe(T0 * 1000);
  });

  it('shows LEVEL UP! once per level reached', async () => {
    seedWorkouts();
    const now = new Date(2026, 9, 5);
    const view = await g.loadGame(now);
    const news = await g.recordGameNews(view);
    if (view.progress.level > 1) expect(news.levelUp?.to).toBe(view.progress.level);
    expect((await g.recordGameNews(await g.loadGame(now))).levelUp).toBeNull();
  });

  it('go into the export with every other setting', async () => {
    seedWorkouts();
    await g.recordGameNews(await g.loadGame(new Date(2026, 9, 5)));
    await g.setGameOn(false);
    const tables = await collectExport();
    const keys = tables.find((t) => t.name === 'settings')!.rows.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['game_unlock:first-blood', 'game_unlock:ton-up', 'game_on']));
  });
});

describe('recomputing only when the log changes', () => {
  it('sees a new session, an edited set and a new day', async () => {
    seedWorkouts();
    const now = new Date(2026, 9, 5);
    const first = await g.loadGame(now);
    expect(await g.loadGame(now)).toEqual(first);

    sqlite.exec(`insert into workout_sessions (id, started_at, ended_at, status) values ('s2', ${T0 + 2 * DAY}, ${T0 + 2 * DAY + 3600}, 'completed')`);
    sqlite.exec(`insert into session_exercises (id, session_id, exercise_id, position, track) values ('s2-bp', 's2', 'bp', 0, 'reps')`);
    sqlite.exec(`insert into sets (id, session_exercise_id, set_index, reps, weight, weight_unit, completed, is_warmup, set_type) values ('d', 's2-bp', 0, 5, 100, 'lb', 1, 0, 'normal')`);
    const second = await g.loadGame(now);
    // One more set (+10) and the week's two-workout quest done (+50).
    expect(second.progress.xp).toBe(first.progress.xp + 60);

    // Same counts, heavier weight: the total volume has to move.
    const iron = (v: Awaited<ReturnType<typeof g.loadGame>>) => v.trophies.find((t) => t.id === 'iron-plate')!.progress;
    sqlite.exec(`update sets set weight = 300 where id = 'd'`);
    const third = await g.loadGame(now);
    expect(iron(third)).not.toEqual(iron(second));

    // A new week is new quests, even with nothing logged.
    const later = await g.loadGame(new Date(2026, 9, 13));
    expect(later.quests.map((q) => q.done)).toEqual([0, 0, 0]);
  });
});

describe('settings', () => {
  it('game on by default, sound off by default', async () => {
    expect(await g.gameOn()).toBe(true);
    expect(await g.blipOn()).toBe(false);
    await g.setGameOn(false);
    await g.setBlipOn(true);
    expect(await g.gameOn()).toBe(false);
    expect(await g.blipOn()).toBe(true);
  });

  it('never shows gear above the level reached', async () => {
    await g.saveLook({ outfit: 'armor', headband: 'crown', pet: 'dragon', title: 'final-boss' });
    const view = await g.loadGame(new Date(2026, 9, 5));
    expect(view.look).toEqual({ outfit: 'tee', headband: 'none', pet: 'none', title: 'novice' });
  });
});
