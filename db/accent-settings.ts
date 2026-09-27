import { DEFAULT_ACCENT, applyAccent, isAccent } from '@/lib/accent';
import { getSetting, setSetting } from './settings-queries';

const KEY = 'accent';

/** Reads the saved accent and applies it. Run once, before the first screen draws. */
export async function loadAccent(): Promise<void> {
  const raw = await getSetting(KEY);
  applyAccent(isAccent(raw) ? raw : DEFAULT_ACCENT);
}

export async function saveAccent(hex: string): Promise<void> {
  if (!isAccent(hex)) throw new Error('That colour is not one of the theme colours.');
  await setSetting(KEY, hex.toLowerCase());
  applyAccent(hex);
}
