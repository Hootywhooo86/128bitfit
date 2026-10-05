import { and, eq, like, sql } from 'drizzle-orm';
import { dayKey } from '@/lib/fuel-day';
import { computeGame, type GameState } from '@/lib/game';
import { resolveLook, unlockedBetween, type Cosmetic, type Look } from '@/lib/game/cosmetics';
import { TROPHIES, type TrophyId } from '@/lib/game/trophies';
import type { GameHistory, GameSession } from '@/lib/game/types';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-load';
import { db } from './client';
import {
  cardioSessions,
  exercises,
  foodLogs,
  sessionExercises,
  sets,
  settings,
  weightEntries,
  workoutSessions,
} from './schema';
import { getAppSettings } from './settings-queries';
import { getSetting, setSetting } from './settings-store';

/**
 * The game layer's storage: a few settings keys, so they travel with the
 * export and the backup like every other setting.
 *
 *   game_on            '1' or '0' — the Settings toggle, on by default
 *   game_blip          '1' or '0' — the unlock sound, off by default
 *   game_look          JSON — the outfit, headband, pet and title worn
 *   game_seen_level    the last level a LEVEL UP! was shown for
 *   game_unlock:<id>   ISO date — when that trophy was earned
 */
const KEY_ON = 'game_on';
const KEY_BLIP = 'game_blip';
const KEY_LOOK = 'game_look';
const KEY_SEEN_LEVEL = 'game_seen_level';
const UNLOCK_PREFIX = 'game_unlock:';

const LB_TO_KG = 0.45359237;
const MUSCLES = new Set<string>(MUSCLE_GROUPS);

export async function gameOn(): Promise<boolean> {
  return (await getSetting(KEY_ON)) !== '0';
}

export async function setGameOn(on: boolean): Promise<void> {
  await setSetting(KEY_ON, on ? '1' : '0');
}

export async function blipOn(): Promise<boolean> {
  return (await getSetting(KEY_BLIP)) === '1';
}

export async function setBlipOn(on: boolean): Promise<void> {
  await setSetting(KEY_BLIP, on ? '1' : '0');
}

export async function saveLook(look: Look): Promise<void> {
  await setSetting(KEY_LOOK, JSON.stringify(look));
}

/**
 * Parsed muscle lists, by their JSON text. Every set of an exercise carries
 * the same text, so a history of thousands of sets parses a few dozen.
 */
const parsedMuscles = new Map<string, MuscleGroup[]>();

function muscles(json: string | null): MuscleGroup[] {
  const key = json ?? '';
  const hit = parsedMuscles.get(key);
  if (hit) return hit;
  const list = parseMuscles(json);
  parsedMuscles.set(key, list);
  return list;
}

function parseMuscles(json: string | null): MuscleGroup[] {
  try {
    const v: unknown = JSON.parse(json ?? '[]');
    return Array.isArray(v)
      ? v.map((m) => String(m).trim().toLowerCase()).filter((m): m is MuscleGroup => MUSCLES.has(m))
      : [];
  } catch {
    return [];
  }
}

