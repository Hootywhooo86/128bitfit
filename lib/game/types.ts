import type { MuscleGroup } from '@/lib/muscle-load';

/**
 * Everything the game layer is allowed to look at.
 *
 * This list is the first no-harm rule. Calories eaten, deficits, fasting and
 * weight change are not in it, so nothing in the game can reward them: it
 * cannot see them. Bodyweight is here only as the yardstick for STR, and
 * stats.ts takes the heaviest recent weigh-in so that losing weight never
 * raises it.
 */
export type GameHistory = {
  /** Completed strength sessions. Discarded and in-progress ones are left out. */
  sessions: GameSession[];
  /** Completed cardio sessions. */
  cardio: GameCardio[];
  /**
   * Days with at least one food log, local `YYYY-MM-DD`, and the protein
   * logged that day when any entry carried protein. How much was eaten is
   * deliberately not here.
   */
  foodDays: { day: string; proteinG: number | null }[];
  /** Every weigh-in, in kg. Only used as STR's yardstick. */
  weighIns: { at: Date; kg: number }[];
  /** The protein target from Settings, or null when there is none. */
  proteinTargetG: number | null;
};

export type GameSession = {
  id: string;
  startedAt: Date;
  /** Completed, non-warm-up sets. Drop and rest-pause sets are working sets too. */
  sets: GameSet[];
};

export type GameSet = {
  exerciseId: string;
  exerciseName: string;
  /** Converted to kg, so a lb user and a kg user are judged alike. */
  weightKg: number | null;
  reps: number | null;
  /** 'normal', 'drop' or 'rp'. Records only count normal sets. */
  setType: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
};

export type GameCardio = {
  id: string;
  startedAt: Date;
  /** Moving time, or elapsed when there is no moving time. */
  minutes: number;
  distanceM: number | null;
};

export const EMPTY_HISTORY: GameHistory = {
  sessions: [],
  cardio: [],
  foodDays: [],
  weighIns: [],
  proteinTargetG: null,
};
