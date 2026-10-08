import { describe, expect, it } from 'vitest';
import { computeGame } from './index';
import { COSMETICS, DEFAULT_LOOK, resolveLook, unlockedBetween } from './cosmetics';
import { questsForWeek, QUEST_XP } from './quests';
import { drawWeekly, mondayKey, QUEST_POOL, summarise } from './quest-pool';
import { HERO_HEIGHT, HERO_WIDTH, heroPixels, PETS, petPixels, TROPHY_SPRITES } from './sprites';
import { balance, consistency, endurance, mainLift, strength } from './stats';
import { judgeTrophies, TROPHIES, type TrophyId } from './trophies';
import { EMPTY_HISTORY, type GameHistory, type GameSession, type GameSet } from './types';
import { cardioXp, levelForXp, levelProgress, sessionXp, xpForLevel } from './xp';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

function set(over: Partial<GameSet> = {}): GameSet {
  return {
    exerciseId: 'ex-bench',
    exerciseName: 'Barbell Bench Press - Medium Grip',
    weightKg: 60,
    reps: 8,
    setType: 'normal',
    primary: ['chest'],
    secondary: ['triceps', 'shoulders'],
    ...over,
  };
}

let n = 0;
function session(at: Date, sets: GameSet[]): GameSession {
  return { id: `s${n++}`, startedAt: at, sets };
}

const history = (over: Partial<GameHistory>): GameHistory => ({ ...EMPTY_HISTORY, ...over });
const earned = (h: GameHistory, id: TrophyId) => judgeTrophies(h).find((t) => t.id === id)!.earnedAt;

describe('levels', () => {
  it('starts at level 1 with no XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelProgress(0)).toEqual({ level: 1, xp: 0, into: 0, span: 100 });
  });

  it('follows the curve', () => {
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(5)).toBe(1000);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(4500)).toBe(10);
    expect(levelForXp(10_000_000)).toBe(99);
    expect(levelProgress(10_000_000).span).toBeNull();
  });

  it('caps XP per session', () => {
    expect(sessionXp(5)).toBe(50);
    expect(sessionXp(30)).toBe(300);
    expect(sessionXp(200)).toBe(300);
    expect(cardioXp(45.9)).toBe(90);
    expect(cardioXp(600)).toBe(240);
    expect(cardioXp(-5)).toBe(0);
    expect(cardioXp(Number.NaN)).toBe(0);
  });
});

describe('a brand-new user', () => {
  const g = computeGame(EMPTY_HISTORY, day(2026, 10, 5));

  it('is level 1 with nothing earned and every stat hidden', () => {
    expect(g.progress.level).toBe(1);
    expect(g.progress.xp).toBe(0);
    expect(g.stats.map((s) => s.value)).toEqual([null, null, null, null]);
    expect(g.trophies.every((t) => t.earnedAt == null)).toBe(true);
  });

  it('says what each stat still needs', () => {
    for (const s of g.stats) expect(s.note.length).toBeGreaterThan(10);
  });

  it('gets three quests, all at zero, each its family\'s easiest tier', () => {
    expect(g.quests).toHaveLength(3);
    expect(g.quests.map((q) => q.done)).toEqual([0, 0, 0]);
    for (const q of g.quests) {
      const family = QUEST_POOL.find((t) => t.id === q.id)!.family;
      const first = QUEST_POOL.find((t) => t.family === family)!;
      expect(q.target).toBe(first.target);
    }
    expect(g.monthly).toMatchObject({ hard: true, done: 0, id: 'hard-workouts', target: 12 });
  });
});