/** Reads what the game is allowed to see — see lib/game/types.ts. */
export async function loadGameHistory(): Promise<GameHistory> {
  const setRows = await db
    .select({
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      exerciseId: sessionExercises.exerciseId,
      exerciseName: exercises.name,
      primary: exercises.primaryMuscles,
      secondary: exercises.secondaryMuscles,
      weight: sets.weight,
      unit: sets.weightUnit,
      reps: sets.reps,
      setType: sets.setType,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(
      and(eq(workoutSessions.status, 'completed'), eq(sets.completed, true), eq(sets.isWarmup, false))
    );

  const sessions = new Map<string, GameSession>();
  for (const r of setRows) {
    const s = sessions.get(r.sessionId) ?? { id: r.sessionId, startedAt: r.startedAt, sets: [] };
    s.sets.push({
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName ?? '',
      weightKg: r.weight == null ? null : r.unit === 'kg' ? r.weight : r.weight * LB_TO_KG,
      reps: r.reps,
      setType: r.setType,
      primary: muscles(r.primary),
      secondary: muscles(r.secondary),
    });
    sessions.set(r.sessionId, s);
  }

  const cardioRows = await db
    .select({
      id: cardioSessions.id,
      startedAt: cardioSessions.startedAt,
      movingS: cardioSessions.movingS,
      elapsedS: cardioSessions.elapsedS,
      distanceM: cardioSessions.distanceM,
    })
    .from(cardioSessions)
    .where(eq(cardioSessions.status, 'finished'));

  // Only when something was logged and how much protein — not how much was eaten.
  const foodRows = await db.select({ at: foodLogs.loggedAt, protein: foodLogs.protein }).from(foodLogs);
  const days = new Map<string, number | null>();
  for (const f of foodRows) {
    const key = dayKey(f.at);
    const prev = days.get(key) ?? null;
    days.set(key, f.protein == null ? prev : (prev ?? 0) + f.protein);
  }

  const weights = await db
    .select({ at: weightEntries.loggedAt, value: weightEntries.kgOrLb, unit: weightEntries.unit })
    .from(weightEntries);

  const app = await getAppSettings();

  return {
    sessions: [...sessions.values()],
    cardio: cardioRows.map((c) => ({
      id: c.id,
      startedAt: new Date(c.startedAt),
      minutes: (c.movingS ?? c.elapsedS ?? 0) / 60,
      distanceM: c.distanceM,
    })),
    foodDays: [...days].map(([day, proteinG]) => ({ day, proteinG })),
    weighIns: weights
      .filter((w) => w.value > 0)
      .map((w) => ({ at: w.at, kg: w.unit === 'kg' ? w.value : w.value * LB_TO_KG })),
    proteinTargetG: app.proteinTarget > 0 ? app.proteinTarget : null,
  };
}

export type GameView = GameState & {
  look: Look;
  /** When each earned trophy was first recorded, from storage. */
  unlockedAt: Partial<Record<TrophyId, Date>>;
};

/** What just happened, for the LEVEL UP! banner and the unlock toast. */
export type GameNews = {
  levelUp: { from: number; to: number; unlocked: Cosmetic[] } | null;
  trophies: TrophyId[];
};

async function storedUnlocks(): Promise<Partial<Record<TrophyId, Date>>> {
  const rows = await db.select().from(settings).where(like(settings.key, `${UNLOCK_PREFIX}%`));
  const out: Partial<Record<TrophyId, Date>> = {};
  for (const r of rows) {
    const id = r.key.slice(UNLOCK_PREFIX.length) as TrophyId;
    const at = new Date(r.value);
    if (TROPHIES.some((t) => t.id === id) && !Number.isNaN(at.getTime())) out[id] = at;
  }
  return out;
}

/**
 * A cheap summary of everything the game reads: counts and sums, one query.
 * If it has not changed since the last computation, neither has the game —
 * so visiting Home again does not re-read and re-judge the whole history.
 */
async function fingerprint(now: Date): Promise<string> {
  const rows = await db.all<Record<string, unknown>>(sql`
    select
      (select count(*) || ':' || coalesce(max(started_at), 0) from workout_sessions where status = 'completed') as w,
      (select count(*) || ':' || coalesce(sum(weight), 0) || ':' || coalesce(sum(reps), 0) || ':' || coalesce(sum(distance_m), 0)
         from sets where completed = 1 and is_warmup = 0) as s,
      (select count(*) || ':' || coalesce(sum(distance_m), 0) || ':' || coalesce(sum(moving_s), 0) || ':' || coalesce(sum(elapsed_s), 0)
         from cardio_sessions where status = 'finished') as c,
      (select count(*) || ':' || coalesce(sum(protein), 0) || ':' || coalesce(max(logged_at), 0) from food_logs) as f,
      (select count(*) || ':' || coalesce(max(kg_or_lb), 0) from weight_entries) as b,
      (select count(*) || ':' || coalesce(sum(length(primary_muscles)), 0) from exercises
         where category in ('custom', 'imported')) as e
  `);
  const protein = await getSetting('protein_target');
  // Quests are per week and stats look back four weeks: the day matters too.
  return JSON.stringify([rows[0] ?? null, protein, dayKey(now)]);
}

let cached: { key: string; state: GameState } | null = null;

/** Computes the game from the log and merges in what storage remembers. */
export async function loadGame(now = new Date()): Promise<GameView> {
  const key = await fingerprint(now);
  let state = cached?.key === key ? cached.state : null;
  if (!state) {
    state = computeGame(await loadGameHistory(), now);
    cached = { key, state };
  }
  const [unlockedAt, lookRaw] = await Promise.all([storedUnlocks(), getSetting(KEY_LOOK)]);
  let look: unknown = null;
  try {
    look = lookRaw ? JSON.parse(lookRaw) : null;
  } catch {
    look = null;
  }
  return { ...state, look: resolveLook(look, state.progress.level), unlockedAt };
}

/**
 * Records new trophies and the level reached, and says what is new.
 *
 * A trophy's stored date is the day it was won, not the day it was noticed.
 * Once stored it stays, so deleting an old workout does not take a trophy back.
 */
export async function recordGameNews(view: GameView): Promise<GameNews> {
  const fresh = view.trophies.filter((t) => t.earnedAt && !view.unlockedAt[t.id]);
  for (const t of fresh) await setSetting(`${UNLOCK_PREFIX}${t.id}`, t.earnedAt!.toISOString());

  const seen = Number(await getSetting(KEY_SEEN_LEVEL)) || 1;
  const level = view.progress.level;
  if (level !== seen) await setSetting(KEY_SEEN_LEVEL, String(level));
  return {
    levelUp: level > seen ? { from: seen, to: level, unlocked: unlockedBetween(seen, level) } : null,
    trophies: fresh.map((t) => t.id),
  };
}
