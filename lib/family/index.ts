/**
 * The 128bit family feed: optional, off until you sign in under
 * Settings → 128bit family, and each kind of data has its own switch.
 *
 * When on, finished workouts and/or daily health totals go to the feed in your
 * 128bit family account (or a Supabase project of the user's own), and 128bit
 * Tracker shows them on its timeline.
 *
 * Offline-first like everything else: events wait in an outbox in the local
 * database and go up a few seconds later, or whenever the phone is back online.
 * Nothing is collected while signed out.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getSetting, setSetting } from '@/db/settings-store';
import { onHealthDaysRead } from '@/lib/health';
import { LOOKUP_TIMEOUT_MS, fetchWithTimeout } from '@/lib/net';
import {
  cardioEvent,
  enqueue,
  healthDayEvent,
  strengthEvent,
  workoutEventId,
  type FamilyEvent,
  type OutboxItem,
} from './events';

const PROJECT_KEY = 'family.project';
const SHARE_KEY = 'family.share';
const OUTBOX_KEY = 'family.outbox';
const LAST_KEY = 'family.lastSent';
const SESSION_KEY = 'bitfit_family_session';

/** The SQL that creates the feed. 128bitPlay's setup SQL includes the same block. */
export const FAMILY_SQL_URL = 'https://github.com/Hootywhooo86/128bittracker/blob/main/supabase/family.sql';

export type Project = { url: string; anonKey: string };
export type Share = { workouts: boolean; health: boolean };
type Session = { access: string; refresh: string; expires: number; email: string };

// --- Stored state -------------------------------------------------------------

/**
 * The 128bit family project: one account across play, fit, tracker, gold and life. Its
 * publishable key is meant to ship inside apps; the tables are only reachable through the
 * family SQL's functions. A project saved under "Use my own Supabase project" wins.
 */
export const FAMILY_PROJECT: Project = {
  url: 'https://wvflpwtaszpstmjpkrhu.supabase.co',
  anonKey: 'sb_publishable_dO8uP74cTV1tbuqESgxysw_323C7lWh',
};

export async function getProject(): Promise<Project> {
  try {
    const raw = await getSetting(PROJECT_KEY);
    if (raw) return JSON.parse(raw) as Project;
  } catch {
    // fall through
  }
  return FAMILY_PROJECT;
}


export async function getShare(): Promise<Share> {
  try {
    const raw = await getSetting(SHARE_KEY);
    if (raw) return { workouts: false, health: false, ...(JSON.parse(raw) as Partial<Share>) };
  } catch {
    // fall through
  }
  return { workouts: false, health: false };
}

export async function setShare(share: Share): Promise<void> {
  await setSetting(SHARE_KEY, JSON.stringify(share));
}

let memorySession: string | null = null;

