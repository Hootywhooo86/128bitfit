/**
 * Moves a camera photo out of the cache and into permanent storage.
 *
 * expo-camera writes to the cache directory. Android clears that whenever it
 * wants space back, so a food row pointing there would show a broken image
 * some weeks later with nothing to explain it. Everything attached to a food
 * is copied to the document directory first.
 *
 * The path maths lives in lib/food-photo.ts and is tested there; this file is
 * only the filesystem calls.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { PHOTO_DIR, photoFileName } from './food-photo';

/**
 * Copies `sourceUri` into the app's photo directory, filed under `foodId`.
 * Returns the permanent URI.
 *
 * One photo per food: re-shooting replaces the old file rather than
 * accumulating orphans nothing will ever clean up.
 */
export async function saveFoodPhoto(foodId: string, sourceUri: string): Promise<string> {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const name = photoFileName(foodId, sourceUri);
  const target = new File(dir, name);
  if (target.exists) target.delete();

  new File(sourceUri).copy(target);
  return target.uri;
}

/** Removes a food's photo. Missing file is not an error — the goal is "gone". */
export async function deleteFoodPhoto(photoUri: string | null): Promise<void> {
  if (!photoUri) return;
  try {
    const file = new File(photoUri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or a URI from a build that stored them elsewhere. Either
    // way there is nothing left to do and nothing worth interrupting the user
    // over.
  }
}
