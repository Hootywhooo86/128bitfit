import { dayKey } from '@/lib/fuel-day';
import { estimateOneRepMax } from '@/lib/personal-records';
import type { MuscleGroup } from '@/lib/muscle-load';
import { mondayOf } from '@/lib/weekly-recap';
import { mainLift } from './stats';
import type { GameHistory, GameSession } from './types';

/**
 * The quest pool: 100 weekly quests, three drawn at random each Monday, and
 * one HARD quest each calendar month.
 *
 * "Random" is seeded by the week (or month), so the draw is the same every
 * time it is computed — the XP a past week earned never shifts — and it only
 * ever looks at weeks before the one it is drawing for, so training more this
 * week can never change this week's quests under you.
 *
 * Every quest measures something you do: sets, minutes, muscles, days you
 * trained, protein reached. None is about eating less, a deficit, weight,
 * fasting or a streak, and missing one costs nothing (see no-harm.test.ts).
 */

/** Everything a week (or month) held, worked out once. */
export type Period = {
  workouts: number;
  strength: number;
  cardio: number;
  sets: number;
  volumeKg: number;
  cardioMin: number;
  cardioKm: number;
  muscles: Set<string>;
  exercises: Set<string>;
  newExercises: number;
  trainingDays: Set<string>;
  proteinTrainingDays: number;
  proteinDays: number;
  foodDays: number;
  region: Record<Region, number>;
  lift: Record<Lift, number>;
  liftsTrained: number;
  records: number;
  heavySets: number;
  highRepSets: number;
  dropSets: number;
  weekend: boolean;
  morning: boolean;
  evening: boolean;
  morningCardio: boolean;
  maxSessionSets: number;
  maxSessionVolume: number;
  longestCardioMin: number;
  longestCardioKm: number;
  bothSameDay: boolean;
  coreSessions: number;
  regionsHit: number;
};

type Region = 'push' | 'pull' | 'legs' | 'core';
type Lift = 'bench' | 'squat' | 'deadlift' | 'press';

