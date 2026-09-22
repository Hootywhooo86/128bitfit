/**
 * BYO API key storage via expo-secure-store.
 * Never log the key value. Web falls back to in-memory only (not persisted).
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { sanitizeApiKey } from './api-key';

const STORE_KEY = 'bitfit_ai_api_key';

/** In-memory fallback for web / SecureStore-unavailable environments. */
let memoryKey: string | null = null;

async function secureAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sanitised on the way out as well as in.
 *
 * A key stored by an earlier build was only trimmed, so one with an interior
 * newline is sitting in the keystore right now, breaking every request. Doing
 * it here repairs those without the user having to notice and re-paste.
 */
export async function getAiApiKey(): Promise<string | null> {
  try {
    if (await secureAvailable()) {
      return sanitizeApiKey(await SecureStore.getItemAsync(STORE_KEY));
    }
    return sanitizeApiKey(memoryKey);
  } catch {
    return sanitizeApiKey(memoryKey);
  }
}

/**
 * Thrown when the key could not be written to the keystore.
 *
 * Never carries the key or any part of it — only that the write failed and
 * roughly why.
 */
export class AiKeyStoreError extends Error {}

/**
 * Saves the key, and proves it saved.
 *
 * This used to swallow a failed write: the key stayed in `memoryKey`, the app
 * looked fine until it was killed, and the key was gone next launch with
 * nothing ever having said so. That is the silent no-op the house style
 * forbids, and it is exactly what a user hitting Save and finding no key later
 * would experience.
 *
 * So the write is read back. SecureStore's setItemAsync can resolve without
 * having persisted anything on some devices — a keystore that is locked, full,
 * or has had its entries invalidated by a credential change — and only a read
 * distinguishes that from success.
 */
export async function setAiApiKey(key: string): Promise<void> {
  // Not trim(): a pasted key routinely carries a whole extra line, and trim
  // cannot see a newline with text behind it. See lib/api-key.ts.
  const trimmed = sanitizeApiKey(key) ?? '';
  memoryKey = trimmed || null;

  if (!(await secureAvailable())) {
    // Web and anywhere without a keystore: in-memory only, and the caller has
    // to be able to tell the user it will not survive a restart.
    throw new AiKeyStoreError(
      'This device has no secure keystore, so the key is held only until the app closes.'
    );
  }

  try {
    if (!trimmed) {
      await SecureStore.deleteItemAsync(STORE_KEY);
      return;
    }
    await SecureStore.setItemAsync(STORE_KEY, trimmed);
  } catch (e) {
    throw new AiKeyStoreError(
      `The device keystore refused the key: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // The part that was missing. A write that reports success and stores nothing
  // is indistinguishable from a working save until the next launch.
  let readBack: string | null = null;
  try {
    readBack = await SecureStore.getItemAsync(STORE_KEY);
  } catch (e) {
    throw new AiKeyStoreError(
      `Saved, but the key could not be read back: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (readBack?.trim() !== trimmed) {
    throw new AiKeyStoreError(
      'The key did not survive being written to the device keystore.'
    );
  }
}

export async function clearAiApiKey(): Promise<void> {
  memoryKey = null;
  try {
    if (await secureAvailable()) {
      await SecureStore.deleteItemAsync(STORE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function hasAiApiKey(): Promise<boolean> {
  const k = await getAiApiKey();
  return !!k;
}