describe('stats', () => {
  it('recognises the main lifts and not their variants', () => {
    expect(mainLift('Barbell Bench Press - Medium Grip')).toBe('bench');
    expect(mainLift('Dumbbell Bench Press')).toBeNull();
    expect(mainLift('Incline Barbell Bench Press')).toBeNull();
    expect(mainLift('Barbell Full Squat')).toBe('squat');
    expect(mainLift('Squat')).toBe('squat');
    expect(mainLift('Goblet Squat')).toBeNull();
    expect(mainLift('Split Squat')).toBeNull();
    expect(mainLift('Barbell Deadlift')).toBe('deadlift');
    expect(mainLift('Romanian Deadlift')).toBeNull();
    expect(mainLift('Standing Military Press')).toBe('press');
    expect(mainLift('Seated Barbell Military Press')).toBeNull();
    expect(mainLift('Leg Press')).toBeNull();
  });

  it('STR needs a main lift and a weigh-in', () => {
    const lifted = history({ sessions: [session(day(2026, 9, 1), [set({ weightKg: 80, reps: 5 })])] });
    expect(strength(lifted).value).toBeNull();
    expect(strength(lifted).note).toMatch(/weigh-in/);
    const weighed = { ...lifted, weighIns: [{ at: day(2026, 9, 1), kg: 80 }] };
    // 80 kg × 5 → e1RM about 93 kg, 1.17× bodyweight against a 1.0× standard.
    expect(strength(weighed).value).toBeGreaterThan(50);
    expect(strength(weighed).value).toBeLessThan(65);
  });

  it('END is weekly cardio minutes, 150 a week scoring 50', () => {
    const now = day(2026, 10, 5);
    const cardio = [0, 7, 14, 21].map((back) => ({
      id: `c${back}`,
      startedAt: new Date(now.getTime() - (back + 1) * 86_400_000),
      minutes: 150,
      distanceM: null,
    }));
    expect(endurance(history({ cardio }), now).value).toBe(50);
  });

  it('BAL rewards an even split and needs two sessions', () => {
    const now = day(2026, 10, 5);
    const legs = (d: number) => set({ primary: ['quadriceps'], secondary: [], exerciseName: 'Leg Press' });
    const one = history({ sessions: [session(day(2026, 10, 1), [legs(0)])] });
    expect(balance(one, now).value).toBeNull();
    const allLegs = history({ sessions: [session(day(2026, 10, 1), [legs(0)]), session(day(2026, 10, 3), [legs(1)])] });
    const even = history({
      sessions: [
        session(day(2026, 10, 1), [set({ primary: ['chest'], secondary: [] }), set({ primary: ['lats'], secondary: [] })]),
        session(day(2026, 10, 3), [set({ primary: ['quadriceps'], secondary: [] }), set({ primary: ['abdominals'], secondary: [] })]),
      ],
    });
    expect(balance(allLegs, now).value).toBe(1);
    expect(balance(even, now).value).toBe(99);
  });

  it('CON is weekly and waits for two weeks of history', () => {
    const now = day(2026, 10, 7); // a Wednesday
    const thisWeek = history({ sessions: [session(day(2026, 10, 6), [set()])] });
    expect(consistency(thisWeek, now).value).toBeNull();
    const twoWeeks = history({
      sessions: [session(day(2026, 9, 29), [set()]), session(day(2026, 10, 6), [set()])],
    });
    expect(consistency(twoWeeks, now).value).toBe(99);
    const gap = history({
      sessions: [session(day(2026, 9, 22), [set()]), session(day(2026, 10, 6), [set()])],
    });
    expect(consistency(gap, now).value).toBe(66);
  });
});

