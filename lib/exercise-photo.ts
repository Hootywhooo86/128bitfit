/**
 * Photos of your own exercises: the machine at your gym, as its picture.
 *
 * A photo comes from the camera or the gallery, is shrunk once (a phone photo
 * is several megabytes and the thumbnails are 56 px), and is kept under the
 * app's document directory — the cache is cleared by Android whenever it
 * wants space, and a picture that vanishes a week later is a broken promise.
 */
import * as DocumentPicker from 'expo-document-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { deletePhoto, keepPhoto } from './photo-files';

const FOLDER = 'exercise-photos';
const MAX_EDGE = 1280;

export type PreparedPhoto = {
  /** A shrunk JPEG in the cache, ready to keep. */
  uri: string;
  /** The same image, for sending to the AI to identify the machine. */
  base64: string | null;
};

/** Shrinks a camera or gallery image. */
export async function preparePhoto(sourceUri: string): Promise<PreparedPhoto> {
  const out = await manipulateAsync(sourceUri, [{ resize: { width: MAX_EDGE } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return { uri: out.uri, base64: out.base64 ?? null };
}

/** Opens the gallery. Null when the user backs out. */
export async function pickPhotoFromGallery(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

/**
 * Keeps a prepared photo as an exercise's picture and returns its file URI.
 * A timestamp in the name means a replaced photo never shows a stale cached
 * copy of the old one.
 */
export function keepExercisePhoto(exerciseId: string, preparedUri: string): string {
  return keepPhoto(FOLDER, `${exerciseId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}`, preparedUri);
}

/** Only ever deletes our own copies, never a picture that ships with the app. */
export function removeExercisePhoto(uri: string | null | undefined): void {
  if (uri && isLocalPhoto(uri) && uri.includes(`/${FOLDER}/`)) deletePhoto(uri);
}

/** A picture on this phone rather than a bundled or remote one. */
export function isLocalPhoto(stored: string | null | undefined): boolean {
  return !!stored && (stored.startsWith('file:') || stored.startsWith('/'));
}
