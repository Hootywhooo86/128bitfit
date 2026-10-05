import { dayKey } from '@/lib/fuel-day';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-load';
import { estimateOneRepMax } from '@/lib/personal-records';
import { mondayOf } from '@/lib/weekly-recap';
import { mainLift } from './stats';
import type { GameHistory } from './types';

/**
 * Trophies: grey until earned, then lit in the accent colour.
 *
 * Each is judged from the log, oldest first, and the date it is earned is the
 * day it actually happened — an imported history earns its trophies on the
 * dates they were won, not on the day of the import.
 *
 * None of them can be earned by eating less, losing weight or fasting: the
 * history they read has no calorie totals and no weight trend in it.
 */
export type TrophyId =
  | 'first-blood'
  | 'iron-plate'
  | 'ton-up'
  | 'dungeon-crawler'
  | 'boss-rush'
  | 'world-map'
  | 'marathon'
  | 'potion-master'
  | 'new-game-plus';

export type TrophyDef = { id: TrophyId; name: string; how: string };

export const TROPHIES: readonly TrophyDef[] = [
  { id: 'first-blood', name: 'FIRST BLOOD', how: 'Finish your first workout.' },
  { id: 'iron-plate', name: 'IRON PLATE', how: 'Lift 1,000 kg in total, across every working set.' },
  { id: 'ton-up', name: 'TON UP', how: 'Bench press 100 kg (220 lb) for a rep.' },
  { id: 'dungeon-crawler', name: 'DUNGEON CRAWLER', how: 'Finish 10 strength sessions.' },
  { id: 'boss-rush', name: 'BOSS RUSH', how: 'Beat your record on 3 different lifts in one session.' },
  { id: 'world-map', name: 'WORLD MAP', how: 'Light up every muscle on the map in one week.' },
  { id: 'marathon', name: 'MARATHON SAVE POINT', how: 'Cover 42.2 km of cardio, all told.' },
  { id: 'potion-master', name: 'POTION MASTER', how: 'Reach your protein target on 10 training days.' },
  { id: 'new-game-plus', name: 'NEW GAME+', how: 'Come back after two weeks or more away. Welcome back.' },
];

export type TrophyResult = {
  id: TrophyId;
  /** When it was earned, or null while it is still grey. */
  earnedAt: Date | null;
  /** How far along, for a grey one: "640 / 1,000 kg". Null when there is no count. */
  progress: string | null;
};

const IRON_PLATE_KG = 1000;
/** 220 lb is 99.8 kg, and nobody loading 220 lb has missed the point. */
const TON_UP_KG = 99.5;
const DUNGEON_SESSIONS = 10;
const BOSS_RUSH_RECORDS = 3;
const MARATHON_M = 42_195;
const POTION_DAYS = 10;
const COMEBACK_DAYS = 14;

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

