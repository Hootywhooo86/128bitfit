import type { GameHistory } from './types';

/**
 * Experience points and levels.
 *
 * XP comes from three things, each capped so no single day can farm it:
 * completed working sets, cardio minutes and days with food logged. Quests
 * add a bonus (quests.ts). Everything is derived from the log, so it can be
 * recomputed at any time and two phones with the same data agree.
 *
 * Nothing here takes away XP. Missing a day or a week costs nothing.
 */

export const XP_PER_SET = 10;
/** Sets past this in one session earn nothing more: junk volume is not a goal. */
export const MAX_XP_SETS_PER_SESSION = 30;
export const XP_PER_CARDIO_MINUTE = 2;
/** Minutes past this in one cardio session earn nothing more. */
export const MAX_XP_MINUTES_PER_CARDIO = 120;
/** For logging food on a day, whatever was eaten. Once a day. */
export const XP_PER_LOGGED_DAY = 15;

export const MAX_LEVEL = 99;

/** Total XP needed to reach `level`. Level 2 at 100, 5 at 1,000, 10 at 4,500. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 50 * l * (l - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++;
  return level;
}

export type LevelProgress = {
  level: number;
  xp: number;
  /** XP into the current level, and what the level spans. */
  into: number;
  span: number | null;
};

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, xp, into: xp - xpForLevel(level), span: null };
  const base = xpForLevel(level);
  return { level, xp, into: xp - base, span: xpForLevel(level + 1) - base };
}

export function sessionXp(setCount: number): number {
  return Math.min(setCount, MAX_XP_SETS_PER_SESSION) * XP_PER_SET;
}

export function cardioXp(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.floor(Math.min(minutes, MAX_XP_MINUTES_PER_CARDIO)) * XP_PER_CARDIO_MINUTE;
}

/** One XP event, so the total can be split by when it was earned. */
export type XpEvent = { at: Date; xp: number };

/** Every XP event the log earns, before quest bonuses. */
export function activityXp(history: GameHistory): XpEvent[] {
  const events: XpEvent[] = [];
  for (const s of history.sessions) {
    const xp = sessionXp(s.sets.length);
    if (xp > 0) events.push({ at: s.startedAt, xp });
  }
  for (const c of history.cardio) {
    const xp = cardioXp(c.minutes);
    if (xp > 0) events.push({ at: c.startedAt, xp });
  }
  const days = new Set(history.foodDays.map((d) => d.day));
  for (const day of days) {
    const at = dayStart(day);
    if (at) events.push({ at, xp: XP_PER_LOGGED_DAY });
  }
  return events;
}

/** A local `YYYY-MM-DD` to local midnight. */
export function dayStart(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
