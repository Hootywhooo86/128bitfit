import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/** searchFoods against a real SQLite catalogue: word order, ranking, and the index noticing changes. */
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
vi.mock('@/lib/widget-refresh', () => ({ widgetsChanged: () => undefined }));
vi.mock('@/lib/health/mirror', () => ({}));

const { searchFoods } = await import('./food-queries');

const migrations = readdirSync(join(__dirname, '..', 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(__dirname, '..', 'drizzle', f), 'utf8'));

beforeEach(() => {
  for (const t of sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) for (const s of m.split('--> statement-breakpoint')) if (s.trim()) sqlite.exec(s);
  sqlite.exec(`insert into foods (id, name, source) values
    ('1', 'Eggs, Grade A, Large, egg whole', 'foundation'),
    ('2', 'Egg burrito', 'survey'),
    ('3', 'Eggplant, raw', 'sr_legacy'),
    ('4', 'Babyfood, egg yolks', 'sr_legacy'),
    ('5', 'My egg muffins', 'recipe')`);
});

const names = async (q: string) => (await searchFoods(q)).map((f) => f.name);

describe('searchFoods', () => {
  it('matches every word in any order', async () => {
    expect(await names('large egg')).toEqual(['Eggs, Grade A, Large, egg whole']);
    expect(await names('egg large')).toEqual(['Eggs, Grade A, Large, egg whole']);
  });

  it('ranks your own recipe and the plain food above the rest', async () => {
    const r = await names('egg');
    expect(r[0]).toBe('My egg muffins');
    expect(r.indexOf('Babyfood, egg yolks')).toBe(r.length - 1);
  });

  it('notices a renamed food without a restart', async () => {
    expect(await names('frittata')).toEqual([]);
    sqlite.exec(`update foods set name = 'My frittata' where id = '5'`);
    expect(await names('frittata')).toEqual(['My frittata']);
  });

  it('lifts what you log often', async () => {
    sqlite.exec(`insert into food_logs (id, food_id, meal_type, logged_at, servings, calories)
      values ('l1', '2', 'lunch', ${Math.floor(Date.now() / 1000)}, 1, 300),
             ('l2', '2', 'lunch', ${Math.floor(Date.now() / 1000)}, 1, 300)`);
    sqlite.exec(`delete from foods where id = '5'`);
    expect((await names('egg'))[0]).toBe('Egg burrito');
  });
});
