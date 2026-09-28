import type { ImageSourcePropType } from 'react-native';
import { REPDB } from 'repdb-generated';

const EXERCISE_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/** Build a remote URL for a free-exercise-db relative image path. */
export function exerciseImageUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  const cleaned = relativePath.replace(/^\//, '');
  return `${EXERCISE_IMAGE_BASE}/${cleaned}`;
}

export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Key prefix for an image bundled from RepDB, as opposed to a free-exercise-db path. */
export const REPDB_IMAGE_PREFIX = 'repdb/';
export const REPDB_ID_PREFIX = 'repdb:';

export function isRepdbExercise(id: string): boolean {
  return id.startsWith(REPDB_ID_PREFIX);
}

/**
 * Something an <Image> can show for a stored image path.
 *
 * RepDB images are bundled into the app, so they work offline; free-exercise-db
 * images are fetched from its repository. A RepDB key with no bundled file —
 * a build made without the RepDB step — is null, never a broken URL.
 */
export function exerciseImageSource(stored: string | null | undefined): ImageSourcePropType | null {
  if (!stored) return null;
  // A photo you took of your own machine, kept on this phone.
  if (stored.startsWith('file:') || stored.startsWith('/')) return { uri: stored };
  if (stored.startsWith(REPDB_IMAGE_PREFIX)) {
    const asset = REPDB.images[stored.slice(REPDB_IMAGE_PREFIX.length)];
    return asset != null ? asset : null;
  }
  const url = exerciseImageUrl(stored);
  return url ? { uri: url } : null;
}

export const REPDB_CREDIT = 'Exercise data by RepDB (repdb.co)';
export const REPDB_URL = 'https://repdb.co';
