import { describe, expect, it } from 'vitest';
import { mondayOf } from '@/lib/weekly-recap';
import { legacyQuestsForWeek, POOL_START, questXp } from './quests';
import * as v1 from './reference/quests-v1';
import type { GameHistory, GameSet } from './types';

/**
 * Quests were rewritten to index the log by week once instead of rescanning
 * it for every week. The first version is the reference: same quests, same
 * progress, same bonus XP, on randomised histories and every week they span.
 */
const DAY = 86_400_000;

function history(seed: number): GameHistory {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const start = new Date(2025, 10, 3).getTime();
  const muscles = ['chest', 'lats', 'quadriceps', 'hamstrings', 'abdominals', 'shoulders', 'biceps'] as const;
  const at = () => new Date(start + Math.floor(rand() * 330) * DAY + Math.floor(rand() * 20) * 3_600_000);
  const sessions = Array.from({ length: Math.floor(rand() * 120) }, (_, i) => ({
    id: `s${i}`,
    startedAt: at(),
    sets: Array.from({ length: Math.floor(rand() * 6) }, (): GameSet => ({
      exerciseId: 'e',
      exerciseName: 'e',
      weightKg: 50,
      reps: 5,
      setType: 'normal',
      primary: [muscles[Math.floor(rand() * muscles.length)]],
      secondary: [],
    })),
  }));
  const cardio = Array.from({ length: Math.floor(rand() * 60) }, (_, i) => ({
    id: `c${i}`,
    startedAt: at(),
    minutes: rand() * 80,
    distanceM: null,
  }));
  const days = new Map<string, number | null>();
  for (let i = 0; i < 200; i++) {
    const d = at();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.set(key, rand() < 0.2 ? null : Math.round(rand() * 220));
  }
  return {
    sessions,
    cardio,
    foodDays: [...days].map(([day, proteinG]) => ({ day, proteinG })),
    weighIns: [],
    proteinTargetG: rand() < 0.3 ? null : 140,
  };
}

describe('quests match the first implementation', () => {
  for (const seed of Array.from({ length: 25 }, (_, i) => i + 1)) {
    it(`seed ${seed}`, () => {
      const h = history(seed);
      const now = new Date(2026, 9, 7, 12);
      // Weeks before the pool keep the original quests exactly.
      const before = new Date(POOL_START.getTime() - 86_400_000);
      expect(questXp(h, before)).toEqual(v1.questXp(h, before));
      for (let w = mondayOf(new Date(2025, 10, 3)); w <= now; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
        expect(legacyQuestsForWeek(h, w)).toEqual(v1.questsForWeek(h, w));
      }
    });
  }
});
