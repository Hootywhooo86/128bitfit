import { DEFAULT_ACCENT, accentProblem, applyAccent, isAccent, isPreset, parseHex } from '@/lib/accent';
import { getSetting, setSetting } from './settings-queries';
import { widgetsChanged } from '@/lib/widget-refresh';

const KEY = 'accent';
/** The last custom colour, so the CUSTOM tile can show it after a preset is picked. */
const CUSTOM_KEY = 'accent_custom';

/**
 * Reads the saved accent and applies it. Run once, before the first screen
 * draws. A value that is no longer allowed — hand-edited, or restored from an
 * old backup — falls back to the default rather than painting the app red.
 */
export async function loadAccent(): Promise<void> {
  const raw = await getSetting(KEY);
  applyAccent(isAccent(raw) ? raw : DEFAULT_ACCENT);
}

export async function saveAccent(hex: string): Promise<void> {
  // Home-screen widgets show this; they redraw shortly after (lib/widget-refresh).
  widgetsChanged();
  const parsed = parseHex(hex);
  if (!parsed) throw new Error('That is not a colour code. Use six digits like #7af0c3.');
  if (!isPreset(parsed)) {
    const problem = accentProblem(parsed);
    if (problem) throw new Error(problem);
    await setSetting(CUSTOM_KEY, parsed);
  }
  await setSetting(KEY, parsed);
  applyAccent(parsed);
}

/** The last custom colour picked, if any and still allowed. */
export async function getCustomAccent(): Promise<string | null> {
  const raw = await getSetting(CUSTOM_KEY);
  const parsed = parseHex(raw);
  return parsed && !isPreset(parsed) && accentProblem(parsed) == null ? parsed : null;
}
