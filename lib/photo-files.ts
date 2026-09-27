/**
 * Keeps a camera photo: copies it out of the cache, which Android clears when
 * it wants space, into a folder under the app's document directory.
 */
import { Directory, File, Paths } from 'expo-file-system';

export function keepPhoto(folder: string, name: string, sourceUri: string): string {
  const dir = new Directory(Paths.document, folder);
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = sourceUri.match(/\.(jpe?g|png|webp|heic)$/i)?.[0] ?? '.jpg';
  const target = new File(dir, `${name}${ext.toLowerCase()}`);
  if (target.exists) target.delete();
  new File(sourceUri).copy(target);
  return target.uri;
}

/** Missing is fine — the goal is "gone". */
export function deletePhoto(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
