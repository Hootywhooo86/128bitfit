import { count, eq, sql } from 'drizzle-orm';
import { DATA_MANIFEST } from './data-manifest';
import { db, sqlite } from './client';
import { exercises, foods, meta } from './schema';

export type ImportProgress = {
  phase: 'checking' | 'exercises' | 'foods' | 'done' | 'skipped' | 'error';
  message: string;
  exercisesDone?: number;
  exercisesTotal?: number;
  foodsDone?: number;
  foodsTotal?: number;
};

export type ImportResult = {
  skipped: boolean;
  exerciseCount: number;
  foodCount: number;
};

type ExerciseJson = {
  id: string;
  name: string;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string | null;
  images?: string[];
};

type FoodJson = {
  id: number | string;
  source_id?: number | string | null;
  name: string;
  description?: string | null;
  source?: string | null;
  barcode?: string | null;
  gtin?: string | null;
  brand?: string | null;
  serving_size?: number | null;
  serving_unit?: string | null;
  nutrition_basis?: string | null;
  nutrients?: Record<string, number | null>;
};

const META_IMPORT_VERSION = 'import_version';
const META_EX_CHECKSUM = 'exercises_checksum';
const META_FOOD_CHECKSUM = 'foods_checksum';

async function getMeta(key: string): Promise<string | null> {
  const rows = await db.select().from(meta).where(eq(meta.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  await db
    .insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } });
}

export async function getCounts(): Promise<{ exercises: number; foods: number }> {
  const [ex] = await db.select({ n: count() }).from(exercises);
  // Exclude runtime OFF cache + custom foods so re-import checksums stay stable.
  const [fo] = await db
    .select({ n: count() })
    .from(foods)
    .where(sql`coalesce(${foods.source}, '') not in ('open_food_facts', 'custom')`);
  return { exercises: ex?.n ?? 0, foods: fo?.n ?? 0 };
}

export async function needsImport(): Promise<boolean> {
  const version = await getMeta(META_IMPORT_VERSION);
  const exCs = await getMeta(META_EX_CHECKSUM);
  const foodCs = await getMeta(META_FOOD_CHECKSUM);
  if (
    version === DATA_MANIFEST.version &&
    exCs === DATA_MANIFEST.exercises.checksum &&
    foodCs === DATA_MANIFEST.foods.checksum
  ) {
    const counts = await getCounts();
    if (
      counts.exercises === DATA_MANIFEST.exercises.count &&
      counts.foods === DATA_MANIFEST.foods.count
    ) {
      return false;
    }
  }
  return true;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Idempotent first-launch import of bundled exercises.json + foods.json.
 * Uses DATA_MANIFEST checksums so re-launch skips when data is current.
 */
export async function importBundledData(
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const report = (p: ImportProgress) => onProgress?.(p);

  report({ phase: 'checking', message: 'Checking offline database…' });

  if (!(await needsImport())) {
    const counts = await getCounts();
    report({
      phase: 'skipped',
      message: `Offline DB ready (${counts.exercises} exercises, ${counts.foods} foods)`,
      exercisesDone: counts.exercises,
      exercisesTotal: counts.exercises,
      foodsDone: counts.foods,
      foodsTotal: counts.foods,
    });
    return { skipped: true, exerciseCount: counts.exercises, foodCount: counts.foods };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exerciseData = require('../assets/data/exercises.json') as ExerciseJson[];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const foodData = require('../assets/data/foods.json') as FoodJson[];

  report({
    phase: 'exercises',
    message: 'Importing exercises…',
    exercisesDone: 0,
    exercisesTotal: exerciseData.length,
    foodsDone: 0,
    foodsTotal: foodData.length,
  });

  try {
    // Clear previous rows outside the heavy insert loop
    await db.delete(exercises);
    // Keep Open Food Facts cache rows + user custom foods across USDA re-import.
    await db.delete(foods).where(
      sql`coalesce(${foods.source}, '') not in ('open_food_facts', 'custom')`
    );

    const exBatches = chunk(exerciseData, 50);
    let exDone = 0;
    for (const batch of exBatches) {
      await db.insert(exercises).values(
        batch.map((e) => ({
          id: e.id,
          name: e.name,
          force: e.force ?? null,
          level: e.level ?? null,
          mechanic: e.mechanic ?? null,
          equipment: e.equipment ?? null,
          primaryMuscles: JSON.stringify(e.primaryMuscles ?? []),
          secondaryMuscles: JSON.stringify(e.secondaryMuscles ?? []),
          instructions: JSON.stringify(e.instructions ?? []),
          category: e.category ?? null,
          images: JSON.stringify(e.images ?? []),
        }))
      );
      exDone += batch.length;
      report({
        phase: 'exercises',
        message: `Importing exercises… ${exDone}/${exerciseData.length}`,
        exercisesDone: exDone,
        exercisesTotal: exerciseData.length,
        foodsDone: 0,
        foodsTotal: foodData.length,
      });
    }

    report({
      phase: 'foods',
      message: 'Importing foods…',
      exercisesDone: exerciseData.length,
      exercisesTotal: exerciseData.length,
      foodsDone: 0,
      foodsTotal: foodData.length,
    });

    const foodBatches = chunk(foodData, 40);
    let foodDone = 0;
    for (const batch of foodBatches) {
      await db.insert(foods).values(
        batch.map((f) => ({
          id: String(f.id),
          sourceId: f.source_id != null ? String(f.source_id) : null,
          name: f.name,
          description: f.description ?? null,
          source: f.source ?? null,
          barcode: f.barcode ?? null,
          gtin: f.gtin ?? null,
          brand: f.brand ?? null,
          servingSize: f.serving_size ?? null,
          servingUnit: f.serving_unit ?? null,
          nutritionBasis: f.nutrition_basis ?? null,
          nutrients: JSON.stringify(f.nutrients ?? {}),
        }))
      );
      foodDone += batch.length;
      if (foodDone % 400 === 0 || foodDone === foodData.length) {
        report({
          phase: 'foods',
          message: `Importing foods… ${foodDone}/${foodData.length}`,
          exercisesDone: exerciseData.length,
          exercisesTotal: exerciseData.length,
          foodsDone: foodDone,
          foodsTotal: foodData.length,
        });
      }
    }

    await setMeta(META_IMPORT_VERSION, DATA_MANIFEST.version);
    await setMeta(META_EX_CHECKSUM, DATA_MANIFEST.exercises.checksum);
    await setMeta(META_FOOD_CHECKSUM, DATA_MANIFEST.foods.checksum);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report({ phase: 'error', message: `Import failed: ${message}` });
    throw err;
  }

  const counts = await getCounts();
  report({
    phase: 'done',
    message: `Imported ${counts.exercises} exercises and ${counts.foods} foods`,
    exercisesDone: counts.exercises,
    exercisesTotal: counts.exercises,
    foodsDone: counts.foods,
    foodsTotal: counts.foods,
  });

  return { skipped: false, exerciseCount: counts.exercises, foodCount: counts.foods };
}

/** Ensure indexes for library search. */
export function ensureIndexes(): void {
  sqlite.execSync(
    `CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
     CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
     CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
     CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);
     CREATE INDEX IF NOT EXISTS idx_foods_gtin ON foods(gtin);`
  );
}
