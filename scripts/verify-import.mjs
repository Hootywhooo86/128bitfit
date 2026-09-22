#!/usr/bin/env node
/**
 * Headless verification that bundled JSON imports into SQLite with expected counts.
 * Uses Node's built-in node:sqlite (no Expo runtime required).
 *
 * Expected counts and import version come from db/data-manifest.ts, so
 * regenerating the JSON and recomputing the manifest is enough — there are no
 * counts to update here.
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
const manifestPath = path.join(root, 'db/data-manifest.ts');

/**
 * db/data-manifest.ts is generated and its object literal is plain JSON, so we
 * lift it out rather than pulling a TypeScript loader into this script.
 */
function readManifest() {
  const src = fs.readFileSync(manifestPath, 'utf8');
  const match = src.match(/DATA_MANIFEST\s*=\s*(\{[\s\S]*?\})\s*as const/);
  if (!match) {
    throw new Error(
      `Could not find the DATA_MANIFEST object literal in ${manifestPath}. ` +
        'It should stay generated: `export const DATA_MANIFEST = { ... } as const;`'
    );
  }
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    throw new Error(
      `DATA_MANIFEST in ${manifestPath} is not valid JSON (${e.message}). ` +
        'Regenerate it rather than hand-editing.'
    );
  }
}

const manifest = readManifest();
const expected = {
  exercises: manifest.exercises.count,
  foods: manifest.foods.count,
};

for (const [key, value] of Object.entries(expected)) {
  if (!Number.isInteger(value)) {
    throw new Error(`DATA_MANIFEST.${key}.count is ${JSON.stringify(value)}, expected an integer.`);
  }
}

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
insertMeta.run('import_version', String(manifest.version));
insertMeta.run('exercises_checksum', checksum(exBuf));
insertMeta.run('foods_checksum', checksum(foodBuf));
db.exec('COMMIT');

const exCount = db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n;
const foodCount = db.prepare('SELECT COUNT(*) AS n FROM foods').get().n;
const sample = db.prepare('SELECT id, name, equipment FROM exercises WHERE id = ?').get('3_4_Sit-Up');

const ok = exCount === expected.exercises && foodCount === expected.foods;

console.log(JSON.stringify({
  ok,
  exercises: exCount,
  foods: foodCount,
  expected,
  sample,
  checksums: {
    exercises: checksum(exBuf),
    foods: checksum(foodBuf),
  },
}, null, 2));

if (!ok) {
  console.error(
    `Import count mismatch against db/data-manifest.ts: ` +
      `exercises ${exCount} (expected ${expected.exercises}), ` +
      `foods ${foodCount} (expected ${expected.foods}). ` +
      'Recompute the manifest if the JSON was regenerated on purpose.'
  );
  process.exit(1);
}