export function judgeTrophies(history: GameHistory): TrophyResult[] {
  const sessions = [...history.sessions]
    .filter((s) => s.sets.length > 0)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const cardio = [...history.cardio].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const out = new Map<TrophyId, TrophyResult>();
  const put = (id: TrophyId, earnedAt: Date | null, progress: string | null = null) =>
    out.set(id, { id, earnedAt, progress: earnedAt ? null : progress });

  // Every workout of either kind, in order — for FIRST BLOOD and NEW GAME+.
  const activity = [...sessions.map((s) => s.startedAt), ...cardio.map((c) => c.startedAt)].sort(
    (a, b) => a.getTime() - b.getTime()
  );
  put('first-blood', activity[0] ?? null);

  let comeback: Date | null = null;
  for (let i = 1; i < activity.length && !comeback; i++) {
    if (activity[i].getTime() - activity[i - 1].getTime() >= COMEBACK_DAYS * 86_400_000) comeback = activity[i];
  }
  put('new-game-plus', comeback);

  let volume = 0;
  let ironAt: Date | null = null;
  let tonAt: Date | null = null;
  let bossAt: Date | null = null;
  const heaviest = new Map<string, number>();
  const bestOrm = new Map<string, number>();
  for (const s of sessions) {
    const beaten = new Set<string>();
    // Judge against what came before this session, then fold it in, so a
    // session's own sets cannot make each other records.
    for (const set of s.sets) {
      if (set.weightKg != null && set.reps != null && set.weightKg > 0 && set.reps > 0) {
        volume += set.weightKg * set.reps;
      }
      if (set.setType !== 'normal' || set.weightKg == null || set.weightKg <= 0 || !set.reps) continue;
      if (!tonAt && mainLift(set.exerciseName) === 'bench' && set.weightKg >= TON_UP_KG) tonAt = s.startedAt;
      const h = heaviest.get(set.exerciseId);
      const o = bestOrm.get(set.exerciseId);
      const orm = estimateOneRepMax(set.weightKg, set.reps);
      if ((h != null && set.weightKg > h) || (o != null && orm != null && orm > o)) beaten.add(set.exerciseId);
    }
    for (const set of s.sets) {
      if (set.setType !== 'normal' || set.weightKg == null || set.weightKg <= 0 || !set.reps) continue;
      heaviest.set(set.exerciseId, Math.max(heaviest.get(set.exerciseId) ?? 0, set.weightKg));
      const orm = estimateOneRepMax(set.weightKg, set.reps);
      if (orm != null) bestOrm.set(set.exerciseId, Math.max(bestOrm.get(set.exerciseId) ?? 0, orm));
    }
    if (!ironAt && volume >= IRON_PLATE_KG) ironAt = s.startedAt;
    if (!bossAt && beaten.size >= BOSS_RUSH_RECORDS) bossAt = s.startedAt;
  }
  put('iron-plate', ironAt, `${fmt(Math.min(volume, IRON_PLATE_KG))} / ${fmt(IRON_PLATE_KG)} kg`);
  put('ton-up', tonAt);
  put(
    'dungeon-crawler',
    sessions[DUNGEON_SESSIONS - 1]?.startedAt ?? null,
    `${Math.min(sessions.length, DUNGEON_SESSIONS)} / ${DUNGEON_SESSIONS} sessions`
  );
  put('boss-rush', bossAt);

  // WORLD MAP: every muscle in one Monday-to-Sunday week.
  const weeks = new Map<number, Set<MuscleGroup>>();
  let mapAt: Date | null = null;
  let mostHit = 0;
  for (const s of sessions) {
    const key = mondayOf(s.startedAt).getTime();
    const hit = weeks.get(key) ?? new Set<MuscleGroup>();
    for (const set of s.sets) for (const m of [...set.primary, ...set.secondary]) hit.add(m);
    weeks.set(key, hit);
    mostHit = Math.max(mostHit, hit.size);
    if (!mapAt && hit.size >= MUSCLE_GROUPS.length) mapAt = s.startedAt;
  }
  put('world-map', mapAt, `Best week: ${mostHit} / ${MUSCLE_GROUPS.length} muscles`);

  let metres = 0;
  let marathonAt: Date | null = null;
  for (const c of cardio) {
    metres += Math.max(0, c.distanceM ?? 0);
    if (!marathonAt && metres >= MARATHON_M) marathonAt = c.startedAt;
  }
  put('marathon', marathonAt, `${(Math.min(metres, MARATHON_M) / 1000).toFixed(1)} / 42.2 km`);

  // POTION MASTER: protein reached on days you trained. Reaching it means
  // eating enough — there is no way to earn this by eating less.
  const target = history.proteinTargetG;
  if (target == null || target <= 0) {
    put('potion-master', null, 'Set a protein target in Settings first');
  } else {
    const trainingDays = new Set(activity.map((d) => dayKey(d)));
    const hits = history.foodDays
      .filter((d) => trainingDays.has(d.day) && d.proteinG != null && d.proteinG >= target)
      .map((d) => d.day)
      .sort();
    const tenth = hits[POTION_DAYS - 1];
    const [y, m, d] = (tenth ?? '').split('-').map(Number);
    put(
      'potion-master',
      tenth ? new Date(y, m - 1, d) : null,
      `${Math.min(hits.length, POTION_DAYS)} / ${POTION_DAYS} days`
    );
  }

  return TROPHIES.map((t) => out.get(t.id)!);
}