async function secureAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function getSession(): Promise<Session | null> {
  try {
    const raw = (await secureAvailable()) ? await SecureStore.getItemAsync(SESSION_KEY) : memorySession;
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

async function saveSession(s: Session | null): Promise<void> {
  const raw = s ? JSON.stringify(s) : null;
  if (await secureAvailable()) {
    if (raw) await SecureStore.setItemAsync(SESSION_KEY, raw);
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  } else {
    memorySession = raw;
  }
}

async function getOutbox(): Promise<OutboxItem[]> {
  try {
    return JSON.parse((await getSetting(OUTBOX_KEY)) ?? '[]') as OutboxItem[];
  } catch {
    return [];
  }
}

const saveOutbox = (q: OutboxItem[]) => setSetting(OUTBOX_KEY, JSON.stringify(q));

export type FamilyStatus = {
  project: Project;
  /** Signed in to a project of the user's own rather than the 128bit family one. */
  ownProject: boolean;
  email: string | null;
  share: Share;
  waiting: number;
  lastSent: number | null;
  lastError: string | null;
};

let lastError: string | null = null;

export async function familyStatus(): Promise<FamilyStatus> {
  const [project, session, share, outbox, last] = await Promise.all([
    getProject(),
    getSession(),
    getShare(),
    getOutbox(),
    getSetting(LAST_KEY),
  ]);
  return {
    project,
    ownProject: project.url !== FAMILY_PROJECT.url,
    email: session?.email ?? null,
    share,
    waiting: outbox.length,
    lastSent: last ? Number(last) : null,
    lastError,
  };
}

// --- Supabase ---------------------------------------------------------------------

async function call(project: Project, path: string, body: unknown, token?: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${project.url}${path}`,
      {
        method: 'POST',
        headers: {
          apikey: project.anonKey,
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      },
      { timeoutMs: LOOKUP_TIMEOUT_MS }
    );
  } catch {
    throw new Error('Could not reach the 128bit family account. It will try again later.');
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const msg = String(
      json?.error_description ?? json?.msg ?? json?.message ?? json?.error ?? `Supabase answered ${res.status}`
    );
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      throw new Error('The 128bit family account isn\'t set up yet. Try again later.');
    }
    throw new Error(msg);
  }
  return json;
}

type AuthAnswer = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { email?: string };
};

function toSession(a: AuthAnswer, email: string): Session {
  if (!a.access_token || !a.refresh_token) throw new Error('Sign-in failed.');
  return {
    access: a.access_token,
    refresh: a.refresh_token,
    expires: a.expires_at ?? Math.floor(Date.now() / 1000) + (a.expires_in ?? 3600),
    email: a.user?.email ?? email,
  };
}

function checkProject(project: Project): Project {
  const url = project.url.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(url)) throw new Error('The Project URL looks like https://abcd1234.supabase.co');
  if (project.anonKey.trim().length < 20) throw new Error('Paste the anon / publishable key from Settings → API.');
  return { url, anonKey: project.anonKey.trim() };
}

async function signedInTo(p: Project, s: Session): Promise<void> {
  await saveSession(s);
  // The family project isn't saved, so a later change to it reaches this phone.
  await setSetting(PROJECT_KEY, p.url === FAMILY_PROJECT.url ? '' : JSON.stringify(p));
  lastError = null;
}

/** Email and password: the same 128bit family account as 128bitPlay and Tracker. */
export async function signInFamily(project: Project, email: string, password: string): Promise<void> {
  const p = checkProject(project);
  const a = (await call(p, '/auth/v1/token?grant_type=password', { email: email.trim(), password })) as AuthAnswer;
  await signedInTo(p, toSession(a, email.trim()));
}

/** Creates the account. False when Supabase wants the email confirmed first. */
export async function signUpFamily(project: Project, email: string, password: string): Promise<boolean> {
  const p = checkProject(project);
  const a = (await call(p, '/auth/v1/signup', { email: email.trim(), password })) as AuthAnswer;
  if (!a.access_token) return false;
  await signedInTo(p, toSession(a, email.trim()));
  return true;
}

// Google / Apple: Supabase's sign-in page in an in-app browser, back through
// bitfit://auth-callback. PKCE, so a code caught by another app is useless without the
// verifier that never leaves this one. Needs the provider on in Supabase and
// bitfit://auth-callback in Authentication → URL Configuration → Redirect URLs.
export type Provider = 'google' | 'apple';
const AUTH_CALLBACK = 'bitfit://auth-callback';

/** Resolves signed in, or throws one honest sentence (cancelled, refused, offline). */
export async function signInWithProvider(provider: Provider, project: Project): Promise<void> {
  const p = checkProject(project);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const verifier = Array.from(Crypto.getRandomBytes(64), (b) => chars[b % chars.length]).join('');
  const challenge = (
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    })
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const authUrl =
    `${p.url}/auth/v1/authorize?provider=${provider}` +
    `&redirect_to=${encodeURIComponent(AUTH_CALLBACK)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, AUTH_CALLBACK);
  if (result.type !== 'success') throw new Error('Sign-in was cancelled.');
  const back = new URL(result.url);
  const code = back.searchParams.get('code');
  if (!code) throw new Error(back.searchParams.get('error_description') ?? 'Sign-in was refused.');
  const a = (await call(p, '/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: verifier })) as AuthAnswer;
  await signedInTo(p, toSession(a, ''));
}

/** Deletes the 128bit family account and what every 128bit app sent to it. This phone keeps its own data. */
export async function deleteFamilyAccount(): Promise<void> {
  const project = await getProject();
  const t = await token(project);
  if (!t) throw new Error('Sign in first.');
  await call(project, '/rest/v1/rpc/delete_my_account', {}, t);
  await signOutFamily();
}

/** Signs out and drops anything still waiting: nothing goes up after this. */
export async function signOutFamily(): Promise<void> {
  await saveSession(null);
  await saveOutbox([]);
  await setShare({ workouts: false, health: false });
  lastError = null;
}

async function token(project: Project): Promise<string | null> {
  const s = await getSession();
  if (!s) return null;
  if (s.expires - 60 > Date.now() / 1000) return s.access;
  try {
    const a = (await call(project, '/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh })) as AuthAnswer;
    const fresh = toSession(a, s.email);
    await saveSession(fresh);
    return fresh.access;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/invalid|not found|revoked|expired/i.test(msg)) {
      await saveSession(null);
      throw new Error('Signed out of the family feed. Sign in again to keep sending.');
    }
    throw e;
  }
}

// --- Outbox -------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null;
let sending: Promise<void> | null = null;

async function add(item: OutboxItem): Promise<void> {
  await saveOutbox(enqueue(await getOutbox(), item));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void sendFamilyNow().catch(() => {});
  }, 3000);
}

/** Sends what's waiting. Throws one honest sentence when it can't; the outbox keeps it. */
export function sendFamilyNow(): Promise<void> {
  sending ??= (async () => {
    try {
      const project = await getProject();
      let q = await getOutbox();
      if (!project || q.length === 0) return;
      const t = await token(project);
      if (!t) return;
      while (q.length) {
        const head = q[0];
        let done: OutboxItem[];
        if (head.op === 'delete') {
          await call(project, '/rest/v1/rpc/delete_event', { event_id: head.id }, t);
          done = [head];
        } else {
          const end = q.findIndex((o, i) => o.op !== 'put' || i >= 100);
          done = q.slice(0, end === -1 ? q.length : end);
          const events = done.map((o) => (o as { event: FamilyEvent }).event);
          await call(project, '/rest/v1/rpc/log_events', { events }, t);
        }
        // Re-read: something may have been added while this was in flight.
        const sent = new Set(done.map((o) => JSON.stringify(o)));
        q = (await getOutbox()).filter((o) => !sent.has(JSON.stringify(o)));
        await saveOutbox(q);
      }
      await setSetting(LAST_KEY, String(Date.now()));
      lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      throw e;
    }
  })().finally(() => {
    sending = null;
  });
  return sending;
}

async function signedIn(): Promise<boolean> {
  return !!(await getProject()) && !!(await getSession());
}

// --- What gets posted -------------------------------------------------------------

/** Never throws: the workout is saved either way. */
export function familyStrength(input: Parameters<typeof strengthEvent>[0]): void {
  void (async () => {
    if (!(await signedIn()) || !(await getShare()).workouts) return;
    await add({ op: 'put', event: strengthEvent(input) });
  })().catch(() => {});
}

export function familyCardio(input: Parameters<typeof cardioEvent>[0]): void {
  void (async () => {
    if (!(await signedIn()) || !(await getShare()).workouts) return;
    await add({ op: 'put', event: cardioEvent(input) });
  })().catch(() => {});
}

/** A deleted workout leaves the timeline too. */
export function familyWorkoutRemoved(localId: string): void {
  void (async () => {
    if (!(await signedIn())) return;
    await add({ op: 'delete', id: workoutEventId(localId) });
  })().catch(() => {});
}

// Only a day whose totals changed goes up again.
const sentDays = new Map<string, string>();
const WEEK_MS = 7 * 86_400_000;

onHealthDaysRead((days) => {
  void (async () => {
    if (!(await signedIn()) || !(await getShare()).health) return;
    const now = Date.now();
    for (const day of days) {
      const e = healthDayEvent(day, now);
      if (!e || now - e.at > WEEK_MS) continue;
      const sig = JSON.stringify(e.data);
      if (sentDays.get(e.id) === sig) continue;
      sentDays.set(e.id, sig);
      await add({ op: 'put', event: e });
    }
  })().catch(() => {});
});