describe('trophies', () => {
  it('lists the nine from the brief, in order', () => {
    expect(TROPHIES.map((t) => t.name)).toEqual([
      'FIRST BLOOD',
      'IRON PLATE',
      'TON UP',
      'DUNGEON CRAWLER',
      'BOSS RUSH',
      'WORLD MAP',
      'MARATHON SAVE POINT',
      'POTION MASTER',
      'NEW GAME+',
    ]);
  });

  it('earns each on the day it happened', () => {
    const first = day(2025, 3, 1);
    const h = history({ sessions: [session(first, [set()])] });
    expect(earned(h, 'first-blood')).toEqual(first);
  });

  it('IRON PLATE at 1,000 kg of volume, with progress until then', () => {
    const h = history({
      sessions: [
        session(day(2026, 1, 1), [set({ weightKg: 60, reps: 8 })]), // 480
        session(day(2026, 1, 3), [set({ weightKg: 60, reps: 8 })]), // 960
        session(day(2026, 1, 5), [set({ weightKg: 50, reps: 1 })]), // 1,010
      ],
    });
    expect(earned(h, 'iron-plate')).toEqual(day(2026, 1, 5));
    const partial = history({ sessions: h.sessions.slice(0, 2) });
    expect(judgeTrophies(partial).find((t) => t.id === 'iron-plate')!.progress).toBe('960 / 1,000 kg');
  });

  it('TON UP for a 100 kg bench — and 225 lb — but not a dumbbell bench', () => {
    expect(earned(history({ sessions: [session(day(2026, 1, 1), [set({ weightKg: 100, reps: 1 })])] }), 'ton-up')).not.toBeNull();
    expect(earned(history({ sessions: [session(day(2026, 1, 1), [set({ weightKg: 225 * 0.45359237, reps: 1 })])] }), 'ton-up')).not.toBeNull();
    expect(
      earned(history({ sessions: [session(day(2026, 1, 1), [set({ weightKg: 100, reps: 1, exerciseName: 'Dumbbell Bench Press' })])] }), 'ton-up')
    ).toBeNull();
    expect(earned(history({ sessions: [session(day(2026, 1, 1), [set({ weightKg: 95, reps: 3 })])] }), 'ton-up')).toBeNull();
  });

  it('DUNGEON CRAWLER on the tenth session', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => session(day(2026, 2, i + 1), [set()]));
    expect(earned(history({ sessions }), 'dungeon-crawler')).toEqual(day(2026, 2, 10));
    expect(earned(history({ sessions: sessions.slice(1) }), 'dungeon-crawler')).toBeNull();
  });

  it('BOSS RUSH for records on three lifts in one session — never on the first', () => {
    const lifts = ['a', 'b', 'c'].map((id) => (w: number) => set({ exerciseId: id, exerciseName: id, weightKg: w, reps: 5 }));
    const firstEver = session(day(2026, 3, 1), lifts.map((l) => l(50)));
    expect(earned(history({ sessions: [firstEver] }), 'boss-rush')).toBeNull();
    const better = session(day(2026, 3, 8), lifts.map((l) => l(55)));
    expect(earned(history({ sessions: [firstEver, better] }), 'boss-rush')).toEqual(day(2026, 3, 8));
    const twoOnly = session(day(2026, 3, 8), [lifts[0](55), lifts[1](55), lifts[2](50)]);
    expect(earned(history({ sessions: [firstEver, twoOnly] }), 'boss-rush')).toBeNull();
  });

  it('WORLD MAP when every muscle is lit in one week', () => {
    const all = set({
      primary: ['chest', 'lats', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals', 'shoulders', 'neck'],
      secondary: ['triceps', 'biceps', 'forearms', 'traps', 'lower back', 'middle back', 'abductors', 'adductors'],
    });
    expect(earned(history({ sessions: [session(day(2026, 10, 6), [all])] }), 'world-map')).not.toBeNull();
    const split = [
      session(day(2026, 10, 4), [set({ ...all, primary: all.primary, secondary: [] })]), // a Sunday
      session(day(2026, 10, 5), [set({ ...all, primary: [], secondary: all.secondary })]), // the Monday after
    ];
    expect(earned(history({ sessions: split }), 'world-map')).toBeNull();
  });

  it('MARATHON SAVE POINT at 42.2 km of cardio in total', () => {
    const run = (d: number, km: number) => ({ id: `r${d}`, startedAt: day(2026, 4, d), minutes: 60, distanceM: km * 1000 });
    expect(earned(history({ cardio: [run(1, 20), run(2, 22)] }), 'marathon')).toBeNull();
    expect(earned(history({ cardio: [run(1, 20), run(2, 22), run(3, 0.2)] }), 'marathon')).toEqual(day(2026, 4, 3));
  });

  it('POTION MASTER for protein on ten training days', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => session(day(2026, 5, i + 1), [set()]));
    const foodDays = Array.from({ length: 10 }, (_, i) => ({ day: `2026-05-${String(i + 1).padStart(2, '0')}`, proteinG: 160 }));
    expect(earned(history({ sessions, foodDays, proteinTargetG: 150 }), 'potion-master')).toEqual(new Date(2026, 4, 10));
    // A rest day with protein does not count: it is about fuelling training.
    const restDay = [...foodDays.slice(0, 9), { day: '2026-05-20', proteinG: 160 }];
    expect(earned(history({ sessions, foodDays: restDay, proteinTargetG: 150 }), 'potion-master')).toBeNull();
    expect(earned(history({ sessions, foodDays }), 'potion-master')).toBeNull();
  });

  it('NEW GAME+ for coming back after two weeks', () => {
    const a = session(day(2026, 6, 1), [set()]);
    expect(earned(history({ sessions: [a, session(day(2026, 6, 10), [set()])] }), 'new-game-plus')).toBeNull();
    expect(earned(history({ sessions: [a, session(day(2026, 6, 16), [set()])] }), 'new-game-plus')).toEqual(day(2026, 6, 16));
  });
});

