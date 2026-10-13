import * as SecureStore from 'expo-secure-store';
import type { Session, SessionStore } from './client';

/**
 * The family sign-in, kept in the phone's secure storage like the AI key.
 * Never in SQLite, so it is never in an export or a backup file.
 */
const KEY = 'bitfit_family_session';

export const secureSessionStore: SessionStore = {
  async load() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  async save(s) {
    if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(KEY);
  },
};
