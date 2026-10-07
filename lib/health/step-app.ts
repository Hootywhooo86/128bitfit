import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import STEP_APPS from './step-apps.json';

/**
 * Opening the app that writes your steps, so it syncs.
 *
 * Nothing can make another app sync from the outside — Health Connect has no
 * "sync now", and Google Health and the rest expose none. What they all do is
 * sync when opened. So this opens it; coming back here re-reads at once.
 */

/** "Google Health" for com.fitbit.FitbitMobile; null for an app not on the list. */
export function stepAppName(pkg: string | null | undefined): string | null {
  return STEP_APPS.find((a) => a.package === pkg)?.name ?? null;
}

/** Only apps on the list: those are the ones the manifest lets this app see. */
export function canOpenStepApp(pkg: string | null | undefined): pkg is string {
  return Platform.OS === 'android' && stepAppName(pkg) != null;
}

/** Opens it, or says in one sentence why not and what to do instead. */
export function openStepApp(pkg: string): { ok: true } | { ok: false; message: string } {
  const name = stepAppName(pkg) ?? 'your step app';
  try {
    IntentLauncher.openApplication(pkg);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: `Couldn't open ${name}. Open it yourself and pull down to sync, then come back — the steps here update within a minute.`,
    };
  }
}
