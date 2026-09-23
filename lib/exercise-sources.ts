/**
 * Which `exercises.category` values belong to the user.
 *
 * The bundled re-import deletes the exercise table and writes it again. It has
 * to, because that is how a corrected or expanded catalogue lands. But the
 * same table holds exercises the user made and exercises an import of their
 * old app created, and those exist nowhere else — there is no copy to restore
 * them from, and a routine that references one is left pointing at nothing.
 *
 * The bundled data uses the free-exercise-db categories (strength, cardio,
 * stretching, plyometrics, powerlifting, strongman, olympic weightlifting) and
 * none of the two below, which a test pins against the shipped asset so the
 * lists cannot quietly start overlapping.
 */

/** Made on the phone: the custom exercise form, camera or not. */
export const CUSTOM_EXERCISE_CATEGORY = 'custom';

/** Created by an import of a backup, including unnamed placeholders. */
export const IMPORTED_EXERCISE_CATEGORY = 'imported';

export const USER_EXERCISE_CATEGORIES = [
  CUSTOM_EXERCISE_CATEGORY,
  IMPORTED_EXERCISE_CATEGORY,
] as const;
export type UserExerciseCategory = (typeof USER_EXERCISE_CATEGORIES)[number];

/** Everything a bundled re-import must leave alone. */
export const PRESERVED_EXERCISE_CATEGORIES = [...USER_EXERCISE_CATEGORIES] as const;

/** True for a row the user owns, so the catalogue must not replace it. */
export function isUserExercise(category: string | null | undefined): boolean {
  return (USER_EXERCISE_CATEGORIES as readonly string[]).includes(category ?? '');
}
