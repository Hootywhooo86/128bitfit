/**
 * Which `foods.source` values belong to the user, and which the bundled
 * re-import is allowed to wipe.
 *
 * The re-import deletes the whole catalogue and writes it again, keeping only
 * the sources named here. That makes the list an allow-list, so anything not
 * on it is disposable — a new kind of user-made food added later is silently
 * deleted the first time the database is refreshed, with no error anywhere.
 * Keeping the two lists in one file, with a test tying them together, is what
 * stops that from being a thing you have to remember.
 */

/** Foods the user made. Told apart by how they are used, not where they came from. */
export const USER_FOOD_SOURCES = ['custom', 'recipe'] as const;
export type UserFoodSource = (typeof USER_FOOD_SOURCES)[number];

/** Cached barcode lookups — not bundled, and expensive to fetch again. */
export const CACHED_FOOD_SOURCES = ['open_food_facts'] as const;

/** Everything a bundled re-import must leave alone. */
export const PRESERVED_FOOD_SOURCES = [
  ...CACHED_FOOD_SOURCES,
  ...USER_FOOD_SOURCES,
] as const;
