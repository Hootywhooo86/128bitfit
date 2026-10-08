import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/**
 * Backup → wipe → restore, against a real SQLite built from the migrations.
 * The one promise a restore makes is that nothing is lost, so the test is a
 * round trip: what is exported after the restore must equal what was
 * exported before it.
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
vi.mock('@/lib/health/mirror', () => ({
  mirrorWeight: () => undefined,
  mirrorWeightRemoved: () => undefined,
  mirrorWeights: () => undefined,
  mirrorMeal: () => undefined,
}));
vi.mock('@/lib/family', () => ({
  familyStrength: () => undefined,
  familyWorkoutRemoved: () => undefined,
}));

const { collectExport } = await import('@/lib/export/collect');
const { buildEnvelope } = await import('@/lib/export/json');
const { planRestore, RestoreError } = await import('@/lib/backup/restore-plan');
const { applyRestore } = await import('./restore');

const dir = join(__dirname, '..', 'drizzle');
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'));

/** A fresh install: empty tables plus the bundled catalogue. */
function freshInstall() {
  for (const t of sqlite
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
    .all()) {
    sqlite.exec(`drop table if exists "${(t as { name: string }).name}"`);
  }
  for (const m of migrations) {
    for (const stmt of m.split('--> statement-breakpoint')) if (stmt.trim()) sqlite.exec(stmt);
  }
  sqlite.exec(`insert into exercises (id, name, category) values ('Bench_Press', 'Bench Press', 'strength'), ('Farmers_Walk', 'Farmers Walk', 'strongman')`);
  sqlite.exec(`insert into foods (id, name, source, nutrients) values ('usda_oats', 'Oats', 'usda', '{}')`);
}

const OLD_DIR = 'file:///data/user/0/old/files/';
const NEW_DIR = 'file:///data/user/0/new/files/';
const T = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function seedEverything() {
  const q = (sql: string, ...p: unknown[]) => sqlite.prepare(sql).run(...(p as never[]));
  q(`insert into exercises (id, name, category, primary_muscles, secondary_muscles, instructions, images)
     values ('custom_row', 'Seated row machine', 'custom', '["lats"]', '[]', '["Pull"]', ?)`,
    JSON.stringify([`${OLD_DIR}exercise-photos/custom_row-1.jpg`]));
  q(`insert into routines (id, name, notes, created_at) values ('r1', 'Upper', null, ?)`, T('2026-09-01T10:00:00Z'));
  q(`insert into routine_exercises (id, routine_id, exercise_id, position, target_sets, target_reps, rest_seconds, notes)
     values ('re1', 'r1', 'Bench_Press', 0, 3, 8, 90, null)`);
  q(`insert into workout_sessions (id, routine_id, started_at, ended_at, status, notes)
     values ('w1', 'r1', ?, ?, 'completed', 'good day')`, T('2026-09-02T17:00:00Z'), T('2026-09-02T18:00:00Z'));
  q(`insert into session_exercises (id, session_id, exercise_id, position, rest_seconds, notes, superset_group)
     values ('se1', 'w1', 'Bench_Press', 0, 90, null, 'ss1'), ('se2', 'w1', 'custom_row', 1, 90, 'seat 4', 'ss1')`);
  q(`insert into sets (id, session_exercise_id, set_index, reps, weight, weight_unit, completed, is_warmup, set_type, rpe)
     values ('s1', 'se1', 0, 8, 185, 'lb', 1, 0, 'normal', 8), ('s2', 'se2', 0, 10, 120, 'lb', 1, 0, 'normal', null)`);
  // A carry logged by distance, and a routine that remembers it.
  q(`insert into session_exercises (id, session_id, exercise_id, position, track) values ('se3', 'w1', 'Farmers_Walk', 2, 'distance')`);
  q(`insert into sets (id, session_exercise_id, set_index, reps, weight, weight_unit, completed, is_warmup, set_type, distance_m)
     values ('s3', 'se3', 0, null, 90, 'lb', 1, 0, 'normal', 40)`);
  q(`insert into routine_exercises (id, routine_id, exercise_id, position, target_sets, track) values ('re2', 'r1', 'Farmers_Walk', 1, 3, 'distance')`);
  q(`insert into foods (id, name, source, serving_size, serving_unit, nutrition_basis, nutrients, photo_uri)
     values ('custom_shake', 'Shake', 'custom', 1, 'bottle', 'per_serving', '{"calories":300,"protein":40,"fat":null}', ?)`,
    `${OLD_DIR}food-photos/custom_shake.jpg`);
  q(`insert into food_logs (id, food_id, custom_name, meal_type, logged_at, servings, calories, protein, fat, carb)
     values ('f1', 'usda_oats', null, 'breakfast', ?, 1, 300, 10, 5, 50),
            ('f2', null, 'Chicken burrito', 'lunch', ?, 1, 650, 40, null, 70),
            ('f3', 'custom_shake', null, 'snack', ?, 2, 600, 80, null, null)`,
    T('2026-09-02T08:00:00Z'), T('2026-09-02T12:00:00Z'), T('2026-09-02T15:00:00Z'));
  q(`insert into water_logs (id, ml, logged_at) values ('wl1', 500, ?)`, T('2026-09-02T09:00:00Z'));
  q(`insert into weight_entries (id, kg_or_lb, unit, logged_at, note) values ('we1', 200, 'lb', ?, null)`, T('2026-09-02T07:00:00Z'));
  q(`insert into settings (key, value) values ('calorie_target', '2600'), ('units', 'lb'),
     ('gym_pass', ?)`, JSON.stringify({ photoUri: `${OLD_DIR}gym-pass/pass-1.jpg`, memberNumber: '42' }));
  q(`insert into coach_threads (id, mode, title, created_at, updated_at) values ('c1', 'debrief', 'Debrief', ?, ?)`,
    T('2026-09-02T18:05:00Z'), T('2026-09-02T18:06:00Z'));
  q(`insert into coach_messages (id, thread_id, role, content, created_at) values ('m1', 'c1', 'assistant', 'Solid.', ?)`,
    T('2026-09-02T18:06:00Z'));
  q(`insert into injuries (id, area, severity, notes, avoid, started_at, resolved_at) values ('i1', 'Left shoulder', 'mild', null, 'dips', ?, null)`,
    T('2026-08-20T00:00:00Z'));
  q(`insert into progress_photos (id, pose, uri, taken_at) values ('p1', 'front', ?, ?)`,
    `${OLD_DIR}progress-photos/p1.jpg`, T('2026-09-01T07:00:00Z'));
  q(`insert into cardio_sessions (id, sport, status, started_at, ended_at, distance_m, moving_s, elapsed_s, elev_gain_m, manual, notes)
     values ('k1', 'walk', 'finished', 1790000000000, 1790001800000, 2400, 1700, 1800, 12, 0, null)`);
  q(`insert into cardio_points (session_id, t, lat, lon, alt, accuracy, speed, segment)
     values ('k1', 1790000000000, 51.5, -0.12, 10, 5, 1.4, 0), ('k1', 1790000001000, 51.5001, -0.12, 10, 5, 1.4, 0)`);
}

