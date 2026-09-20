/**
 * BYO API key storage via expo-secure-store.
 * Never log the key value. Web falls back to in-memory only (not persisted).
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

export async function getAiApiKey(): Promise<string | null> {
  try {
    if (await secureAvailable()) {
      const v = await SecureStore.getItemAsync(STORE_KEY);
      return v && v.trim() ? v.trim() : null;
    }
    return memoryKey && memoryKey.trim() ? memoryKey.trim() : null;
  } catch {
    return memoryKey && memoryKey.trim() ? memoryKey.trim() : null;
  }
}

export async function setAiApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  memoryKey = trimmed || null;
  try {
    if (await secureAvailable()) {
      if (trimmed) {
        await SecureStore.setItemAsync(STORE_KEY, trimmed);
      } else {
        await SecureStore.deleteItemAsync(STORE_KEY);
      }
    }
  } catch {
    // Keep memoryKey; surface nothing about the key itself.
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