const REGIONS: Record<Region, MuscleGroup[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['lats', 'middle back', 'traps', 'biceps', 'forearms'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
  core: ['abdominals', 'lower back'],
};
const REGION_NAME: Record<Region, string> = { push: 'push', pull: 'pull', legs: 'leg', core: 'core' };
const LIFT_NAME: Record<Lift, string> = { bench: 'bench press', squat: 'squat', deadlift: 'deadlift', press: 'overhead press' };

export function emptyPeriod(): Period {
  return {
    workouts: 0, strength: 0, cardio: 0, sets: 0, volumeKg: 0, cardioMin: 0, cardioKm: 0,
    muscles: new Set(), exercises: new Set(), newExercises: 0, trainingDays: new Set(),
    proteinTrainingDays: 0, proteinDays: 0, foodDays: 0,
    region: { push: 0, pull: 0, legs: 0, core: 0 },
    lift: { bench: 0, squat: 0, deadlift: 0, press: 0 }, liftsTrained: 0,
    records: 0, heavySets: 0, highRepSets: 0, dropSets: 0,
    weekend: false, morning: false, evening: false, morningCardio: false,
    maxSessionSets: 0, maxSessionVolume: 0, longestCardioMin: 0, longestCardioKm: 0,
    bothSameDay: false, coreSessions: 0, regionsHit: 0,
  };
}

/**
 * Each strength session's record count: lifts that beat their best from
 * before that session. Never on the first time an exercise is done.
 */
function recordsBySession(sessions: readonly GameSession[]): Map<string, number> {
  const out = new Map<string, number>();
  const heaviest = new Map<string, number>();
  const best = new Map<string, number>();
  for (const s of [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const beaten = new Set<string>();
    for (const set of s.sets) {
      if (set.setType !== 'normal' || !set.weightKg || !set.reps) continue;
      const h = heaviest.get(set.exerciseId);
      const o = best.get(set.exerciseId);
      const orm = estimateOneRepMax(set.weightKg, set.reps);
      if ((h != null && set.weightKg > h) || (o != null && orm != null && orm > o)) beaten.add(set.exerciseId);
    }
    for (const set of s.sets) {
      if (set.setType !== 'normal' || !set.weightKg || !set.reps) continue;
      heaviest.set(set.exerciseId, Math.max(heaviest.get(set.exerciseId) ?? 0, set.weightKg));
      const orm = estimateOneRepMax(set.weightKg, set.reps);
      if (orm != null) best.set(set.exerciseId, Math.max(best.get(set.exerciseId) ?? 0, orm));
    }
    out.set(s.id, beaten.size);
  }
  return out;
}

/** Splits the log into periods (weeks or months) and works each one out once. */
export function summarise(history: GameHistory, keyOf: (d: Date) => number): Map<number, Period> {
  const periods = new Map<number, Period>();
  const get = (d: Date) => {
    const k = keyOf(d);
    let p = periods.get(k);
    if (!p) periods.set(k, (p = emptyPeriod()));
    return p;
  };
  const records = recordsBySession(history.sessions);
  const target = history.proteinTargetG;
  const proteinHit = new Set(
    target != null && target > 0
      ? history.foodDays.filter((d) => d.proteinG != null && d.proteinG >= target).map((d) => d.day)
      : []
  );
  const seenExercise = new Set<string>();
  const strengthDays = new Map<number, Set<string>>();
  const cardioDays = new Map<number, Set<string>>();
  const daysOf = (m: Map<number, Set<string>>, k: number) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    return s;
  };

  for (const s of [...history.sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    if (s.sets.length === 0) continue;
    const p = get(s.startedAt);
    const k = keyOf(s.startedAt);
    const day = dayKey(s.startedAt);
    const hour = s.startedAt.getHours();
    p.workouts++;
    p.strength++;
    p.trainingDays.add(day);
    daysOf(strengthDays, k).add(day);
    p.records += records.get(s.id) ?? 0;
    if ([0, 6].includes(s.startedAt.getDay())) p.weekend = true;
    if (hour < 9) p.morning = true;
    if (hour >= 18) p.evening = true;
    let volume = 0;
    let core = false;
    const newHere = new Set<string>();
    for (const set of s.sets) {
      p.sets++;
      if (set.weightKg && set.reps) volume += set.weightKg * set.reps;
      for (const m of set.primary) p.muscles.add(m);
      p.exercises.add(set.exerciseId);
      if (!seenExercise.has(set.exerciseId)) newHere.add(set.exerciseId);
      if (set.setType !== 'normal') p.dropSets++;
      if (set.reps != null && set.reps > 0 && set.reps <= 5 && set.weightKg) p.heavySets++;
      if (set.reps != null && set.reps >= 12) p.highRepSets++;
      for (const r of Object.keys(REGIONS) as Region[]) {
        if (set.primary.some((m) => REGIONS[r].includes(m))) {
          p.region[r]++;
          if (r === 'core') core = true;
        }
      }
      const lift = set.setType === 'normal' ? mainLift(set.exerciseName) : null;
      if (lift) p.lift[lift]++;
    }
    for (const e of newHere) seenExercise.add(e);
    p.newExercises += newHere.size;
    p.volumeKg += volume;
    p.maxSessionSets = Math.max(p.maxSessionSets, s.sets.length);
    p.maxSessionVolume = Math.max(p.maxSessionVolume, volume);
    if (core) p.coreSessions++;
  }

  for (const c of history.cardio) {
    const p = get(c.startedAt);
    const k = keyOf(c.startedAt);
    const day = dayKey(c.startedAt);
    const minutes = Math.max(0, c.minutes);
    const km = Math.max(0, c.distanceM ?? 0) / 1000;
    p.workouts++;
    p.cardio++;
    p.cardioMin += minutes;
    p.cardioKm += km;
    p.trainingDays.add(day);
    daysOf(cardioDays, k).add(day);
    p.longestCardioMin = Math.max(p.longestCardioMin, minutes);
    p.longestCardioKm = Math.max(p.longestCardioKm, km);
    if (c.startedAt.getHours() < 9) p.morningCardio = true;
  }

  for (const d of history.foodDays) {
    const [y, m, dd] = d.day.split('-').map(Number);
    if (!y || !m || !dd) continue;
    const p = get(new Date(y, m - 1, dd, 12));
    p.foodDays++;
    if (proteinHit.has(d.day)) {
      p.proteinDays++;
      if (p.trainingDays.has(d.day)) p.proteinTrainingDays++;
    }
  }

  for (const [k, p] of periods) {
    p.liftsTrained = (Object.values(p.lift) as number[]).filter((n) => n > 0).length;
    p.regionsHit = (Object.values(p.region) as number[]).filter((n) => n > 0).length;
    const s = strengthDays.get(k);
    const c = cardioDays.get(k);
    p.bothSameDay = !!s && !!c && [...s].some((d) => c.has(d));
  }
  return periods;
}

export type QuestTemplate = {
  id: string;
  family: string;
  title: string;
  target: number;
  measure: (p: Period) => number;
  /** Needs a protein target to make sense. */
  needsProtein?: boolean;
  /** A yes/no quest: always fair game, never sized. */
  oneOff?: boolean;
};

const count = (
  family: string,
  targets: number[],
  title: (n: number) => string,
  measure: (p: Period) => number,
  extra: Partial<QuestTemplate> = {}
): QuestTemplate[] =>
  targets.map((n) => ({ id: `${family}-${n}`, family, title: title(n), target: n, measure, ...extra }));

const once = (id: string, title: string, measure: (p: Period) => boolean): QuestTemplate => ({
  id,
  family: id,
  title,
  target: 1,
  measure: (p) => (measure(p) ? 1 : 0),
  oneOff: true,
});

const fmt = (n: number) => n.toLocaleString('en-US');

/** All 100. Ids are stable; never renumber one that has shipped. */
export const QUEST_POOL: readonly QuestTemplate[] = [
  ...count('workouts', [2, 3, 4, 5], (n) => `Finish ${n} workouts`, (p) => p.workouts),
  ...count('sets', [30, 45, 60, 80, 100], (n) => `Complete ${n} working sets`, (p) => p.sets),
  ...count('volume', [5000, 10000, 15000, 20000, 30000], (n) => `Lift ${fmt(n)} kg in total`, (p) => Math.floor(p.volumeKg)),
  ...count('cardio-min', [30, 60, 90, 120, 150, 200], (n) => `Do ${n} minutes of cardio`, (p) => Math.floor(p.cardioMin)),
  ...count('cardio-km', [5, 10, 15, 20, 30], (n) => `Cover ${n} km of cardio`, (p) => Math.floor(p.cardioKm)),
  ...count('cardio-sessions', [1, 2, 3, 4], (n) => (n === 1 ? 'Fit in a cardio session' : `Fit in ${n} cardio sessions`), (p) => p.cardio),
  ...count('muscles', [4, 6, 8, 10, 12], (n) => `Train ${n} different muscles`, (p) => p.muscles.size),
  ...count('exercises', [5, 8, 12, 15], (n) => `Do ${n} different exercises`, (p) => p.exercises.size),
  ...count('days', [2, 3, 4, 5], (n) => `Train on ${n} different days`, (p) => p.trainingDays.size),
  ...count('protein-training', [1, 2, 3, 4], (n) => `Reach your protein target on ${n} training day${n > 1 ? 's' : ''}`, (p) => p.proteinTrainingDays, { needsProtein: true }),
  ...count('food-days', [3, 4, 5, 7], (n) => `Log food on ${n} days`, (p) => p.foodDays),
  ...(Object.keys(REGIONS) as Region[]).flatMap((r) =>
    count(`region-${r}`, [6, 10, 15], (n) => `Do ${n} ${REGION_NAME[r]} sets`, (p) => p.region[r])
  ),
  ...(Object.keys(LIFT_NAME) as Lift[]).flatMap((l) =>
    count(`lift-${l}`, [3, 5], (n) => `Do ${n} working sets of ${LIFT_NAME[l]}`, (p) => p.lift[l])
  ),
  ...count('records', [1, 2, 3], (n) => (n === 1 ? 'Beat a personal record' : `Beat ${n} personal records`), (p) => p.records),
  ...count('heavy', [5, 10, 15], (n) => `Do ${n} heavy sets (5 reps or fewer)`, (p) => p.heavySets),
  ...count('high-rep', [5, 10, 15], (n) => `Do ${n} sets of 12 reps or more`, (p) => p.highRepSets),
  ...count('core-sessions', [2, 3], (n) => `Train your core in ${n} sessions`, (p) => p.coreSessions),
  ...count('new-exercises', [1], () => 'Try an exercise you have never done', (p) => p.newExercises),
  ...count('lifts-trained', [3], () => 'Train three of the big four lifts', (p) => p.liftsTrained),
  ...count('protein-days', [5], () => 'Reach your protein target on 5 days', (p) => p.proteinDays, { needsProtein: true }),
  once('weekend', 'Train on Saturday or Sunday', (p) => p.weekend),
  once('morning', 'Train before 9 a.m.', (p) => p.morning),
  once('evening', 'Train after 6 p.m.', (p) => p.evening),
  once('morning-cardio', 'Cardio before 9 a.m.', (p) => p.morningCardio),
  once('big-session', 'One workout of 20+ working sets', (p) => p.maxSessionSets >= 20),
  once('long-cardio-45', 'One cardio session of 45+ minutes', (p) => p.longestCardioMin >= 45),
  once('long-cardio-60', 'One cardio session of an hour or more', (p) => p.longestCardioMin >= 60),
  once('cardio-5k', 'Cover 5 km in one cardio session', (p) => p.longestCardioKm >= 5),
  once('cardio-10k', 'Cover 10 km in one cardio session', (p) => p.longestCardioKm >= 10),
  once('same-day', 'Lift and do cardio on the same day', (p) => p.bothSameDay),
  once('hybrid', 'Two strength sessions and two cardio sessions', (p) => p.strength >= 2 && p.cardio >= 2),
  once('drop-set', 'Finish with a drop set or rest-pause set', (p) => p.dropSets > 0),
  once('all-regions', 'Hit push, pull, legs and core this week', (p) => p.regionsHit >= 4),
  once('tonne-session', 'Lift 1,000 kg in one workout', (p) => p.maxSessionVolume >= 1000),
  once('big-tonne-session', 'Lift 2,500 kg in one workout', (p) => p.maxSessionVolume >= 2500),
  once('big-four', 'Train all four big lifts this week', (p) => p.liftsTrained >= 4),
];

/** A small seeded generator: the same seed always draws the same quests. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which tiers of a family fit you: from about what you already do to half as
 * much again. With no history in a family, only its first tier — a taste.
 */
function fitting(templates: QuestTemplate[], baseline: number): QuestTemplate[] {
  if (templates[0].oneOff) return templates;
  if (baseline <= 0) return [templates[0]];
  const fit = templates.filter((t) => t.target >= baseline * 0.9 && t.target <= Math.max(baseline * 1.5, baseline + 1));
  if (fit.length) return fit;
  // Past the top tier: the top tier. Below the first: the first.
  return [baseline > templates[templates.length - 1].target ? templates[templates.length - 1] : templates[0]];
}

export const WEEKLY_QUESTS = 3;

/**
 * This week's three, from the four weeks before it. `prior` is those weeks'
 * summaries (missing weeks count as nothing done).
 */
export function drawWeekly(prior: readonly Period[], weekKey: string, hasProtein: boolean): QuestTemplate[] {
  const rand = seeded(`week:${weekKey}`);
  const families = new Map<string, QuestTemplate[]>();
  for (const t of QUEST_POOL) {
    if (t.needsProtein && !hasProtein) continue;
    families.set(t.family, [...(families.get(t.family) ?? []), t]);
  }
  const options: QuestTemplate[] = [];
  for (const templates of families.values()) {
    const avg = prior.length ? prior.reduce((a, p) => a + templates[0].measure(p), 0) / Math.max(4, prior.length) : 0;
    const fits = fitting(templates, avg);
    options.push(fits[Math.floor(rand() * fits.length)]);
  }
  // Shuffle the families, then take three.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options.slice(0, WEEKLY_QUESTS);
}

/** The monthly HARD quest: well past your usual month, one measure, no penalty. */
export type HardTemplate = { id: string; title: (n: number) => string; floor: number; round: number; measure: (p: Period) => number };

export const HARD_QUESTS: readonly HardTemplate[] = [
  { id: 'hard-workouts', title: (n) => `Finish ${n} workouts this month`, floor: 12, round: 1, measure: (p) => p.workouts },
  { id: 'hard-sets', title: (n) => `Complete ${fmt(n)} working sets this month`, floor: 200, round: 10, measure: (p) => p.sets },
  { id: 'hard-volume', title: (n) => `Lift ${fmt(n)} kg this month`, floor: 50000, round: 1000, measure: (p) => Math.floor(p.volumeKg) },
  { id: 'hard-cardio-min', title: (n) => `Do ${n} minutes of cardio this month`, floor: 400, round: 10, measure: (p) => Math.floor(p.cardioMin) },
  { id: 'hard-cardio-km', title: (n) => `Cover ${n} km of cardio this month`, floor: 60, round: 5, measure: (p) => Math.floor(p.cardioKm) },
  { id: 'hard-days', title: (n) => `Train on ${n} different days this month`, floor: 14, round: 1, measure: (p) => p.trainingDays.size },
  { id: 'hard-records', title: (n) => `Beat ${n} personal records this month`, floor: 5, round: 1, measure: (p) => p.records },
  { id: 'hard-muscles', title: () => 'Train all 17 muscles this month', floor: 17, round: 1, measure: (p) => p.muscles.size },
];

/** 30% past your average of the last three months, never below the floor. */
export function drawMonthly(prior: readonly Period[], monthKey: string): { template: HardTemplate; target: number } {
  const rand = seeded(`month:${monthKey}`);
  const avg = (t: HardTemplate) => (prior.length ? prior.reduce((a, p) => a + t.measure(p), 0) / Math.max(3, prior.length) : 0);
  // Only measures you have done something in, so HARD is hard, not impossible.
  const active = HARD_QUESTS.filter((t) => t.id === 'hard-workouts' || avg(t) > 0);
  const template = active[Math.floor(rand() * active.length)];
  const raw = Math.max(template.floor, avg(template) * 1.3);
  const target = template.id === 'hard-muscles' ? 17 : Math.ceil(raw / template.round) * template.round;
  return { template, target };
}

export const mondayKey = (d: Date) => mondayOf(d).getTime();
export const monthKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getTime();
