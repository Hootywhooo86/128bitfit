/**
 * What an import is allowed to change about something already on the phone.
 *
 * "When may an import overwrite what is already there" is the question this
 * whole feature most needs to get right: getting it wrong means a backup's
 * hand-tagged muscles quietly replacing the curated library, which the user
 * would only ever notice as the muscle map going wrong weeks later.
 *
 * The answer is: never. An import fills blanks and nothing else.
 *
 * Pure, and kept out of the database layer, because it is a policy decision
 * rather than a storage one — and because it is worth testing without a phone.
 */
import type { ImportedExercise } from './parse';

/**
 * True when a stored JSON array column holds nothing.
 *
 * Unparseable counts as empty. A column we cannot read is not a curated value
 * worth protecting, and the alternative is refusing to ever fill it in.
 */
export const isEmptyJsonArray = (json: string | null | undefined): boolean => {
  if (!json) return true;
  try {
    const v = JSON.parse(json);
    return !Array.isArray(v) || v.length === 0;
  } catch {
    return true;
  }
};

/**
 * Which columns of an existing exercise the backup is allowed to fill in.
 *
 * Only ever the empty ones. The bundled library is curated and a user's
 * hand-tagged entry in another app is not a reason to rewrite it — but a blank
 * field has nothing to lose, and filling it is strictly more than was there.
 *
 * Pure, and separated out, because "when may an import overwrite what is
 * already on the phone" is the question this file most needs to get right.
 */
export function fieldsToFill(
  existing: { primaryMuscles: string; secondaryMuscles: string; instructions: string },
  incoming: Pick<ImportedExercise, 'primaryMuscles' | 'secondaryMuscles' | 'instructions'>
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (incoming.primaryMuscles.length > 0 && isEmptyJsonArray(existing.primaryMuscles)) {
    patch.primaryMuscles = JSON.stringify(incoming.primaryMuscles);
  }
  if (incoming.secondaryMuscles.length > 0 && isEmptyJsonArray(existing.secondaryMuscles)) {
    patch.secondaryMuscles = JSON.stringify(incoming.secondaryMuscles);
  }
  if (incoming.instructions.length > 0 && isEmptyJsonArray(existing.instructions)) {
    patch.instructions = JSON.stringify(incoming.instructions);
  }
  return patch;
}
