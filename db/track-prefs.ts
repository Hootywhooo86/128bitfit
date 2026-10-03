import { getSetting, setSetting } from './settings-queries';
import { parseTrackPrefs, type TrackMode } from '@/lib/track-mode';

/**
 * Which exercises you log by distance (or by reps against their default),
 * remembered so an exercise opens the way you left it. Kept in settings, so
 * it travels with export, backup and restore.
 */
const KEY = 'exercise_track_modes';

export async function getTrackPrefs(): Promise<Record<string, TrackMode>> {
  return parseTrackPrefs(await getSetting(KEY));
}

export async function rememberTrack(exerciseId: string, mode: TrackMode): Promise<void> {
  const prefs = await getTrackPrefs();
  prefs[exerciseId] = mode;
  await setSetting(KEY, JSON.stringify(prefs));
}
