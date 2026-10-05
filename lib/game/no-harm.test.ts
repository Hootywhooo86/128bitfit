import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeGame } from './index';
import { GREY_TONES } from './palette';
import { EMPTY_HISTORY, type GameHistory, type GameSet } from './types';

/**
 * The game layer's promises, as tests. If one of these fails, the change that
 * broke it is the bug — not the test.
 *
 * 1. Nothing rewards eating less, a deficit, weight loss or fasting.
 * 2. No daily streaks; nothing is lost by resting or missing a week.
 * 3. No leaderboards or anything that leaves the phone.
 * 4. Nothing seeded: an empty log is an empty game.
 * 5. Greys and the accent only — never the heat colours.
 */

const DAY = 86_400_000;

/** A small pseudo-random history, the same every run. */
function randomHistory(seed: number): GameHistory {
  let x = seed;
  const rand = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const start = new Date(2026, 0, 5).getTime();
  const lifts = ['Barbell Bench Press - Medium Grip', 'Barbell Full Squat', 'Barbell Deadlift', 'Leg Press'];
  const muscles = [['chest'], ['quadriceps'], ['hamstrings', 'lower back'], ['quadriceps', 'glutes']] as const;
  const sessions = Array.from({ length: 5 + Math.floor(rand() * 30) }, (_, i) => {
    const sets: GameSet[] = Array.from({ length: 1 + Math.floor(rand() * 20) }, () => {
      const k = Math.floor(rand() * lifts.length);
      return {
        exerciseId: `ex${k}`,
        exerciseName: lifts[k],
        weightKg: 20 + Math.round(rand() * 160),
        reps: 1 + Math.floor(rand() * 12),
        setType: rand() < 0.9 ? 'normal' : 'drop',
        primary: [...muscles[k]],
        secondary: [],
      };
    });
    return { id: `s${i}`, startedAt: new Date(start + Math.floor(rand() * 260) * DAY), sets };
  });
  const cardio = Array.from({ length: Math.floor(rand() * 15) }, (_, i) => ({
    id: `c${i}`,
    startedAt: new Date(start + Math.floor(rand() * 260) * DAY),
    minutes: rand() * 90,
    distanceM: rand() * 15000,
  }));
  const foodDays = Array.from({ length: Math.floor(rand() * 100) }, (_, i) => {
    const d = new Date(start + i * 2 * DAY);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { day: key, proteinG: rand() < 0.2 ? null : Math.round(rand() * 220) };
  });
  const weighIns = Array.from({ length: Math.floor(rand() * 10) }, (_, i) => ({
    at: new Date(start + i * 20 * DAY),
    kg: 60 + Math.round(rand() * 50),
  }));
  return { sessions, cardio, foodDays, weighIns, proteinTargetG: rand() < 0.3 ? null : 140 };
}

const NOW = new Date(2026, 9, 7, 12);
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

/** Everything a game shows, flattened, so two can be compared. */
function snapshot(h: GameHistory) {
  const g = computeGame(h, NOW);
  return {
    xp: g.progress.xp,
    stats: g.stats.map((s) => s.value),
    trophies: g.trophies.map((t) => t.earnedAt?.getTime() ?? null),
    quests: g.quests.map((q) => q.done),
  };
}

describe('no reward for losing weight', () => {
  it('a lighter weigh-in never raises a stat, XP, trophy or quest', () => {
    for (const seed of SEEDS) {
      const h = randomHistory(seed);
      const before = snapshot(h);
      const lightest = Math.min(60, ...h.weighIns.map((w) => w.kg));
      for (const at of [new Date(2025, 0, 1), new Date(2026, 5, 1), new Date(2026, 9, 6)]) {
        const after = snapshot({ ...h, weighIns: [...h.weighIns, { at, kg: lightest - 10 }] });
        expect(after.xp, `seed ${seed}`).toBe(before.xp);
        expect(after.trophies, `seed ${seed}`).toEqual(before.trophies);
        expect(after.quests, `seed ${seed}`).toEqual(before.quests);
        after.stats.forEach((v, i) => {
          if (before.stats[i] == null) return;
          expect(v ?? 0, `seed ${seed} stat ${i}`).toBeLessThanOrEqual(before.stats[i]!);
        });
      }
    }
  });
});

