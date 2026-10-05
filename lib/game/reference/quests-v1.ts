/** The first quests implementation, kept only as the reference the faster one is tested against. */
import { dayKey } from '@/lib/fuel-day';
import { mondayOf } from '@/lib/weekly-recap';
import type { GameHistory } from '../types';

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
  id: QuestId;
  title: string;
  target: number;
  done: number;
  complete: boolean;
};

export const QUEST_XP = 50;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Local midnight `weeks` Mondays after `monday` (negative goes back). DST-safe. */
function addWeeks(monday: Date, weeks: number): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weeks * 7);
}

function inRange(t: Date, from: Date, to: Date): boolean {
  return t.getTime() >= from.getTime() && t.getTime() < to.getTime();
}

/** The quests for the week starting `monday`, and how far along they are. */
export function questsForWeek(history: GameHistory, monday: Date): Quest[] {
  const next = addWeeks(monday, 1);
  const before = addWeeks(monday, -4);

  const workouts = [...history.sessions.filter((s) => s.sets.length > 0), ...history.cardio];
  const priorWorkouts = workouts.filter((w) => inRange(w.startedAt, before, monday)).length;
  const priorCardio = history.cardio
    .filter((c) => inRange(c.startedAt, before, monday))
    .reduce((a, c) => a + Math.max(0, c.minutes), 0);

  const trainTarget = Math.max(2, Math.min(5, Math.round(priorWorkouts / 4)));
  const moveTarget =
    priorCardio > 0 ? Math.max(30, Math.min(180, Math.round(priorCardio / 4 / 10) * 10)) : 30;

  const thisWeek = workouts.filter((w) => inRange(w.startedAt, monday, next));
  const cardioMinutes = history.cardio
    .filter((c) => inRange(c.startedAt, monday, next))
    .reduce((a, c) => a + Math.max(0, c.minutes), 0);

  const quests: Quest[] = [
    make('train', `Finish ${trainTarget} workouts`, trainTarget, thisWeek.length),
    make(
      'move',
      priorCardio > 0 ? `Do ${moveTarget} minutes of cardio` : 'Try 30 minutes of cardio',
      moveTarget,
      Math.floor(cardioMinutes)
    ),
  ];

  // The third alternates, so a week is not always the same three asks.
  const odd = Math.floor(monday.getTime() / WEEK) % 2 === 1;
  const target = history.proteinTargetG;
  if (odd && target != null && target > 0) {
    const trainingDays = new Set(thisWeek.map((w) => dayKey(w.startedAt)));
    const hit = history.foodDays.filter(
      (d) => trainingDays.has(d.day) && d.proteinG != null && d.proteinG >= target
    ).length;
    quests.push(make('protein', 'Reach your protein target on 2 training days', 2, hit));
  } else {
    const muscles = new Set<string>();
    for (const s of history.sessions) {
      if (!inRange(s.startedAt, monday, next)) continue;
      for (const set of s.sets) for (const m of set.primary) muscles.add(m);
    }
    quests.push(make('variety', 'Train 6 different muscles', 6, muscles.size));
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
  const events: { at: Date; xp: number }[] = [];
  for (let w = first, i = 0; w.getTime() <= last.getTime() && i < 2000; w = addWeeks(first, ++i)) {
    const done = questsForWeek(history, w).filter((q) => q.complete).length;
    if (done > 0) events.push({ at: w, xp: done * QUEST_XP });
  }
  return events;
}
