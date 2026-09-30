/**
 * Writes a planned restore (lib/backup/restore-plan.ts) into the database.
 *
 * Adds, never replaces: a row whose id is already on this phone is left as it
 * is, so restoring the same file twice, or onto a phone that already has some
 * of it, changes nothing that is there. Settings are the one exception — they
 * are the backup's, because restoring is asking for your old setup back.
 */
import { eq, inArray } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { RestorePlan } from '@/lib/backup/restore-plan';
import { CUSTOM_EXERCISE_CATEGORY } from '@/lib/exercise-sources';
import { db } from './client';
import {
  cardioPoints,
  cardioSessions,
  coachMessages,
  coachThreads,
  exercises,
  foodLogs,
  foods,
  injuries,
  progressPhotos,
  routineExercises,
  routines,
  sessionExercises,
  sets,
  settings,
  waterLogs,
  weightEntries,
  workoutSessions,
} from './schema';
import { SEEDED_KEY, STARTER_ROUTINE_IDS } from './seed-routines';
import { reapplyCalorieFloor } from './settings-queries';

export type RestoreResult = {
  /** Rows added, by what they are. */
  added: Record<string, number>;
  /** Rows already on this phone, left alone. */
  alreadyHere: number;
  /** Rows the file had but could not be read. */
  unreadable: number;
  photos: number;
};

const CHUNK = 40;

/** Any table with a text id — every one the restore adds rows to by id. */
type IdTable = SQLiteTable & { id: SQLiteColumn };

async function insertChunked(table: SQLiteTable, rows: object[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(table).values(rows.slice(i, i + CHUNK) as never);
  }
}

/** Ids already present in a table, out of the ones given. */
async function existing(table: IdTable, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    if (part.length === 0) continue;
    const rows = await db.select({ id: table.id }).from(table).where(inArray(table.id, part));
    for (const r of rows) found.add(String(r.id));
  }
  return found;
}

export async function applyRestore(
  plan: RestorePlan,
  writeFile: (path: string, base64: string) => Promise<boolean>
): Promise<RestoreResult> {
  const added: Record<string, number> = {};
  let alreadyHere = 0;

  /** Inserts the rows whose id is new here; returns the ids it added. */
  async function addNew<T extends { id: string }>(
    label: string,
    table: IdTable,
    rows: T[],
    toRow: (r: T) => object = (r) => r
  ): Promise<Set<string>> {
    const have = await existing(table, rows.map((r) => r.id));
    const fresh = rows.filter((r) => !have.has(r.id));
    alreadyHere += rows.length - fresh.length;
    await insertChunked(table, fresh.map(toRow));
    added[label] = (added[label] ?? 0) + fresh.length;
    return new Set(fresh.map((r) => r.id));
  }

  // Photos first, so no row ever points at a picture that is not there yet.
  let photos = 0;
  for (const f of plan.files) {
    if (await writeFile(f.path, f.base64)) photos += 1;
  }

  await addNew('custom exercises', exercises, plan.customExercises, (r) => ({
    ...r,
    force: null,
    level: null,
    mechanic: null,
  }));
  await addNew('custom foods', foods, plan.customFoods, (r) => ({
    ...r,
    sourceId: null,
    gtin: r.barcode,
  }));

  // A workout that used an exercise this phone does not have (one from an
  // older library, say) would vanish from history without it. Recreate it by
  // name as one of yours rather than drop the sets.
  const referenced = new Map<string, string>();
  for (const r of [...plan.routineExercises, ...plan.sessionExercises]) {
    if (!referenced.has(r.exerciseId)) referenced.set(r.exerciseId, r.exerciseName ?? 'Restored exercise');
  }
  const haveEx = await existing(exercises, [...referenced.keys()]);
  const missing = [...referenced].filter(([id]) => !haveEx.has(id));
  await insertChunked(
    exercises,
    missing.map(([id, name]) => ({
      id,
      name,
      category: CUSTOM_EXERCISE_CATEGORY,
      primaryMuscles: '[]',
      secondaryMuscles: '[]',
      instructions: '[]',
      images: '[]',
    }))
  );
  if (missing.length) added['exercises recreated by name'] = missing.length;

  await addNew('routines', routines, plan.routines);
  await addNew('routine exercises', routineExercises, plan.routineExercises, ({ exerciseName: _n, ...r }) => r);
  await addNew('workouts', workoutSessions, plan.workoutSessions);
  await addNew('workout exercises', sessionExercises, plan.sessionExercises, ({ exerciseName: _n, ...r }) => r);
  await addNew('sets', sets, plan.sets);

  // A log of a food this phone does not have (a scanned product, cached on
  // the old phone only) keeps its name, so it still reads right.
  const haveFood = await existing(
    foods,
    [...new Set(plan.foodLogs.map((l) => l.foodId).filter((x): x is string => !!x))]
  );
  await addNew('food logs', foodLogs, plan.foodLogs, ({ fallbackName, ...r }) => ({
    ...r,
    customName: r.customName ?? (r.foodId && !haveFood.has(r.foodId) ? fallbackName : null),
  }));
  await addNew('water logs', waterLogs, plan.waterLogs);
  await addNew('weigh-ins', weightEntries, plan.weightEntries);
  await addNew('coach chats', coachThreads, plan.coachThreads);
  await addNew('coach messages', coachMessages, plan.coachMessages);
  await addNew('injuries', injuries, plan.injuries);
  await addNew('progress photos', progressPhotos, plan.progressPhotos);
  const newCardio = await addNew('cardio sessions', cardioSessions, plan.cardioSessions, (r) => ({
    ...r,
    pausedAt: null,
    pausedMs: 0,
    segment: 0,
  }));
  // Points have no id of their own: they come with their session or not at
  // all, so a second restore does not draw every route twice.
  const points = plan.cardioPoints.filter((p) => newCardio.has(p.sessionId));
  await insertChunked(cardioPoints, points);
  if (points.length) added['GPS points'] = points.length;

  for (const s of plan.settings) {
    await db
      .insert(settings)
      .values(s)
      .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
  }
  if (plan.settings.length) added.settings = plan.settings.length;

  // This phone seeded the starter routines on first run. If the backup says
  // they were seeded before and the old phone no longer had them, you had
  // deleted them — so they go again, unless a workout here already used one.
  if (plan.settings.some((s) => s.key === SEEDED_KEY)) {
    const kept = new Set(plan.routines.map((r) => r.id));
    for (const id of STARTER_ROUTINE_IDS) {
      if (kept.has(id)) continue;
      const used = await db
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(eq(workoutSessions.routineId, id))
        .limit(1);
      if (used.length) continue;
      await db.delete(routineExercises).where(eq(routineExercises.routineId, id));
      await db.delete(routines).where(eq(routines.id, id));
    }
  }

  // The restored profile and weigh-ins may move the calorie floor.
  await reapplyCalorieFloor();

  const unreadable = Object.values(plan.skipped).reduce((a, b) => a + b, 0);
  return { added, alreadyHere, unreadable, photos };
}
