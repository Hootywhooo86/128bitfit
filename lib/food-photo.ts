/**
 * Where a custom food's photo lives.
 *
 * The camera writes to the cache directory, which Android is free to empty
 * whenever it wants storage back. A photo attached to a food has to outlive
 * that, so it is copied into the document directory under a name derived from
 * the food id.
 *
 * The path maths is here, separate from the filesystem calls, because a photo
 * silently pointing at a cache file that Android has since deleted is exactly
 * the kind of bug that only shows up weeks later on someone else's phone.
 */

export const PHOTO_DIR = 'food-photos';

/** Extensions the camera produces. Anything else is stored as .jpg. */
const KNOWN = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

export function extensionOf(uri: string): string {
  const path = uri.split('?')[0].split('#')[0];
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '.jpg';
  const ext = path.slice(dot).toLowerCase();
  return KNOWN.includes(ext) ? ext : '.jpg';
}

/** Stable filename for a food's photo — one photo per food, replaced in place. */
export function photoFileName(foodId: string, sourceUri: string): string {
  // A food id comes from newId() and is already safe, but it reaches here from
  // a row that could have been imported, so it is sanitised rather than trusted.
  const safe = foodId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safe}${extensionOf(sourceUri)}`;
}

export function photoPath(documentDirectory: string, foodId: string, sourceUri: string): string {
  const base = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  return `${base}${PHOTO_DIR}/${photoFileName(foodId, sourceUri)}`;
}

/** True for a URI the camera left in a directory the OS may clear. */
export function isTransient(uri: string, cacheDirectory: string | null): boolean {
  if (!cacheDirectory) return false;
  return uri.startsWith(cacheDirectory);
}