async function exportText(files?: Record<string, string>): Promise<string> {
  const env = buildEnvelope(await collectExport(), new Date('2026-09-30T00:00:00Z'));
  return JSON.stringify(files ? { ...env, files, documentDir: OLD_DIR } : env);
}

/** Every table's rows, for comparing two databases. */
async function snapshot(): Promise<Record<string, unknown[]>> {
  const env = buildEnvelope(await collectExport(), new Date(0));
  return env.tables;
}

beforeEach(() => freshInstall());

describe('backup and restore', () => {
  it('loses nothing: a restored phone exports exactly what the old one did', async () => {
    seedEverything();
    const before = await snapshot();
    const text = await exportText({ 'progress-photos/p1.jpg': 'AAAA', 'gym-pass/pass-1.jpg': 'BBBB' });

    freshInstall();
    const written: string[] = [];
    const result = await applyRestore(planRestore(text, OLD_DIR), async (path) => {
      written.push(path);
      return true;
    });

    expect(await snapshot()).toEqual(before);
    expect(before.sets).toContainEqual(expect.objectContaining({ id: 's3', distance_m: 40, reps: null }));
    expect(before.session_exercises).toContainEqual(expect.objectContaining({ id: 'se3', track: 'distance' }));
    expect(written.sort()).toEqual(['gym-pass/pass-1.jpg', 'progress-photos/p1.jpg']);
    expect(result.photos).toBe(2);
    expect(result.unreadable).toBe(0);
  });

  it('moves photo paths to the new phone', async () => {
    seedEverything();
    const text = await exportText({});
    freshInstall();
    await applyRestore(planRestore(text, NEW_DIR), async () => true);
    const after = await snapshot();
    expect(after.progress_photos[0]).toMatchObject({ file: `${NEW_DIR}progress-photos/p1.jpg` });
    expect(after.custom_foods[0]).toMatchObject({ photo: `${NEW_DIR}food-photos/custom_shake.jpg` });
    const pass = (after.settings as { key: string; value: string }[]).find((s) => s.key === 'gym_pass')!;
    expect(JSON.parse(pass.value).photoUri).toBe(`${NEW_DIR}gym-pass/pass-1.jpg`);
  });

  it('adds nothing the second time', async () => {
    seedEverything();
    const text = await exportText();
    freshInstall();
    await applyRestore(planRestore(text, OLD_DIR), async () => true);
    const again = await applyRestore(planRestore(text, OLD_DIR), async () => true);
    const addedRows = Object.entries(again.added)
      .filter(([k]) => k !== 'settings')
      .reduce((n, [, v]) => n + v, 0);
    expect(addedRows).toBe(0);
    expect(again.alreadyHere).toBeGreaterThan(10);
  });

  it('never overwrites what is already on the phone', async () => {
    seedEverything();
    const text = await exportText();
    freshInstall();
    sqlite.exec(`insert into water_logs (id, ml, logged_at) values ('wl1', 999, 0)`);
    await applyRestore(planRestore(text, OLD_DIR), async () => true);
    expect(sqlite.prepare(`select ml from water_logs where id = 'wl1'`).get()).toEqual({ ml: 999 });
  });

  it('keeps the name of a food this phone does not have', async () => {
    seedEverything();
    sqlite.exec(`insert into foods (id, name, source, nutrients) values ('off_123', 'Protein bar', 'open_food_facts', '{}')`);
    sqlite.exec(`insert into food_logs (id, food_id, meal_type, logged_at, servings, calories) values ('f9', 'off_123', 'snack', 0, 1, 200)`);
    const text = await exportText();
    freshInstall();
    await applyRestore(planRestore(text, OLD_DIR), async () => true);
    expect(sqlite.prepare(`select custom_name from food_logs where id = 'f9'`).get()).toEqual({
      custom_name: 'Protein bar',
    });
  });

  it('recreates, by name, an exercise this phone does not have', async () => {
    seedEverything();
    sqlite.exec(`insert into exercises (id, name, category) values ('Old_Lift', 'Old Lift', 'strength')`);
    sqlite.exec(`insert into session_exercises (id, session_id, exercise_id, position) values ('se9', 'w1', 'Old_Lift', 2)`);
    const text = await exportText();
    freshInstall();
    await applyRestore(planRestore(text, OLD_DIR), async () => true);
    expect(sqlite.prepare(`select name, category from exercises where id = 'Old_Lift'`).get()).toEqual({
      name: 'Old Lift',
      category: 'custom',
    });
  });
});

