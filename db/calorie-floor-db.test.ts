import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/**
 * Non-negotiable #6 against a real SQLite: the floor has to hold however the
 * target and the profile arrive, not only when they arrive in a helpful order.
 */
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
// Health Connect needs a phone; nothing here is about it.
vi.mock('@/lib/health/mirror', () => ({
  mirrorWeight: () => undefined,
  mirrorWeightRemoved: () => undefined,
  mirrorWeights: () => undefined,
  mirrorMeal: () => undefined,
}));

const { updateAppSettings, getAppSettings } = await import('./settings-queries');
const { addWeightEntry } = await import('./weight-queries');

// Every migration, in order, so the tables are exactly the app's.
const dir = join(__dirname, '..', 'drizzle');
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'));

beforeEach(() => {
  for (const t of sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) {
    for (const stmt of m.split('--> statement-breakpoint')) if (stmt.trim()) sqlite.exec(stmt);
  }
});

// Male, 35, 188 cm, 113 kg: BMR ~2270, so a 1300 kcal target is far below.
const PROFILE = { sex: 'male' as const, birthday: '1991-01-01', heightCm: 188 };

describe('the calorie floor', () => {
  it('holds when onboarding sends the target with the profile in one save', async () => {
    await addWeightEntry({ value: 113, unit: 'kg' });
    await updateAppSettings({ ...PROFILE, calorieTarget: 1300 });
    expect((await getAppSettings()).calorieTarget).toBeGreaterThan(2000);
  });

  it('is checked again when a weigh-in raises it', async () => {
    await updateAppSettings({ ...PROFILE, calorieTarget: 1600 });
    expect((await getAppSettings()).calorieTarget).toBe(1600);
    await addWeightEntry({ value: 113, unit: 'kg' });
    expect((await getAppSettings()).calorieTarget).toBeGreaterThan(2000);
  });

  it('leaves a target above the floor alone', async () => {
    await addWeightEntry({ value: 113, unit: 'kg' });
    await updateAppSettings({ ...PROFILE, calorieTarget: 2800 });
    await updateAppSettings({ activity: 'sedentary' });
    expect((await getAppSettings()).calorieTarget).toBe(2800);
  });
});
