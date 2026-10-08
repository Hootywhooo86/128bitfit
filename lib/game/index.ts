import { mondayOf } from '@/lib/weekly-recap';
import { monthlyQuest, questsForWeek, questXp, type Quest } from './quests';
import { allStats, type Stat } from './stats';
import { judgeTrophies, type TrophyResult } from './trophies';
import type { GameHistory } from './types';
import { activityXp, levelProgress, type LevelProgress } from './xp';

export type GameState = {
  progress: LevelProgress;
  stats: Stat[];
  trophies: TrophyResult[];
  quests: Quest[];
  /** This month's HARD quest. */
  monthly: Quest;
};

/**
 * The whole game, from the log alone. Nothing here is stored except the dates
 * trophies were first shown (db/game-queries.ts), so it is always recomputable
 * and always agrees with the data it came from.
 */
export function computeGame(history: GameHistory, now: Date): GameState {
  const nowT = now.getTime();
  const xp = [...activityXp(history), ...questXp(history, now)]
    .filter((e) => e.at.getTime() <= nowT)
    .reduce((a, e) => a + e.xp, 0);
  return {
    progress: levelProgress(xp),
    stats: allStats(history, now),
    trophies: judgeTrophies(history),
    quests: questsForWeek(history, mondayOf(now)),
    monthly: monthlyQuest(history, now),
  };
}

export type { GameHistory } from './types';
