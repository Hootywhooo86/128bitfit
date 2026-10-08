import { dayKey } from '@/lib/fuel-day';
import { mondayOf } from '@/lib/weekly-recap';
import {
  drawMonthly,
  drawWeekly,
  emptyPeriod,
  mondayKey,
  monthKey,
  summarise,
  type Period,
} from './quest-pool';
import type { GameHistory } from './types';

/**
 * Weekly quests: three small goals, new every Monday.
 *
 * Missing one costs nothing — no lost XP, no broken streak, no reminder. They
 * are sized from your own last four weeks, so they ask for about what you
 * already do, not for more every week. And none of them is about eating less:
 * the food quest is reaching protein, which means eating enough.
 */
export type QuestId = 'train' | 'move' | 'variety' | 'protein';

export type Quest = {
  id: string;
  title: string;
  target: number;
  done: number;
  complete: boolean;
  /** The monthly HARD quest. */
  hard?: boolean;
};

export const QUEST_XP = 50;
export const HARD_QUEST_XP = 400;

/**
 * The week the 100-quest pool starts. Weeks before it keep the quests they
 * had (the four originals), so XP already earned never moves.
 */
export const POOL_START = new Date(2026, 9, 5);
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Local midnight `weeks` Mondays after `monday` (negative goes back). DST-safe. */
function addWeeks(monday: Date, weeks: number): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weeks * 7);
}

/** Everything one Monday-to-Sunday week holds, so a week is read once, not rescanned. */
type Week = {
  /** Strength sessions with sets, plus cardio sessions. */
  workouts: number;
  cardioMinutes: number;
  /** Local `YYYY-MM-DD` of each workout, for the protein quest. */
  trainingDays: Set<string>;
  /** Primary muscles trained, for the variety quest. */
  muscles: Set<string>;
};

type WeekIndex = Map<number, Week>;

function indexWeeks(history: GameHistory): WeekIndex {
  const weeks: WeekIndex = new Map();
  const week = (at: Date) => {
    const key = mondayOf(at).getTime();
    let w = weeks.get(key);
    if (!w) {
      w = { workouts: 0, cardioMinutes: 0, trainingDays: new Set(), muscles: new Set() };
      weeks.set(key, w);
    }
    return w;
  };
  for (const s of history.sessions) {
    const w = week(s.startedAt);
    for (const set of s.sets) for (const m of set.primary) w.muscles.add(m);
    if (s.sets.length === 0) continue;
    w.workouts++;
    w.trainingDays.add(dayKey(s.startedAt));
  }
  for (const c of history.cardio) {
    const w = week(c.startedAt);
    w.workouts++;
    w.cardioMinutes += Math.max(0, c.minutes);
    w.trainingDays.add(dayKey(c.startedAt));
  }
  return weeks;
}

/** The original four-quest rules, for weeks before POOL_START. */
export function legacyQuestsForWeek(history: GameHistory, monday: Date): Quest[] {
  return questsFromIndex(history, indexWeeks(history), proteinDays(history), monday);
}

function poolQuests(weeks: Map<number, Period>, monday: Date, hasProtein: boolean): Quest[] {
  const prior = [1, 2, 3, 4].map((k) => weeks.get(addWeeks(monday, -k).getTime())).filter((p): p is Period => !!p);
  const now = weeks.get(monday.getTime());
  return drawWeekly(prior, dayKey(monday), hasProtein).map((t) => {
    const done = now ? t.measure(now) : 0;
    return { id: t.id, title: t.title, target: t.target, done: Math.min(done, t.target), complete: done >= t.target };
  });
}

/** The quests for the week starting `monday`, and how far along they are. */
export function questsForWeek(history: GameHistory, monday: Date): Quest[] {
  if (monday.getTime() < POOL_START.getTime()) return legacyQuestsForWeek(history, monday);
  const hasProtein = history.proteinTargetG != null && history.proteinTargetG > 0;
  return poolQuests(summarise(history, mondayKey), monday, hasProtein);
}

/** The month's HARD quest, and how far along it is. */
export function monthlyQuest(history: GameHistory, now: Date): Quest {
  return monthlyFrom(summarise(history, monthKey), new Date(now.getFullYear(), now.getMonth(), 1));
}

