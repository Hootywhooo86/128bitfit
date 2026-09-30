/**
 * Reading a 128BIT FIT export or backup file back into rows the database can
 * take.
 *
 * Pure — text in, rows out — so every rule here is tested without a phone.
 * The database side (db/restore.ts) only decides what is already there.
 *
 * Rules:
 * - Only this app's own file is accepted. Anything else is refused in one
 *   sentence rather than half-imported.
 * - A row that cannot be read is skipped and counted, never filled with
 *   zeroes: a restore that invents a 0 kg weigh-in is worse than one that
 *   says it skipped one.
 * - Photo paths are moved from the old phone's app folder to this one's.
 * - A photo whose path tries to climb out of the photo folders is refused.
 *   A backup file is something a person can be sent, so it is treated as
 *   untrusted input.
 */
import { CUSTOM_EXERCISE_CATEGORY } from '@/lib/exercise-sources';

export class RestoreError extends Error {}

/** The folders photos live in, under the app's document folder. */
export const PHOTO_FOLDERS = ['progress-photos', 'exercise-photos', 'food-photos', 'gym-pass'] as const;

type Row = Record<string, unknown>;

export type RestorePlan = {
  exportedAt: string | null;
  routines: { id: string; name: string; notes: string | null; createdAt: Date | null }[];
  routineExercises: {
    id: string;
    routineId: string;
    exerciseId: string;
    exerciseName: string | null;
    position: number;
    targetSets: number | null;
    targetReps: number | null;
    restSeconds: number | null;
    notes: string | null;
  }[];
  workoutSessions: {
    id: string;
    routineId: string | null;
    startedAt: Date;
    endedAt: Date | null;
    status: 'in_progress' | 'completed' | 'discarded';
    notes: string | null;
  }[];
  sessionExercises: {
    id: string;
    sessionId: string;
    exerciseId: string;
    exerciseName: string | null;
    position: number;
    restSeconds: number | null;
    notes: string | null;
    supersetGroup: string | null;
  }[];
  sets: {
    id: string;
    sessionExerciseId: string;
    setIndex: number;
    reps: number | null;
    weight: number | null;
    weightUnit: string | null;
    completed: boolean;
    isWarmup: boolean;
    setType: 'normal' | 'drop' | 'rp';
    rpe: number | null;
  }[];
  foodLogs: {
    id: string;
    foodId: string | null;
    customName: string | null;
    /** The name the file shows, for a food this phone does not have. */
    fallbackName: string | null;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    loggedAt: Date;
    servings: number;
    servingSize: number | null;
    servingUnit: string | null;
    calories: number;
    protein: number | null;
    fat: number | null;
    carb: number | null;
    notes: string | null;
  }[];
  waterLogs: { id: string; ml: number; loggedAt: Date }[];
  weightEntries: { id: string; kgOrLb: number; unit: 'kg' | 'lb'; loggedAt: Date; note: string | null }[];
  settings: { key: string; value: string }[];
  coachThreads: { id: string; mode: string; title: string; createdAt: Date; updatedAt: Date }[];
  coachMessages: { id: string; threadId: string; role: string; content: string; createdAt: Date }[];
  injuries: {
    id: string;
    area: string;
    severity: 'mild' | 'moderate' | 'severe';
    notes: string | null;
    avoid: string | null;
    startedAt: Date;
    resolvedAt: Date | null;
  }[];
  progressPhotos: { id: string; pose: 'front' | 'side' | 'back'; uri: string; takenAt: Date }[];
  customExercises: {
    id: string;
    name: string;
    equipment: string | null;
    primaryMuscles: string;
    secondaryMuscles: string;
    instructions: string;
    category: string;
    images: string;
  }[];
  customFoods: {
    id: string;
    name: string;
    brand: string | null;
    description: string | null;
    source: string;
    barcode: string | null;
    servingSize: number | null;
    servingUnit: string | null;
    nutritionBasis: string | null;
    nutrients: string;
    photoUri: string | null;
  }[];
  cardioSessions: {
    id: string;
    sport: string;
    status: 'recording' | 'paused' | 'finished';
    startedAt: number;
    endedAt: number | null;
    distanceM: number | null;
    movingS: number | null;
    elapsedS: number | null;
    elevGainM: number | null;
    manual: boolean;
    notes: string | null;
  }[];
  cardioPoints: {
    sessionId: string;
    t: number;
    lat: number;
    lon: number;
    alt: number | null;
    accuracy: number | null;
    speed: number | null;
    segment: number;
  }[];
  /** Photos to write, by path under the document folder. */
  files: { path: string; base64: string }[];
  /** Rows that could not be read, by table. */
  skipped: Record<string, number>;
};

