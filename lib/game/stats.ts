import { mondayOf } from '@/lib/weekly-recap';
import { estimateOneRepMax } from '@/lib/personal-records';
import type { MuscleGroup } from '@/lib/muscle-load';
import type { GameHistory } from './types';

/**
 * The four RPG stats. Each is 1–99, or null — shown as "???" — until there is
 * enough logged to say anything. A new user sees four "???", never four zeros:
 * a zero would claim something was measured.
 */
export type StatId = 'STR' | 'END' | 'BAL' | 'CON';

export type Stat = {
  id: StatId;
  name: string;
  value: number | null;
  /** What it is, or what is still needed before it shows. */
  note: string;
};

const DAY = 86_400_000;
const clamp = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

type MainLift = 'bench' | 'squat' | 'deadlift' | 'press';

/**
 * Best e1RM as a multiple of bodyweight that scores 50. Roughly where a few
 * years of steady training gets most people — so 50 is solid, not a ceiling.
 */
const STANDARD: Record<MainLift, number> = { bench: 1.0, squat: 1.25, deadlift: 1.5, press: 0.65 };

/** Names already recognised: a history repeats the same few thousands of times. */
const liftByName = new Map<string, MainLift | null>();

/** The four barbell lifts STR is judged on, recognised by name. */
export function mainLift(name: string): MainLift | null {
  let lift = liftByName.get(name);
  if (lift === undefined) {
    lift = matchLift(name);
    liftByName.set(name, lift);
  }
  return lift;
}

function matchLift(name: string): MainLift | null {
  const n = name.toLowerCase();
  const variant = /dumbbell|kettlebell|machine|smith|cable|band|single|one[- ]arm|one[- ]leg/.test(n);
  if (variant) return null;
  if (/bench press/.test(n) && !/incline|decline|close|floor|board|pin|reverse/.test(n)) return 'bench';
  if (/deadlift/.test(n) && !/romanian|stiff|rack|deficit/.test(n)) return 'deadlift';
  if (/(^|\b)(back |front |full |barbell )?squats?\b/.test(n) && !/split|jump|goblet|hack|box|overhead|sissy|pistol|bodyweight|plie|wall/.test(n)) return 'squat';
  if (/(overhead|military|standing|shoulder) press/.test(n) && !/seated|behind|push/.test(n)) return 'press';
  return null;
}

/**
 * STR: your best lifts against your bodyweight.
 *
 * The yardstick is the heaviest weigh-in ever logged, so dropping weight can
 * never raise STR. A stat that went up when someone ate less would reward the
 * one thing this app refuses to.
 */
export function strength(history: GameHistory): Stat {
  const base = { id: 'STR' as const, name: 'Strength' };
  const heaviest = history.weighIns.reduce((m, w) => (w.kg > m ? w.kg : m), 0);
  const best = new Map<MainLift, number>();
  for (const s of history.sessions) {
    for (const set of s.sets) {
      if (set.setType !== 'normal') continue;
      const lift = mainLift(set.exerciseName);
      if (!lift) continue;
      const orm = estimateOneRepMax(set.weightKg, set.reps);
      if (orm != null && orm > (best.get(lift) ?? 0)) best.set(lift, orm);
    }
  }
  if (best.size === 0) {
    return { ...base, value: null, note: 'Log a squat, bench, deadlift or overhead press to reveal it.' };
  }
  if (heaviest <= 0) return { ...base, value: null, note: 'Log a weigh-in to reveal it.' };
  const scores = [...best].map(([lift, orm]) => (orm / heaviest / STANDARD[lift]) * 50);
  const value = clamp(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    ...base,
    value,
    note: `Your best ${[...best.keys()].join(', ')} against your heaviest logged bodyweight.`,
  };
}

