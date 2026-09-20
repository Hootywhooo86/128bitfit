import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Key/value store for import versioning and app settings. */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  force: text('force'),
  level: text('level'),
  mechanic: text('mechanic'),
  equipment: text('equipment'),
  /** JSON array of strings */
  primaryMuscles: text('primary_muscles').notNull().default('[]'),
  /** JSON array of strings */
  secondaryMuscles: text('secondary_muscles').notNull().default('[]'),
  /** JSON array of instruction steps */
  instructions: text('instructions').notNull().default('[]'),
  category: text('category'),
  /** JSON array of relative image paths */
  images: text('images').notNull().default('[]'),
});

export const foods = sqliteTable('foods', {
  id: text('id').primaryKey(),
  sourceId: text('source_id'),
  name: text('name').notNull(),
  description: text('description'),
  source: text('source'),
  barcode: text('barcode'),
  gtin: text('gtin'),
  brand: text('brand'),
  servingSize: real('serving_size'),
  servingUnit: text('serving_unit'),
  nutritionBasis: text('nutrition_basis'),
  /** JSON map of nutrient key → number | null */
  nutrients: text('nutrients').notNull().default('{}'),
});

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const routineExercises = sqliteTable('routine_exercises', {
  id: text('id').primaryKey(),
  routineId: text('routine_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  targetSets: integer('target_sets'),
  targetReps: integer('target_reps'),
  restSeconds: integer('rest_seconds').default(60),
  notes: text('notes'),
});

export const SESSION_STATUSES = ['in_progress', 'completed', 'discarded'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const workoutSessions = sqliteTable('workout_sessions', {
  id: text('id').primaryKey(),
  routineId: text('routine_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('in_progress'),
  notes: text('notes'),
});

export const sessionExercises = sqliteTable('session_exercises', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  restSeconds: integer('rest_seconds').default(60),
  notes: text('notes'),
});

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  sessionExerciseId: text('session_exercise_id').notNull(),
  setIndex: integer('set_index').notNull(),
  reps: integer('reps'),
  weight: real('weight'),
  weightUnit: text('weight_unit').default('lb'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
  rpe: real('rpe'),
});

export const foodLogs = sqliteTable('food_logs', {
  id: text('id').primaryKey(),
  foodId: text('food_id'),
  loggedAt: integer('logged_at', { mode: 'timestamp' }),
  servings: real('servings'),
  meal: text('meal'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Exercise = typeof exercises.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type WorkoutSet = typeof sets.$inferSelect;
