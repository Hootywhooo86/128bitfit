/**
 * Pushes what the app records into the platform health store.
 *
 * Deliberately not called from inside the database layer. Logging a meal must
 * succeed whether or not Health Connect is installed, granted, or working, so
 * the local write happens first and this runs afterwards — and when it fails it
 * says so in one sentence rather than silently doing nothing.
 *
 * Health Connect is local IPC, not network, so this does not break the
 * offline-first rule. It still never blocks the UI: callers fire it and show
 * the result when it arrives.
 */
import { health } from './index';
import type { HealthNutritionEntry, HealthWriteResult } from './types';

/** Nothing to send is a success, not a failure. */
const NOTHING: HealthWriteResult = { written: 0, error: null };

export type FoodLogForHealth = {
  loggedAt: number;
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carb: number | null;
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
    at: l.loggedAt,
    name: l.name,
    mealType: l.mealType,
    calories: l.calories,
    protein: l.protein,
    fat: l.fat,
    carb: l.carb,
  }));
  return health.writeNutrition(entries);
}

export async function pushWeight(at: number, kg: number): Promise<HealthWriteResult> {
  if (!(kg > 0)) return NOTHING;
  const grants = await health.getGrants();
  if (!grants.write.includes('weight')) return NOTHING;
  return health.writeWeight([{ at, kg }]);
}

export async function pushWater(at: number, ml: number): Promise<HealthWriteResult> {
  if (!(ml > 0)) return NOTHING;
  const grants = await health.getGrants();
  if (!grants.write.includes('hydration')) return NOTHING;
  return health.writeHydration([{ at, ml }]);
}
