import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { getSetting, setSetting } from '@/db/settings-store';
import { listCardioSessions } from '@/db/cardio-queries';
import { listSessions } from '@/db/workout-queries';
import { sportById } from '@/lib/cardio';
import { health } from '@/lib/health';
import { previousDay, today } from '@/lib/health/dates';
import { base64url, createFamilyClient, FamilyError, oauthUrl, type Fetch } from './client';
import { cardioEvent, healthDayEvent, strengthEvent, type FamilyEvent } from './events';
import { secureSessionStore } from './session';

/**
 * FIT's side of the 128bit family account: the shared sign-in and, if you
 * switch it on, posting your workouts and daily health summary to the family
 * feed that 128bittracker's timeline shows.
 *
 * Nothing leaves the phone until you sign in AND turn sharing on. Logging
 * never waits for this: it runs in the background, after the fact.
 */
export const family = createFamilyClient(fetch as unknown as Fetch, secureSessionStore);

const SHARE_WORKOUTS = 'family_share_workouts';
const SHARE_HEALTH = 'family_share_health';
const LAST_SYNC = 'family_last_sync';
const LAST_ERROR = 'family_last_error';

/** How far back each sync re-sends: events replace themselves by id. */
const WINDOW_DAYS = 14;
/** Automatic syncs are at most this often. "Sync now" ignores it. */
const MIN_GAP_MS = 15 * 60_000;
const BATCH = 500;

export type FamilyPrefs = { shareWorkouts: boolean; shareHealth: boolean; lastSync: string | null; lastError: string | null };

export async function familyPrefs(): Promise<FamilyPrefs> {
  const [w, h, s, e] = await Promise.all([
    getSetting(SHARE_WORKOUTS),
    getSetting(SHARE_HEALTH),
    getSetting(LAST_SYNC),
    getSetting(LAST_ERROR),
  ]);
  return { shareWorkouts: w === '1', shareHealth: h === '1', lastSync: s || null, lastError: e || null };
}

export async function setShareWorkouts(on: boolean): Promise<void> {
  await setSetting(SHARE_WORKOUTS, on ? '1' : '0');
}

export async function setShareHealth(on: boolean): Promise<void> {
  await setSetting(SHARE_HEALTH, on ? '1' : '0');
}

/** Everything FIT would post right now, under the current sharing choices. */
export async function eventsToShare(prefs: FamilyPrefs, now = Date.now()): Promise<FamilyEvent[]> {
  const since = now - WINDOW_DAYS * 86_400_000;
  const out: FamilyEvent[] = [];
  if (prefs.shareWorkouts) {
    for (const s of await listSessions(200)) {
      if (s.status !== 'completed' || !s.startedAt || s.startedAt.getTime() < since) continue;
      const e = strengthEvent(s);
      if (e) out.push(e);
    }
    for (const c of await listCardioSessions(200)) {
      if (c.status !== 'finished' || c.startedAt < since) continue;
      out.push(
        cardioEvent({
          id: c.id,
          sportLabel: sportById(c.sport).label,
          startedAt: c.startedAt,
          movingS: c.movingS,
          elapsedS: c.elapsedS,
          distanceM: c.distanceM,
        })
      );
    }
  }
  if (prefs.shareHealth) {
    const end = today();
    let start = end;
    for (let i = 1; i < 7; i++) start = previousDay(start);
    try {
      for (const d of await health.readDays(start, end)) {
        const e = healthDayEvent({
          date: d.date,
          steps: d.steps,
          sleepMinutes: d.sleepMinutes,
          restingHeartRate: d.restingHeartRate,
          activeCalories: d.activeCalories,
          distanceMeters: d.distanceMeters,
        });
        if (e) out.push(e);
      }
    } catch {
      // No health data this time: workouts still go.
    }
  }
  return out;
}

/**
 * Posts to the family feed. Quietly does nothing when signed out or with
 * sharing off; records the last success or the one-sentence reason it failed
 * for the Settings screen. Never throws: it runs in the background.
 */
export async function syncFamily(opts: { force?: boolean } = {}): Promise<{ sent: number } | null> {
  try {
    const { signedIn } = await family.status();
    if (!signedIn) return null;
    const prefs = await familyPrefs();
    if (!prefs.shareWorkouts && !prefs.shareHealth) return null;
    if (!opts.force && prefs.lastSync && Date.now() - Date.parse(prefs.lastSync) < MIN_GAP_MS) return null;
    const events = await eventsToShare(prefs);
    for (let i = 0; i < events.length; i += BATCH) {
      await family.rpc('log_events', { events: events.slice(i, i + BATCH) });
    }
    await setSetting(LAST_SYNC, new Date().toISOString());
    await setSetting(LAST_ERROR, '');
    return { sent: events.length };
  } catch (e) {
    await setSetting(LAST_ERROR, e instanceof Error ? e.message : String(e)).catch(() => undefined);
    return null;
  }
}

/** Where Supabase sends the browser back to after Google or Apple. */
export const OAUTH_REDIRECT = 'bitfit://family-auth';

/**
 * Sign in with Google (or Apple) through Supabase's own page, PKCE-protected.
 * Resolves false if the person closed the page.
 */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<boolean> {
  const bytes = Crypto.getRandomBytes(48);
  const verifier = base64url(btoa(String.fromCharCode(...bytes)));
  const challenge = base64url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    })
  );
  const result = await WebBrowser.openAuthSessionAsync(oauthUrl(provider, OAUTH_REDIRECT, challenge), OAUTH_REDIRECT);
  if (result.type !== 'success') return false;
  const params = new URL(result.url.replace('#', '?')).searchParams;
  const code = params.get('code');
  if (!code) {
    throw new FamilyError(params.get('error_description') ?? 'The sign-in page came back without a sign-in.', 'auth');
  }
  await family.finishOAuth(code, verifier);
  return true;
}

export { FamilyError } from './client';
