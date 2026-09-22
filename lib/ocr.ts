/**
 * On-device text recognition, for reading a nutrition label.
 *
 * ML Kit runs locally: the photo never leaves the phone and it works with no
 * signal, which is the point — a gym or a supermarket aisle is exactly where
 * there is none.
 *
 * Loaded lazily and defensively for the same reason as lib/health: the native
 * module is resolved at import time and throws wherever it is not registered
 * (web, Expo Go, any build predating this dependency). A static import would
 * take the app down at launch.
 */

export type OcrResult =
  | { status: 'ok'; text: string }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

type Recognizer = {
  recognize(uri: string): Promise<{ text: string }>;
};

let resolved: Recognizer | null | undefined;

function recognizer(): Recognizer | null {
  if (resolved !== undefined) return resolved;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/text-recognition');
    resolved = (mod.default ?? mod) as Recognizer;
  } catch {
    resolved = null;
  }
  return resolved;
}

/** True when this build can read text at all, so the UI can say so up front. */
export function ocrAvailable(): boolean {
  return recognizer() != null;
}

export async function readTextFromImage(uri: string): Promise<OcrResult> {
  const engine = recognizer();
  if (!engine) {
    return {
      status: 'unavailable',
      message: 'Text recognition is not available in this build. Enter the values by hand.',
    };
  }
  try {
    const out = await engine.recognize(uri);
    const text = (out?.text ?? '').trim();
    if (!text) {
      return { status: 'failed', message: 'No text found in that photo. Try again, closer and in better light.' };
    }
    return { status: 'ok', text };
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : 'Could not read that photo.' };
  }
}