function monthlyFrom(months: Map<number, Period>, first: Date): Quest {
  const prior = [1, 2, 3]
    .map((k) => months.get(new Date(first.getFullYear(), first.getMonth() - k, 1).getTime()))
    .filter((p): p is Period => !!p);
  const { template, target } = drawMonthly(prior, dayKey(first));
  const done = template.measure(months.get(first.getTime()) ?? emptyPeriod());
  return { id: template.id, title: template.title(target), target, done: Math.min(done, target), complete: done >= target, hard: true };
}

/** Days whose logged protein reached the target. */
function proteinDays(history: GameHistory): Set<string> {
  const target = history.proteinTargetG;
  if (target == null || target <= 0) return new Set();
  return new Set(history.foodDays.filter((d) => d.proteinG != null && d.proteinG >= target).map((d) => d.day));
}

function questsFromIndex(history: GameHistory, weeks: WeekIndex, protein: Set<string>, monday: Date): Quest[] {
  let priorWorkouts = 0;
  let priorCardio = 0;
  for (let k = 1; k <= 4; k++) {
    const w = weeks.get(addWeeks(monday, -k).getTime());
    if (!w) continue;
    priorWorkouts += w.workouts;
    priorCardio += w.cardioMinutes;
  }
  const now = weeks.get(monday.getTime());

  const trainTarget = Math.max(2, Math.min(5, Math.round(priorWorkouts / 4)));
  const moveTarget =
    priorCardio > 0 ? Math.max(30, Math.min(180, Math.round(priorCardio / 4 / 10) * 10)) : 30;

  const quests: Quest[] = [
    make('train', `Finish ${trainTarget} workouts`, trainTarget, now?.workouts ?? 0),
    make(
      'move',
      priorCardio > 0 ? `Do ${moveTarget} minutes of cardio` : 'Try 30 minutes of cardio',
      moveTarget,
      Math.floor(now?.cardioMinutes ?? 0)
    ),
  ];

  // The third alternates, so a week is not always the same three asks.
  const odd = Math.floor(monday.getTime() / WEEK) % 2 === 1;
  const target = history.proteinTargetG;
  if (odd && target != null && target > 0) {
    let hit = 0;
    for (const day of now?.trainingDays ?? []) if (protein.has(day)) hit++;
    quests.push(make('protein', 'Reach your protein target on 2 training days', 2, hit));
  } else {
    quests.push(make('variety', 'Train 6 different muscles', 6, now?.muscles.size ?? 0));
  }
  return quests;
}

function make(id: QuestId, title: string, target: number, done: number): Quest {
  return { id, title, target, done: Math.min(done, target), complete: done >= target };
}

/** Bonus XP from every quest completed, from the first week you trained to now. */
export function questXp(history: GameHistory, now: Date): { at: Date; xp: number }[] {
  const times = [...history.sessions.map((s) => s.startedAt), ...history.cardio.map((c) => c.startedAt)];
  if (times.length === 0) return [];
  const first = mondayOf(new Date(Math.min(...times.map((t) => t.getTime()))));
  const last = mondayOf(now);
  const weeks = indexWeeks(history);
  const protein = proteinDays(history);
  const pooled = summarise(history, mondayKey);
  const hasProtein = history.proteinTargetG != null && history.proteinTargetG > 0;
  const events: { at: Date; xp: number }[] = [];
  for (let w = first, i = 0; w.getTime() <= last.getTime() && i < 2000; w = addWeeks(first, ++i)) {
    const quests =
      w.getTime() < POOL_START.getTime()
        ? questsFromIndex(history, weeks, protein, w)
        : poolQuests(pooled, w, hasProtein);
    const done = quests.filter((q) => q.complete).length;
    if (done > 0) events.push({ at: w, xp: done * QUEST_XP });
  }
  // One HARD quest a month, from the month the pool started.
  const months = summarise(history, monthKey);
  for (
    let m = new Date(POOL_START.getFullYear(), POOL_START.getMonth(), 1);
    m.getTime() <= now.getTime();
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  ) {
    if (monthlyFrom(months, m).complete) events.push({ at: m, xp: HARD_QUEST_XP });
  }
  return events;
}