describe('no reward for eating less', () => {
  it('logging less protein never earns more', () => {
    for (const seed of SEEDS) {
      const h = randomHistory(seed);
      const before = snapshot(h);
      const less = snapshot({
        ...h,
        foodDays: h.foodDays.map((d) => ({ ...d, proteinG: d.proteinG == null ? null : d.proteinG / 2 })),
      });
      expect(less.xp, `seed ${seed}`).toBeLessThanOrEqual(before.xp);
      less.trophies.forEach((t, i) => {
        // A trophy can be lost or come later — never appear or come sooner.
        if (t != null) expect(before.trophies[i], `seed ${seed}`).not.toBeNull();
        if (t != null && before.trophies[i] != null) expect(t).toBeGreaterThanOrEqual(before.trophies[i]!);
      });
    }
  });

  it('logging food earns the same whatever was eaten', () => {
    const base = { ...EMPTY_HISTORY, foodDays: [{ day: '2026-10-06', proteinG: 20 }] };
    const lots = { ...base, foodDays: [{ day: '2026-10-06', proteinG: 200 }] };
    expect(computeGame(base, NOW).progress.xp).toBe(computeGame(lots, NOW).progress.xp);
  });

  it('the game cannot see calories, deficits, fasting or weight trends', () => {
    // The history type is the whole of what the game reads. Checked against
    // the type's own source, so adding such a field fails here.
    const src = readFileSync(join(__dirname, 'types.ts'), 'utf8');
    const code = stripComments(src.slice(src.indexOf('export type GameHistory'), src.indexOf('export type GameSession')));
    expect(code).not.toMatch(/calor|kcal|deficit|fast|target(?!G)|trend|loss/i);
  });
});

describe('no streaks, no penalties', () => {
  it('time passing without training never takes XP or trophies away', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const h = randomHistory(seed);
      const now = computeGame(h, NOW);
      const later = computeGame(h, new Date(NOW.getTime() + 90 * DAY));
      expect(later.progress.xp).toBeGreaterThanOrEqual(now.progress.xp);
      expect(later.trophies.map((t) => t.earnedAt?.getTime() ?? null)).toEqual(
        now.trophies.map((t) => t.earnedAt?.getTime() ?? null)
      );
    }
  });

  it('more training never earns less', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const h = randomHistory(seed);
      const extra = {
        ...h,
        sessions: [...h.sessions, { ...h.sessions[0], id: 'extra', startedAt: new Date(NOW.getTime() - DAY) }],
      };
      expect(snapshot(extra).xp).toBeGreaterThanOrEqual(snapshot(h).xp);
    }
  });

  it('no game code mentions streaks, leaderboards or the network', () => {
    for (const f of gameSources()) {
      const code = stripComments(readFileSync(join(__dirname, f), 'utf8'));
      expect(code, f).not.toMatch(/streak|leaderboard|rank(?!ed)|fetch\(|supabase|https?:/i);
    }
  });
});

describe('nothing seeded', () => {
  it('an empty log is level 1, no XP, no trophies, hidden stats', () => {
    const g = computeGame(EMPTY_HISTORY, NOW);
    expect(g.progress).toMatchObject({ level: 1, xp: 0 });
    expect(g.trophies.filter((t) => t.earnedAt)).toEqual([]);
    expect(g.stats.every((s) => s.value == null)).toBe(true);
  });
});

describe('colour', () => {
  it('sprites use greys and the accent, never heat colours', () => {
    for (const hex of Object.values(GREY_TONES)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(r === g && g === b, hex).toBe(true);
    }
  });
});

function gameSources(): string[] {
  return readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
