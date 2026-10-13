/**
 * The 128bit family account: one sign-in shared with 128bitPlay, Tracker and
 * the rest, on the family Supabase project.
 *
 * Talks to Supabase Auth and the family feed over plain fetch, the same calls
 * 128bittracker's family-account.js makes, so the two stay interchangeable.
 * Pure apart from what it is handed: `fetch` and a `store` for the session,
 * which the app backs with the phone's secure storage (lib/family/session.ts).
 *
 * The publishable key is meant to be public; the feed tables are only
 * reachable through the family functions, as the signed-in user.
 */
export const FAMILY = {
  url: 'https://wvflpwtaszpstmjpkrhu.supabase.co',
  key: 'sb_publishable_dO8uP74cTV1tbuqESgxysw_323C7lWh',
} as const;

export type Session = {
  access: string;
  refresh: string;
  /** Seconds since 1970. */
  expires: number;
  email: string | null;
  userId: string | null;
};

export type SessionStore = {
  load(): Promise<Session | null>;
  save(s: Session | null): Promise<void>;
};

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** Thrown with a sentence the screen can show as-is. */
export class FamilyError extends Error {
  constructor(
    message: string,
    readonly code: 'offline' | 'auth' | 'server' | 'confirm' | 'missing-feed' = 'server'
  ) {
    super(message);
  }
}

type TokenReply = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
  error_description?: string;
  msg?: string;
  message?: string;
};

async function call(fetchImpl: Fetch, path: string, body: unknown, headers: Record<string, string> = {}) {
  let res;
  try {
    res = await fetchImpl(`${FAMILY.url}${path}`, {
      method: 'POST',
      headers: { apikey: FAMILY.key, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new FamilyError('No connection to the 128bit family account. It will try again when you are online.', 'offline');
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function toSession(j: TokenReply, email: string | null): Session {
  if (!j.access_token || !j.refresh_token) throw new FamilyError('The account service did not return a sign-in.', 'server');
  return {
    access: j.access_token,
    refresh: j.refresh_token,
    expires: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
    email: j.user?.email ?? email,
    userId: j.user?.id ?? null,
  };
}

function authError(status: number, j: TokenReply | null): FamilyError {
  const raw = j?.error_description || j?.msg || j?.message || '';
  if (/invalid login credentials/i.test(raw)) return new FamilyError('That email and password do not match a 128bit account.', 'auth');
  if (/email not confirmed/i.test(raw)) return new FamilyError('Confirm your email first: open the link the 128bit account sent you.', 'confirm');
  if (/already registered|already exists/i.test(raw)) return new FamilyError('There is already a 128bit account with that email. Sign in instead.', 'auth');
  if (status >= 500) return new FamilyError('The 128bit account service is having trouble. Try again in a minute.', 'server');
  return new FamilyError(raw || `The account service answered ${status}.`, status === 400 || status === 401 ? 'auth' : 'server');
}

export function createFamilyClient(fetchImpl: Fetch, store: SessionStore) {
  async function token(grant: string, body: unknown, email: string | null): Promise<Session> {
    const r = await call(fetchImpl, `/auth/v1/token?grant_type=${grant}`, body);
    if (!r.ok) throw authError(r.status, r.json as TokenReply | null);
    const s = toSession(r.json as TokenReply, email);
    await store.save(s);
    return s;
  }

  /** A live session, refreshed when it is within a minute of expiring. */
  async function current(): Promise<Session> {
    const s = await store.load();
    if (!s) throw new FamilyError('Sign in to your 128bit family account first.', 'auth');
    if (s.expires - 60 > Date.now() / 1000) return s;
    try {
      return await token('refresh_token', { refresh_token: s.refresh }, s.email);
    } catch (e) {
      if (e instanceof FamilyError && e.code === 'auth') {
        await store.save(null);
        throw new FamilyError('Your 128bit sign-in expired. Sign in again.', 'auth');
      }
      throw e;
    }
  }

  return {
    async status(): Promise<{ signedIn: boolean; email: string | null }> {
      const s = await store.load();
      return { signedIn: !!s, email: s?.email ?? null };
    },

    signIn(email: string, password: string): Promise<Session> {
      const e = email.trim();
      if (!e || !password) return Promise.reject(new FamilyError('Enter your email and password.', 'auth'));
      return token('password', { email: e, password }, e);
    },

    /** Creates the account. Resolves null when the project wants the email confirmed first. */
    async signUp(email: string, password: string): Promise<Session | null> {
      const e = email.trim();
      if (!e || password.length < 6) throw new FamilyError('Pick a password of at least 6 characters.', 'auth');
      const r = await call(fetchImpl, '/auth/v1/signup', { email: e, password });
      if (!r.ok) throw authError(r.status, r.json as TokenReply | null);
      const j = r.json as TokenReply;
      if (!j?.access_token) return null;
      const s = toSession(j, e);
      await store.save(s);
      return s;
    },

    /** Finishes a Google or Apple sign-in: the ?code= that came back, and the PKCE verifier that started it. */
    finishOAuth(code: string, verifier: string): Promise<Session> {
      return token('pkce', { auth_code: code, code_verifier: verifier }, null);
    },

    async signOut(): Promise<void> {
      const s = await store.load();
      await store.save(null);
      if (s) {
        // Best effort: the session is gone from this phone either way.
        void call(fetchImpl, '/auth/v1/logout', {}, { Authorization: `Bearer ${s.access}` }).catch(() => undefined);
      }
    },

    /** Calls a family function as the signed-in user. */
    async rpc<T = unknown>(fn: string, args: unknown): Promise<T> {
      const s = await current();
      const r = await call(fetchImpl, `/rest/v1/rpc/${fn}`, args, { Authorization: `Bearer ${s.access}` });
      if (!r.ok) {
        const msg = (r.json as { message?: string } | null)?.message ?? '';
        if (/does not exist|Could not find the function/i.test(msg)) {
          throw new FamilyError('This 128bit account has no family feed set up yet.', 'missing-feed');
        }
        throw new FamilyError(msg || `The family feed answered ${r.status}.`, 'server');
      }
      return r.json as T;
    },
  };
}

export type FamilyClient = ReturnType<typeof createFamilyClient>;

/** The Supabase page that signs in with Google or Apple and comes back to `redirect` with ?code=. */
export function oauthUrl(provider: 'google' | 'apple', redirect: string, challenge: string): string {
  const q = new URLSearchParams({ provider, redirect_to: redirect, code_challenge: challenge, code_challenge_method: 's256' });
  return `${FAMILY.url}/auth/v1/authorize?${q.toString()}`;
}

/** Standard base64 to base64url, as PKCE wants. */
export function base64url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
