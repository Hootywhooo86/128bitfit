#!/usr/bin/env node
/**
 * Headless verification that bundled JSON imports into SQLite with expected counts.
 * Uses Node's built-in node:sqlite (no Expo runtime required).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const exercisesPath = path.join(root, 'assets/data/exercises.json');
const foodsPath = path.join(root, 'assets/data/foods.json');

const exBuf = fs.readFileSync(exercisesPath);
const foodBuf = fs.readFileSync(foodsPath);
const exercises = JSON.parse(exBuf);
const foods = JSON.parse(foodBuf);

const checksum = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE meta (key text PRIMARY KEY NOT NULL, value text NOT NULL);
CREATE TABLE exercises (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  force text,
  level text,
  mechanic text,
  equipment text,
  primary_muscles text DEFAULT '[]' NOT NULL,
  secondary_muscles text DEFAULT '[]' NOT NULL,
  instructions text DEFAULT '[]' NOT NULL,
  category text,
  images text DEFAULT '[]' NOT NULL
);
CREATE TABLE foods (
  id text PRIMARY KEY NOT NULL,
  source_id text,
  name text NOT NULL,
  description text,
  source text,
  barcode text,
  gtin text,
  brand text,
  serving_size real,
  serving_unit text,
  nutrition_basis text,
  nutrients text DEFAULT '{}' NOT NULL
);
`);

const insertEx = db.prepare(`INSERT INTO exercises (
  id, name, force, level, mechanic, equipment,
  primary_muscles, secondary_muscles, instructions, category, images
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertFood = db.prepare(`INSERT INTO foods (
  id, source_id, name, description, source, barcode, gtin, brand,
  serving_size, serving_unit, nutrition_basis, nutrients
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertMeta = db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)`);

db.exec('BEGIN');
for (const e of exercises) {
  insertEx.run(
    e.id,
    e.name,
    e.force ?? null,
    e.level ?? null,
    e.mechanic ?? null,
    e.equipment ?? null,
    JSON.stringify(e.primaryMuscles ?? []),
    JSON.stringify(e.secondaryMuscles ?? []),
    JSON.stringify(e.instructions ?? []),
    e.category ?? null,
    JSON.stringify(e.images ?? [])
  );
}
for (const f of foods) {
  insertFood.run(
    String(f.id),
    f.source_id != null ? String(f.source_id) : null,
    f.name,
    f.description ?? null,
    f.source ?? null,
    f.barcode ?? null,
    f.gtin ?? null,
    f.brand ?? null,
    f.serving_size ?? null,
    f.serving_unit ?? null,
    f.nutrition_basis ?? null,
    JSON.stringify(f.nutrients ?? {})
  );
}
insertMeta.run('import_version', '1');
insertMeta.run('exercises_checksum', checksum(exBuf));
insertMeta.run('foods_checksum', checksum(foodBuf));
db.exec('COMMIT');

const exCount = db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n;
const foodCount = db.prepare('SELECT COUNT(*) AS n FROM foods').get().n;
const sample = db.prepare('SELECT id, name, equipment FROM exercises WHERE id = ?').get('3_4_Sit-Up');

console.log(JSON.stringify({
  ok: exCount === 876 && foodCount === 8114,
  exercises: exCount,
  foods: foodCount,
  expected: { exercises: 876, foods: 8114 },
  sample,
  checksums: {
    exercises: checksum(exBuf),
    foods: checksum(foodBuf),
  },
}, null, 2));

if (exCount !== 876 || foodCount !== 8114) {
  process.exit(1);
}
