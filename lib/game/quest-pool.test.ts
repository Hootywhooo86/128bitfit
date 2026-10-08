import { describe, expect, it } from 'vitest';
import { drawMonthly, drawWeekly, emptyPeriod, HARD_QUESTS, QUEST_POOL, WEEKLY_QUESTS } from './quest-pool';

describe('the quest pool', () => {
  it('has exactly 100 quests with unique ids', () => {
    expect(QUEST_POOL).toHaveLength(100);
    expect(new Set(QUEST_POOL.map((q) => q.id)).size).toBe(100);
  });

  it('never asks for eating less, weight, fasting or a streak', () => {
    for (const q of [...QUEST_POOL.map((t) => t.title), ...HARD_QUESTS.map((t) => t.title(1))]) {
      expect(q).not.toMatch(/calor|kcal|deficit|fast(?!er)|weigh|lose|loss|streak|in a row|skip|under/i);
    }
  });

  it('the same week always draws the same three, from different families', () => {
    const a = drawWeekly([], '2026-10-12', true);
    expect(drawWeekly([], '2026-10-12', true)).toEqual(a);
    expect(a).toHaveLength(WEEKLY_QUESTS);
    expect(new Set(a.map((q) => q.family)).size).toBe(WEEKLY_QUESTS);
  });

  it('different weeks draw different quests', () => {
    const draws = new Set(Array.from({ length: 30 }, (_, i) => drawWeekly([], `week-${i}`, true).map((q) => q.id).join()));
    expect(draws.size).toBeGreaterThan(20);
  });

  it('leaves protein quests out without a protein target', () => {
    for (let i = 0; i < 100; i++) {
      expect(drawWeekly([], `w${i}`, false).some((q) => q.needsProtein)).toBe(false);
    }
  });
});

describe('the monthly HARD quest', () => {
  it('is 30% past your usual month, never under the floor', () => {
    const month = { ...emptyPeriod(), workouts: 20 };
    const { template, target } = drawMonthly([month, month, month], '2026-11-01');
    if (template.id === 'hard-workouts') expect(target).toBe(26);
    const fresh = drawMonthly([], '2026-11-01');
    expect(fresh.template.id).toBe('hard-workouts');
    expect(fresh.target).toBe(12);
  });

  it('only picks measures you have done something in', () => {
    const month = { ...emptyPeriod(), workouts: 10, sets: 150 };
    for (let i = 0; i < 50; i++) {
      expect(['hard-workouts', 'hard-sets']).toContain(drawMonthly([month], `m${i}`).template.id);
    }
  });
});