describe('reading a backup file', () => {
  it('refuses anything that is not this app’s file', () => {
    expect(() => planRestore('not json', NEW_DIR)).toThrow(RestoreError);
    expect(() => planRestore('{"format":"hevy"}', NEW_DIR)).toThrow(/not a 128BIT FIT backup/);
    expect(() => planRestore('{"format":"128bitfit-export","formatVersion":9}', NEW_DIR)).toThrow(/newer version/);
  });

  it('refuses a photo path that climbs out of the photo folders', () => {
    const plan = planRestore(
      JSON.stringify({
        format: '128bitfit-export',
        formatVersion: 2,
        tables: {},
        files: {
          '../databases/app.db': 'x',
          '/etc/passwd': 'x',
          'progress-photos/../../x.jpg': 'x',
          'progress-photos/ok.jpg': 'x',
          'somewhere-else/a.jpg': 'x',
        },
      }),
      NEW_DIR
    );
    expect(plan.files.map((f) => f.path)).toEqual(['progress-photos/ok.jpg']);
    expect(plan.skipped.files).toBe(4);
  });

  it('skips unreadable rows instead of inventing values', () => {
    const plan = planRestore(
      JSON.stringify({
        format: '128bitfit-export',
        formatVersion: 1,
        tables: { weight_entries: [{ id: 'a', value: 'heavy', unit: 'lb', logged_at: '2026-01-01' }, { id: 'b', value: 180, unit: 'lb', logged_at: '2026-01-02' }] },
      }),
      NEW_DIR
    );
    expect(plan.weightEntries.map((w) => w.id)).toEqual(['b']);
    expect(plan.skipped.weight_entries).toBe(1);
  });
});