/** END: cardio minutes a week over the last four weeks. 150 a week scores 50. */
export function endurance(history: GameHistory, now: Date): Stat {
  const base = { id: 'END' as const, name: 'Endurance' };
  if (history.cardio.length === 0) {
    return { ...base, value: null, note: 'Record or log a cardio session to reveal it.' };
  }
  const from = now.getTime() - 28 * DAY;
  const minutes = history.cardio
    .filter((c) => c.startedAt.getTime() >= from && c.startedAt.getTime() <= now.getTime())
    .reduce((a, c) => a + Math.max(0, c.minutes), 0);
  const weekly = minutes / 4;
  return { ...base, value: clamp((weekly / 150) * 50), note: `${Math.round(weekly)} cardio minutes a week, last 4 weeks.` };
}

const REGIONS: Record<string, MuscleGroup[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['lats', 'middle back', 'traps', 'biceps', 'forearms'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
  core: ['abdominals', 'lower back'],
};

/** BAL: how evenly push, pull, legs and core shared the last four weeks' sets. */
export function balance(history: GameHistory, now: Date): Stat {
  const base = { id: 'BAL' as const, name: 'Balance' };
  const from = now.getTime() - 28 * DAY;
  const recent = history.sessions.filter(
    (s) => s.startedAt.getTime() >= from && s.startedAt.getTime() <= now.getTime()
  );
  if (recent.length < 2) {
    return { ...base, value: null, note: 'Two sessions in four weeks reveal it.' };
  }
  const totals = Object.fromEntries(Object.keys(REGIONS).map((r) => [r, 0])) as Record<string, number>;
  for (const s of recent) {
    for (const set of s.sets) {
      for (const [region, groups] of Object.entries(REGIONS)) {
        if (set.primary.some((m) => groups.includes(m))) totals[region] += 1;
        else if (set.secondary.some((m) => groups.includes(m))) totals[region] += 0.5;
      }
    }
  }
  const values = Object.values(totals);
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...base, value: null, note: 'Tag your exercises with muscles to reveal it.' };
  // Evenness: entropy of the split over its maximum. All legs scores low; an
  // even four-way split scores 99.
  const entropy = values.reduce((h, v) => (v > 0 ? h - (v / sum) * Math.log(v / sum) : h), 0);
  return {
    ...base,
    value: clamp((entropy / Math.log(values.length)) * 99),
    note: 'How evenly push, pull, legs and core shared your sets, last 4 weeks.',
  };
}

/**
 * CON: weeks with any training, out of the last eight.
 *
 * Weekly on purpose. A daily streak punishes a rest day, and rest days are
 * part of training. Counted only over the weeks since you started, so a new
 * user is not marked down for weeks before they had the app.
 */
export function consistency(history: GameHistory, now: Date): Stat {
  const base = { id: 'CON' as const, name: 'Consistency' };
  const times = [
    ...history.sessions.map((s) => s.startedAt.getTime()),
    ...history.cardio.map((c) => c.startedAt.getTime()),
  ].filter((t) => t <= now.getTime());
  if (times.length === 0) return { ...base, value: null, note: 'Train in two different weeks to reveal it.' };
  const thisWeek = mondayOf(now).getTime();
  const weekOf = (t: number) => mondayOf(new Date(t)).getTime();
  const first = Math.min(...times);
  const weeksSince = Math.round((thisWeek - weekOf(first)) / (7 * DAY)) + 1;
  if (weeksSince < 2) return { ...base, value: null, note: 'Train in two different weeks to reveal it.' };
  const span = Math.min(8, weeksSince);
  const oldest = thisWeek - (span - 1) * 7 * DAY;
  const active = new Set(times.filter((t) => weekOf(t) >= oldest).map(weekOf));
  return {
    ...base,
    value: clamp((active.size / span) * 99),
    note: `Trained in ${active.size} of the last ${span} weeks.`,
  };
}

export function allStats(history: GameHistory, now: Date): Stat[] {
  return [strength(history), endurance(history, now), balance(history, now), consistency(history, now)];
}
