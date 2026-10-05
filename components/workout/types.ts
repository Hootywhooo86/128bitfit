import type { WorkoutSet } from '@/db/schema';

export type SetPatch = Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit' | 'completed' | 'distanceM'>>;
export type SetValues = { reps: number | null; weight: number | null; distanceM: number | null };
