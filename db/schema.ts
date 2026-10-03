import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  /**
   * Photo of a custom food, as a file:// URI under the app's document
   * directory. Null for catalog foods and for custom foods added without one.
   */
  photoUri: text('photo_uri'),
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
  /** 'reps' or 'distance'; null means whatever the exercise is remembered as. */
  track: text('track', { enum: ['reps', 'distance'] }),
});

export const SESSION_STATUSES = ['in_progress', 'completed', 'discarded'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const workoutSessions = sqliteTable('workout_sessions', {
  id: text('id').primaryKey(),
  routineId: text('routine_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  status: text('status', { enum: SESSION_STATUSES }).notNull().default('in_progress'),
  notes: text('notes'),
});

export const sessionExercises = sqliteTable('session_exercises', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  restSeconds: integer('rest_seconds').default(60),
  notes: text('notes'),
  /** Exercises sharing a group are a superset: rest only after the last of them. */
  supersetGroup: text('superset_group'),
  /** 'reps' or 'distance': how this exercise's sets are logged in this session. */
  track: text('track', { enum: ['reps', 'distance'] }).notNull().default('reps'),
});

export const SET_TYPES = ['normal', 'drop', 'rp'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  sessionExerciseId: text('session_exercise_id').notNull(),
  setIndex: integer('set_index').notNull(),
  reps: integer('reps'),
  weight: real('weight'),
  weightUnit: text('weight_unit').default('lb'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
  setType: text('set_type', { enum: SET_TYPES }).notNull().default('normal'),
  rpe: real('rpe'),
  /** Metres, for a set logged as weight x distance (a carry, a sled). Reps are null then. */
  distanceM: real('distance_m'),
});

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const foodLogs = sqliteTable('food_logs', {
  id: text('id').primaryKey(),
  foodId: text('food_id'),
  customName: text('custom_name'),
  mealType: text('meal_type', { enum: MEAL_TYPES }).notNull().default('snack'),
  loggedAt: integer('logged_at', { mode: 'timestamp' }).notNull(),
  servings: real('servings').notNull().default(1),
  servingSize: real('serving_size'),
  servingUnit: text('serving_unit'),
  calories: real('calories').notNull().default(0),
  /**
   * Macros are nullable: null means nobody knows, 0 means the food genuinely
   * has none. They used to be NOT NULL DEFAULT 0, which made an unestimated
   * macro read as "this meal had no fat".
   */
  protein: real('protein'),
  fat: real('fat'),
  carb: real('carb'),
  notes: text('notes'),
});

export const waterLogs = sqliteTable('water_logs', {
  id: text('id').primaryKey(),
  ml: integer('ml').notNull(),
  loggedAt: integer('logged_at', { mode: 'timestamp' }).notNull(),
});

/** App settings key/value (daily goals, preferences). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const weightEntries = sqliteTable('weight_entries', {
  id: text('id').primaryKey(),
  /** Numeric value as entered (kg or lb depending on unit). */
  kgOrLb: real('kg_or_lb').notNull(),
  unit: text('unit').notNull().default('lb'),
  loggedAt: integer('logged_at', { mode: 'timestamp' }).notNull(),
  note: text('note'),
});


/** Runtime Open Food Facts cache (per-barcode; survives USDA re-import). */
export const offFoodCache = sqliteTable('off_food_cache', {
  barcode: text('barcode').primaryKey(),
  sourceId: text('source_id'),
  name: text('name').notNull(),
  brand: text('brand'),
  servingSize: real('serving_size'),
  servingUnit: text('serving_unit'),
  nutritionBasis: text('nutrition_basis'),
  /** JSON map of nutrient key → number | null */
  nutrients: text('nutrients').notNull().default('{}'),
  cachedAt: integer('cached_at', { mode: 'timestamp' }).notNull(),
  productUrl: text('product_url'),
  /** JSON: which nutrient keys were present in the OFF payload */
  nutrientKeysPresent: text('nutrient_keys_present').notNull().default('[]'),
});

export const INJURY_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type InjurySeverity = (typeof INJURY_SEVERITIES)[number];

/**
 * Pain & injury log. A training aid, not a diagnosis: it records what the user
 * says hurts so the coach can work around it. Nothing reads it as medical data.
 */
export const injuries = sqliteTable('injuries', {
  id: text('id').primaryKey(),
  area: text('area').notNull(),
  severity: text('severity', { enum: INJURY_SEVERITIES }).notNull().default('mild'),
  /** What makes it worse, in the user's words. */
  notes: text('notes'),
  /** Movements to stay off, in the user's words. */
  avoid: text('avoid'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
});

export const PHOTO_POSES = ['front', 'side', 'back'] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

/** Progress photos. The image is a file on the phone; this is its index. */
export const progressPhotos = sqliteTable('progress_photos', {
  id: text('id').primaryKey(),
  pose: text('pose', { enum: PHOTO_POSES }).notNull(),
  uri: text('uri').notNull(),
  takenAt: integer('taken_at', { mode: 'timestamp' }).notNull(),
});

export type Injury = typeof injuries.$inferSelect;
export type ProgressPhoto = typeof progressPhotos.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type OffFoodCache = typeof offFoodCache.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type WorkoutSet = typeof sets.$inferSelect;
export type FoodLog = typeof foodLogs.$inferSelect;
export type WaterLog = typeof waterLogs.$inferSelect;
export type WeightEntry = typeof weightEntries.$inferSelect;
export type Setting = typeof settings.$inferSelect;

export const coachThreads = sqliteTable('coach_threads', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const coachMessages = sqliteTable('coach_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type CoachThread = typeof coachThreads.$inferSelect;
export type CoachMessage = typeof coachMessages.$inferSelect;

export const CARDIO_STATUSES = ['recording', 'paused', 'finished'] as const;

/**
 * One outdoor (GPS) or indoor (typed-in) cardio session.
 *
 * Times are plain milliseconds, unlike the strength tables: a GPS track needs
 * sub-second order, and splitting it by hand is where rounding bugs live.
 * The totals are written when the session finishes, from its points, so the
 * history list does not re-read every fix to show a distance.
 */
export const cardioSessions = sqliteTable('cardio_sessions', {
  id: text('id').primaryKey(),
  sport: text('sport').notNull(),
  status: text('status', { enum: CARDIO_STATUSES }).notNull().default('recording'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  /** Set while manually paused; the pause's length is added to pausedMs on resume. */
  pausedAt: integer('paused_at'),
  pausedMs: integer('paused_ms').notNull().default(0),
  /** Bumped on every resume, so no distance is drawn across a pause. */
  segment: integer('segment').notNull().default(0),
  distanceM: real('distance_m'),
  movingS: integer('moving_s'),
  elapsedS: integer('elapsed_s'),
  elevGainM: real('elev_gain_m'),
  /** Typed in by hand (treadmill, indoor ride): there is no route. */
  manual: integer('manual', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
});

/** Every GPS fix the phone reported while recording, as it reported it. */
export const cardioPoints = sqliteTable(
  'cardio_points',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull(),
    t: integer('t').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    alt: real('alt'),
    accuracy: real('accuracy'),
    speed: real('speed'),
    segment: integer('segment').notNull().default(0),
  },
  (table) => [index('cardio_points_session_t').on(table.sessionId, table.t)]
);

export type CardioSession = typeof cardioSessions.$inferSelect;
export type CardioPoint = typeof cardioPoints.$inferSelect;