describe('quests', () => {
  const monday = new Date(2026, 9, 5);

  it('are sized from your last four weeks', () => {
    const p = summarise(history({ sessions: Array.from({ length: 16 }, (_, i) => session(new Date(2026, 8, 7 + i * 1.75, 12), [set()])) }), mondayKey);
    const prior = [...p.values()];
    for (let w = 0; w < 200; w++) {
      const pick = drawWeekly(prior, `w${w}`, false).find((t) => t.family === 'workouts');
      if (pick) expect([4, 5]).toContain(pick.target);
    }
  });

  it('count this week only and never exceed the target', () => {
    const sessions = [day(2026, 10, 5), day(2026, 10, 6), day(2026, 10, 7)].map((d) => session(d, [set()]));
    const q = questsForWeek(history({ sessions }), monday);
    expect(q[0]).toMatchObject({ done: 2, complete: true });
  });

  it('pay a bonus for each completed quest', () => {
    const now = day(2026, 10, 8);
    const sessions = [day(2026, 10, 5), day(2026, 10, 6)].map((d) => session(d, [set()]));
    const without = computeGame(history({ sessions: sessions.slice(0, 1) }), now).progress.xp;
    const withBoth = computeGame(history({ sessions }), now).progress.xp;
    expect(withBoth - without).toBe(10 + QUEST_XP);
  });
});

describe('cosmetics', () => {
  it('every slot has a level-1 default', () => {
    for (const [kind, id] of Object.entries(DEFAULT_LOOK)) {
      expect(COSMETICS.find((c) => c.kind === kind && c.id === id)?.level).toBe(1);
    }
  });

  it('refuses gear the level has not reached', () => {
    expect(resolveLook({ outfit: 'armor', pet: 'slime', title: 'nope' }, 6)).toEqual({
      ...DEFAULT_LOOK,
      pet: 'slime',
    });
    expect(resolveLook('garbage', 99)).toEqual(DEFAULT_LOOK);
  });

  it('reports what a level-up unlocked', () => {
    expect(unlockedBetween(5, 6).map((c) => c.id)).toEqual(['slime']);
    expect(unlockedBetween(6, 6)).toEqual([]);
  });
});

describe('sprites', () => {
  it('trophies are 16 by 16', () => {
    for (const [id, rows] of Object.entries(TROPHY_SPRITES)) {
      expect(rows.length, id).toBe(16);
      for (const r of rows) expect(r.length, `${id}: ${r}`).toBe(16);
    }
  });

  it('pets are 8 by 8', () => {
    for (const [id, rows] of Object.entries(PETS)) {
      expect(rows.length, id).toBe(8);
      for (const r of rows) expect(r.length, `${id}: ${r}`).toBe(8);
      expect(petPixels(id)).not.toBeNull();
    }
  });

  it('the hero draws in every look', () => {
    for (const outfit of ['tee', 'tank', 'gi', 'armor']) {
      for (const headband of ['none', 'sweatband', 'bandana', 'crown']) {
        const px = heroPixels({ ...DEFAULT_LOOK, outfit, headband });
        expect(px.length).toBe(HERO_HEIGHT);
        for (const r of px) expect(r.length).toBe(HERO_WIDTH);
      }
    }
  });
});
