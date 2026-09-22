/**
 * Pushes what the app records into the platform health store, and removes what
 * the user deletes.
 *
 * Every write carries the local row id as its client id, which makes these
 * operations idempotent: re-pushing an edited meal updates the existing record
 * instead of adding a second one, and a delete can name exactly the record we
 * wrote. Without that, an edit would leave both versions in Health Connect and
 * a delete would leave all of them.
 *
 * Health Connect is local IPC, not network, so this does not break the
 * offline-first rule. It still never blocks the UI: the local write commits
 * first and lib/health/mirror.ts runs this afterwards.
 */
import { health } from './index';
import type { HealthNutritionEntry, HealthWriteResult } from './types';

/** Nothing to send is a success, not a failure. */
const NOTHING: HealthWriteResult = { written: 0, error: null };

export type FoodLogForHealth = {
  /** The local food_logs row id, used as the Health Connect client id. */
  id?: string;
  loggedAt: number;
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carb: number | null;
  fiber?: number | null;
  sugars?: number | null;
  saturatedFat?: number | null;
  /** Milligrams, as labels state it. */
  sodium?: number | null;
};

/**
 * Sends meals to Health Connect.
 *
 * Skips the write entirely when nutrition write was never granted, so a user
 * who declined it is not shown an error every time they log lunch.
 */
export async function pushMeals(logs: FoodLogForHealth[]): Promise<HealthWriteResult> {
  if (logs.length === 0) return NOTHING;

  const grants = await health.getGrants();
  if (!grants.write.includes('nutrition')) return NOTHING;

  const entries: HealthNutritionEntry[] = logs.map((l) => ({
    clientId: l.id,
    at: l.loggedAt,
    name: l.name,
    mealType: l.mealType,
    calories: l.calories,
    protein: l.protein,
    fat: l.fat,
    carb: l.carb,
    fiber: l.fiber ?? null,
    sugars: l.sugars ?? null,
    saturatedFat: l.saturatedFat ?? null,
    sodium: l.sodium ?? null,
  }));
  return health.writeNutrition(entries);
}

export async function pushWeight(at: number, kg: number, id?: string): Promise<HealthWriteResult> {
  if (!(kg > 0)) return NOTHING;
  const grants = await health.getGrants();
  if (!grants.write.includes('weight')) return NOTHING;
  return health.writeWeight([{ clientId: id, at, kg }]);
}

export async function pushWater(at: number, ml: number, id?: string): Promise<HealthWriteResult> {
  if (!(ml > 0)) return NOTHING;
  const grants = await health.getGrants();
  if (!grants.write.includes('hydration')) return NOTHING;
  return health.writeHydration([{ clientId: id, at, ml }]);
}

/**
 * Sends a finished session across as an exercise session.
 *
 * Duration and title only. What it burned is an estimate and stays one — see
 * the note on HealthWorkoutEntry.
 */
export async function pushWorkout(input: {
  id: string;
  startedAt: number;
  endedAt: number;
  title?: string;
}): Promise<HealthWriteResult> {
  if (!(input.endedAt > input.startedAt)) return NOTHING;
  const grants = await health.getGrants();
  if (!grants.write.includes('exercise')) return NOTHING;
  const written = await health.writeEntries([
    {
      clientId: input.id,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      title: input.title,
    },
  ]);
  return { written, error: null };
}

/**
 * Removes records we wrote for local rows the user has since deleted.
 *
 * Gated on the same write grant as the push, for two reasons: Health Connect
 * requires write access to delete, and without the grant we never wrote
 * anything, so there is nothing to remove. Reporting a permission error to
 * someone who declined nutrition write and then deleted a meal would be noise
 * about a copy that was never made.
 */
async function remove(
  scope: 'nutrition' | 'weight' | 'hydration' | 'exercise',
  ids: string[]
): Promise<HealthWriteResult> {
  if (ids.length === 0) return NOTHING;
  const grants = await health.getGrants();
  if (!grants.write.includes(scope)) return NOTHING;
  return health.deleteEntries(scope, ids);
}

export const removeMeals = (ids: string[]) => remove('nutrition', ids);
export const removeWeights = (ids: string[]) => remove('weight', ids);
export const removeWaters = (ids: string[]) => remove('hydration', ids);
export const removeWorkouts = (ids: string[]) => remove('exercise', ids);