// --- field readers ----------------------------------------------------------

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';
const date = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
/** "chest; triceps" back to the JSON list the app stores. */
const list = (v: unknown): string => {
  const s = typeof v === 'string' ? v : '';
  return JSON.stringify(s.split(';').map((x) => x.trim()).filter(Boolean));
};

/**
 * A photo path from the file, made safe: relative, inside one of the photo
 * folders, no climbing. Null means refuse it.
 */
export function safePhotoPath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-z]+:/i.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((p) => p === '..' || p === '.' || p === '')) return null;
  if (parts.length !== 2) return null;
  if (!(PHOTO_FOLDERS as readonly string[]).includes(parts[0])) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[1])) return null;
  return path;
}

/**
 * Builds the restore from the file's text. `documentDir` is this phone's app
 * folder (a file:// URI ending in /), which photo paths are moved into.
 */
export function planRestore(text: string, documentDir: string): RestorePlan {
  let env: Row;
  try {
    env = JSON.parse(text) as Row;
  } catch {
    throw new RestoreError('That file is not a 128BIT FIT backup — it could not be read as JSON.');
  }
  if (!env || typeof env !== 'object' || env.format !== '128bitfit-export') {
    throw new RestoreError('That file is not a 128BIT FIT backup. Choose the .json file the app exported.');
  }
  const version = num(env.formatVersion) ?? 0;
  if (version < 1 || version > 2) {
    throw new RestoreError(
      'That backup was made by a newer version of 128BIT FIT. Update the app, then restore it.'
    );
  }
  const tables = (env.tables ?? {}) as Record<string, unknown>;
  const rows = (name: string): Row[] =>
    Array.isArray(tables[name]) ? (tables[name] as unknown[]).filter((r): r is Row => !!r && typeof r === 'object') : [];

  const skipped: Record<string, number> = {};
  const skip = (table: string) => {
    skipped[table] = (skipped[table] ?? 0) + 1;
  };

  // Photos move from the old phone's app folder to this one's.
  const oldDir = str(env.documentDir);
  const moveUri = (v: string | null): string | null =>
    v && oldDir && v.startsWith(oldDir) ? documentDir + v.slice(oldDir.length) : v;
  const moveAll = (v: string): string => (oldDir ? v.split(oldDir).join(documentDir) : v);

  // Collects rows, skipping any whose reader returns null.
  function take<T>(table: string, read: (r: Row) => T | null): T[] {
    const out: T[] = [];
    for (const r of rows(table)) {
      const v = read(r);
      if (v == null) skip(table);
      else out.push(v);
    }
    return out;
  }

  const files: { path: string; base64: string }[] = [];
  const rawFiles = env.files && typeof env.files === 'object' ? (env.files as Row) : {};
  for (const [path, data] of Object.entries(rawFiles)) {
    const safe = safePhotoPath(path);
    if (!safe || typeof data !== 'string') {
      skip('files');
      continue;
    }
    files.push({ path: safe, base64: data });
  }

  return {
    exportedAt: str(env.exportedAt),
    routines: take('routines', (r) => {
      const id = str(r.id);
      const name = str(r.name);
      return id && name ? { id, name, notes: str(r.notes), createdAt: date(r.created_at) } : null;
    }),
    routineExercises: take('routine_exercises', (r) => {
      const id = str(r.id);
      const routineId = str(r.routine_id);
      const exerciseId = str(r.exercise_id);
      if (!id || !routineId || !exerciseId) return null;
      return {
        id,
        routineId,
        exerciseId,
        exerciseName: str(r.exercise_name),
        position: num(r.position) ?? 0,
        targetSets: num(r.target_sets),
        targetReps: num(r.target_reps),
        restSeconds: num(r.rest_seconds),
        notes: str(r.notes),
      };
    }),
    workoutSessions: take('workout_sessions', (r) => {
      const id = str(r.id);
      const startedAt = date(r.started_at);
      if (!id || !startedAt) return null;
      return {
        id,
        routineId: str(r.routine_id),
        startedAt,
        endedAt: date(r.ended_at),
        status: oneOf(r.status, ['in_progress', 'completed', 'discarded'] as const, 'completed'),
        notes: str(r.notes),
      };
    }),
    sessionExercises: take('session_exercises', (r) => {
      const id = str(r.id);
      const sessionId = str(r.session_id);
      const exerciseId = str(r.exercise_id);
      if (!id || !sessionId || !exerciseId) return null;
      return {
        id,
        sessionId,
        exerciseId,
        exerciseName: str(r.exercise_name),
        position: num(r.position) ?? 0,
        restSeconds: num(r.rest_seconds),
        notes: str(r.notes),
        supersetGroup: str(r.superset_group),
      };
    }),
    sets: take('sets', (r) => {
      const id = str(r.id);
      const sessionExerciseId = str(r.session_exercise_id);
      const setIndex = num(r.set_index);
      if (!id || !sessionExerciseId || setIndex == null) return null;
      return {
        id,
        sessionExerciseId,
        setIndex,
        reps: num(r.reps),
        weight: num(r.weight),
        weightUnit: str(r.weight_unit),
        completed: bool(r.completed),
        isWarmup: bool(r.is_warmup),
        setType: oneOf(r.set_type, ['normal', 'drop', 'rp'] as const, 'normal'),
        rpe: num(r.rpe),
      };
    }),
    foodLogs: take('food_logs', (r) => {
      const id = str(r.id);
      const loggedAt = date(r.logged_at);
      const calories = num(r.calories);
      if (!id || !loggedAt || calories == null) return null;
      const foodId = str(r.food_id);
      // Version 1 files have no custom_name: a log with no food behind it was
      // named by food_name, which is then its custom name.
      const customName = version >= 2 ? str(r.custom_name) : foodId ? null : str(r.food_name);
      return {
        id,
        foodId,
        customName,
        fallbackName: str(r.food_name),
        mealType: oneOf(r.meal_type, ['breakfast', 'lunch', 'dinner', 'snack'] as const, 'snack'),
        loggedAt,
        servings: num(r.servings) ?? 1,
        servingSize: num(r.serving_size),
        servingUnit: str(r.serving_unit),
        calories,
        protein: num(r.protein_g),
        fat: num(r.fat_g),
        carb: num(r.carb_g),
        notes: str(r.notes),
      };
    }),
    waterLogs: take('water_logs', (r) => {
      const id = str(r.id);
      const ml = num(r.ml);
      const loggedAt = date(r.logged_at);
      return id && ml != null && loggedAt ? { id, ml, loggedAt } : null;
    }),
    weightEntries: take('weight_entries', (r) => {
      const id = str(r.id);
      const value = num(r.value);
      const loggedAt = date(r.logged_at);
      if (!id || value == null || value <= 0 || !loggedAt) return null;
      return { id, kgOrLb: value, unit: r.unit === 'kg' ? ('kg' as const) : ('lb' as const), loggedAt, note: str(r.note) };
    }),
    settings: take('settings', (r) => {
      const key = str(r.key);
      if (!key) return null;
      const value = typeof r.value === 'string' ? moveAll(r.value) : '';
      return { key, value };
    }),
    coachThreads: take('coach_threads', (r) => {
      const id = str(r.id);
      const createdAt = date(r.created_at);
      if (!id || !createdAt) return null;
      return {
        id,
        mode: str(r.mode) ?? 'chat',
        title: str(r.title) ?? 'Coach',
        createdAt,
        updatedAt: date(r.updated_at) ?? createdAt,
      };
    }),
    coachMessages: take('coach_messages', (r) => {
      const id = str(r.id);
      const threadId = str(r.thread_id);
      const createdAt = date(r.created_at);
      const content = typeof r.content === 'string' ? r.content : null;
      if (!id || !threadId || !createdAt || content == null) return null;
      return { id, threadId, role: str(r.role) ?? 'assistant', content, createdAt };
    }),
    injuries: take('injuries', (r) => {
      const id = str(r.id);
      const area = str(r.area);
      const startedAt = date(r.started_at);
      if (!id || !area || !startedAt) return null;
      return {
        id,
        area,
        severity: oneOf(r.severity, ['mild', 'moderate', 'severe'] as const, 'mild'),
        notes: str(r.notes),
        avoid: str(r.avoid),
        startedAt,
        resolvedAt: date(r.resolved_at),
      };
    }),
    progressPhotos: take('progress_photos', (r) => {
      const id = str(r.id);
      const uri = moveUri(str(r.file));
      const takenAt = date(r.taken_at);
      if (!id || !uri || !takenAt) return null;
      return { id, pose: oneOf(r.pose, ['front', 'side', 'back'] as const, 'front'), uri, takenAt };
    }),
    customExercises: take('custom_exercises', (r) => {
      const id = str(r.id);
      const name = str(r.name);
      if (!id || !name) return null;
      const photo = moveUri(str(r.photo));
      return {
        id,
        name,
        equipment: str(r.equipment),
        primaryMuscles: list(r.primary_muscles),
        secondaryMuscles: list(r.secondary_muscles),
        instructions: list(r.instructions),
        category: str(r.category) ?? CUSTOM_EXERCISE_CATEGORY,
        images: JSON.stringify(photo ? [photo] : []),
      };
    }),
    customFoods: take('custom_foods', (r) => {
      const id = str(r.id);
      const name = str(r.name);
      if (!id || !name) return null;
      let nutrients = '{}';
      if (typeof r.nutrients === 'string') {
        try {
          JSON.parse(r.nutrients);
          nutrients = r.nutrients;
        } catch {
          return null;
        }
      }
      return {
        id,
        name,
        brand: str(r.brand),
        description: str(r.description),
        source: oneOf(r.source, ['custom', 'recipe'] as const, 'custom'),
        barcode: str(r.barcode),
        servingSize: num(r.serving_size),
        servingUnit: str(r.serving_unit),
        nutritionBasis: str(r.nutrition_basis),
        nutrients,
        photoUri: moveUri(str(r.photo)),
      };
    }),
    cardioSessions: take('cardio_sessions', (r) => {
      const id = str(r.id);
      const started = date(r.started_at);
      if (!id || !started) return null;
      return {
        id,
        sport: str(r.sport) ?? 'walk',
        // Restored sessions are history: one left recording has no tracker
        // behind it on this phone.
        status: 'finished' as const,
        startedAt: started.getTime(),
        endedAt: date(r.ended_at)?.getTime() ?? null,
        distanceM: num(r.distance_m),
        movingS: num(r.moving_s),
        elapsedS: num(r.elapsed_s),
        elevGainM: num(r.elev_gain_m),
        manual: bool(r.manual),
        notes: str(r.notes),
      };
    }),
    cardioPoints: take('cardio_points', (r) => {
      const sessionId = str(r.session_id);
      const t = date(r.t);
      const lat = num(r.lat);
      const lon = num(r.lon);
      if (!sessionId || !t || lat == null || lon == null) return null;
      return {
        sessionId,
        t: t.getTime(),
        lat,
        lon,
        alt: num(r.alt),
        accuracy: num(r.accuracy),
        speed: num(r.speed),
        segment: num(r.segment) ?? 0,
      };
    }),
    files,
    skipped,
  };
}
