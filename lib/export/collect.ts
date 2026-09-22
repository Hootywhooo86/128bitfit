/**
 * Pulls user-authored data out of SQLite for export.
 *
 * What is deliberately NOT exported, and why:
 *
 * - `exercises`, `foods` — public-domain reference data that ships inside the
 *   app (~9 MB). It is not the user's data and including it would bury theirs.
 *   Rows that point at it carry the resolved name instead, so every exported
 *   file stands alone.
 * - `off_food_cache` — a reconstructible cache of Open Food Facts lookups.
 *   Third-party ODbL content rather than anything the user wrote.
 * - `meta` — internal import/version bookkeeping.
 *
 * API keys are never touched: they live in expo-secure-store, not in SQLite,
 * and nothing here reads them.
 */
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  coachMessages,
  coachThreads,
  exercises,
  foodLogs,
  foods,
  routineExercises,
  routines,
  sessionExercises,
  sets,
  settings,
  waterLogs,
  weightEntries,
  workoutSessions,
} from '@/db/schema';
import type { CsvRow } from './csv';

/** One exported table: a name, its rows, and a stable column order. */
export type ExportTable = {
  name: string;
  columns: string[];
  rows: CsvRow[];
};

export async function collectExport(): Promise<ExportTable[]> {
  const routineRows = await db.select().from(routines).orderBy(asc(routines.createdAt));

  const routineExerciseRows = await db
    .select({
      id: routineExercises.id,
      routine_id: routineExercises.routineId,
      exercise_id: routineExercises.exerciseId,
      exercise_name: exercises.name,
      position: routineExercises.position,
      target_sets: routineExercises.targetSets,
      target_reps: routineExercises.targetReps,
      rest_seconds: routineExercises.restSeconds,
      notes: routineExercises.notes,
    })
    .from(routineExercises)
    .leftJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .orderBy(asc(routineExercises.routineId), asc(routineExercises.position));

  const sessionRows = await db
    .select({
      id: workoutSessions.id,
      routine_id: workoutSessions.routineId,
      routine_name: routines.name,
      started_at: workoutSessions.startedAt,
      ended_at: workoutSessions.endedAt,
      status: workoutSessions.status,
      notes: workoutSessions.notes,
    })
    .from(workoutSessions)
    .leftJoin(routines, eq(workoutSessions.routineId, routines.id))
    .orderBy(asc(workoutSessions.startedAt));

  const sessionExerciseRows = await db
    .select({
      id: sessionExercises.id,
      session_id: sessionExercises.sessionId,
      exercise_id: sessionExercises.exerciseId,
      exercise_name: exercises.name,
      position: sessionExercises.position,
      rest_seconds: sessionExercises.restSeconds,
      notes: sessionExercises.notes,
    })
    .from(sessionExercises)
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .orderBy(asc(sessionExercises.sessionId), asc(sessionExercises.position));

  // Sets carry the session date and exercise name so this one file is enough
  // to reconstruct a training history in a spreadsheet.
  const setRows = await db
    .select({
      id: sets.id,
      session_exercise_id: sets.sessionExerciseId,
      session_id: sessionExercises.sessionId,
      session_started_at: workoutSessions.startedAt,
      exercise_id: sessionExercises.exerciseId,
      exercise_name: exercises.name,
      set_index: sets.setIndex,
      reps: sets.reps,
      weight: sets.weight,
      weight_unit: sets.weightUnit,
      completed: sets.completed,
      is_warmup: sets.isWarmup,
      rpe: sets.rpe,
    })
    .from(sets)
    .leftJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .leftJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .orderBy(asc(workoutSessions.startedAt), asc(sets.setIndex));

  const foodLogRows = await db
    .select({
      id: foodLogs.id,
      logged_at: foodLogs.loggedAt,
      meal_type: foodLogs.mealType,
      food_id: foodLogs.foodId,
      // Mirrors the app's own display rule: a custom name wins, otherwise the
      // bundled food's name. Both can be absent — see notes in the export doc.
      food_name: foodLogs.customName,
      catalog_name: foods.name,
      servings: foodLogs.servings,
      serving_size: foodLogs.servingSize,
      serving_unit: foodLogs.servingUnit,
      calories: foodLogs.calories,
      protein_g: foodLogs.protein,
      fat_g: foodLogs.fat,
      carb_g: foodLogs.carb,
      notes: foodLogs.notes,
    })
    .from(foodLogs)
    .leftJoin(foods, eq(foodLogs.foodId, foods.id))
    .orderBy(asc(foodLogs.loggedAt));

  const waterRows = await db.select().from(waterLogs).orderBy(asc(waterLogs.loggedAt));
  const weightRows = await db
    .select()
    .from(weightEntries)
    .orderBy(asc(weightEntries.loggedAt));
  const settingRows = await db.select().from(settings).orderBy(asc(settings.key));
  const threadRows = await db.select().from(coachThreads).orderBy(asc(coachThreads.createdAt));
  const messageRows = await db
    .select()
    .from(coachMessages)
    .orderBy(asc(coachMessages.createdAt));

  return [
    {
      name: 'routines',
      columns: ['id', 'name', 'notes', 'created_at'],
      rows: routineRows.map((r) => ({
        id: r.id,
        name: r.name,
        notes: r.notes,
        created_at: r.createdAt,
      })),
    },
    {
      name: 'routine_exercises',
      columns: [
        'id',
        'routine_id',
        'exercise_id',
        'exercise_name',
        'position',
        'target_sets',
        'target_reps',
        'rest_seconds',
        'notes',
      ],
      rows: routineExerciseRows,
    },
    {
      name: 'workout_sessions',
      columns: ['id', 'routine_id', 'routine_name', 'started_at', 'ended_at', 'status', 'notes'],
      rows: sessionRows,
    },
    {
      name: 'session_exercises',
      columns: [
        'id',
        'session_id',
        'exercise_id',
        'exercise_name',
        'position',
        'rest_seconds',
        'notes',
      ],
      rows: sessionExerciseRows,
    },
    {
      name: 'sets',
      columns: [
        'id',
        'session_id',
        'session_started_at',
        'session_exercise_id',
        'exercise_id',
        'exercise_name',
        'set_index',
        'reps',
        'weight',
        'weight_unit',
        'completed',
        'is_warmup',
        'rpe',
      ],
      rows: setRows,
    },
    {
      name: 'food_logs',
      columns: [
        'id',
        'logged_at',
        'meal_type',
        'food_id',
        'food_name',
        'servings',
        'serving_size',
        'serving_unit',
        'calories',
        'protein_g',
        'fat_g',
        'carb_g',
        'notes',
      ],
      rows: foodLogRows.map((r) => ({
        ...r,
        food_name: r.food_name ?? r.catalog_name ?? null,
        catalog_name: undefined,
      })),
    },
    {
      name: 'water_logs',
      columns: ['id', 'ml', 'logged_at'],
      rows: waterRows.map((r) => ({ id: r.id, ml: r.ml, logged_at: r.loggedAt })),
    },
    {
      name: 'weight_entries',
      columns: ['id', 'value', 'unit', 'logged_at', 'note'],
      rows: weightRows.map((r) => ({
        id: r.id,
        value: r.kgOrLb,
        unit: r.unit,
        logged_at: r.loggedAt,
        note: r.note,
      })),
    },
    {
      name: 'settings',
      columns: ['key', 'value'],
      rows: settingRows.map((r) => ({ key: r.key, value: r.value })),
    },
    {
      name: 'coach_threads',
      columns: ['id', 'mode', 'title', 'created_at', 'updated_at'],
      rows: threadRows.map((r) => ({
        id: r.id,
        mode: r.mode,
        title: r.title,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
    },
    {
      name: 'coach_messages',
      columns: ['id', 'thread_id', 'role', 'content', 'created_at'],
      rows: messageRows.map((r) => ({
        id: r.id,
        thread_id: r.threadId,
        role: r.role,
        content: r.content,
        created_at: r.createdAt,
      })),
    },
  ];
}
