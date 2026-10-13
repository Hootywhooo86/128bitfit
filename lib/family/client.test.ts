import { describe, expect, it } from 'vitest';
import { base64url, createFamilyClient, FAMILY, oauthUrl, type Fetch, type Session, type SessionStore } from './client';

function memory(initial: Session | null = null): SessionStore & { value: Session | null } {
  const store = {
    value: initial,
    async load() {
      return store.value;
    },
    async save(s: Session | null) {
      store.value = s;
    },
  };
  return store;
}

type Call = { url: string; body: unknown; headers: Record<string, string> };

function server(reply: (c: Call) => { status: number; json?: unknown } | 'offline') {
  const calls: Call[] = [];
  const f: Fetch = async (url, init) => {
    const c = { url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers };
    calls.push(c);
    const r = reply(c);
    if (r === 'offline') throw new TypeError('Network request failed');
    return { ok: r.status < 300, status: r.status, text: async () => (r.json === undefined ? '' : JSON.stringify(r.json)) };
  };
  return { f, calls };
}

const tokens = { access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1', email: 'me@x.com' } };
const future = Math.floor(Date.now() / 1000) + 3600;

describe('family client', () => {
  it('signs in with email and password and keeps the session', async () => {
    const { f, calls } = server(() => ({ status: 200, json: tokens }));
    const store = memory();
    await createFamilyClient(f, store).signIn(' me@x.com ', 'secret1');
    expect(calls[0].url).toBe(`${FAMILY.url}/auth/v1/token?grant_type=password`);
    expect(calls[0].body).toEqual({ email: 'me@x.com', password: 'secret1' });
    expect(calls[0].headers.apikey).toBe(FAMILY.key);
    expect(store.value).toMatchObject({ access: 'a1', refresh: 'r1', email: 'me@x.com', userId: 'u1' });
  });

  it('says plainly when the password is wrong', async () => {
    const { f } = server(() => ({ status: 400, json: { error_description: 'Invalid login credentials' } }));
    await expect(createFamilyClient(f, memory()).signIn('me@x.com', 'nope00')).rejects.toThrow(
      'That email and password do not match a 128bit account.'
    );
  });

  it('says so when offline, without losing the session', async () => {
    const { f } = server(() => 'offline');
    const store = memory({ access: 'a', refresh: 'r', expires: future, email: null, userId: null });
    await expect(createFamilyClient(f, store).rpc('log_events', { events: [] })).rejects.toMatchObject({ code: 'offline' });
    expect(store.value).not.toBeNull();
  });

  it('a new account that needs its email confirmed returns null', async () => {
    const { f } = server(() => ({ status: 200, json: { user: { id: 'u2' } } }));
    expect(await createFamilyClient(f, memory()).signUp('new@x.com', 'secret1')).toBeNull();
  });

  it('refuses a short password before calling anyone', async () => {
    const { f, calls } = server(() => ({ status: 200, json: tokens }));
    await expect(createFamilyClient(f, memory()).signUp('new@x.com', '123')).rejects.toThrow(/at least 6/);
    expect(calls).toHaveLength(0);
  });

  it('refreshes an expiring session before calling the feed', async () => {
    const { f, calls } = server((c) =>
      c.url.includes('refresh_token') ? { status: 200, json: { ...tokens, access_token: 'a2' } } : { status: 200, json: 3 }
    );
    const store = memory({ access: 'old', refresh: 'r0', expires: 0, email: 'me@x.com', userId: 'u1' });
    expect(await createFamilyClient(f, store).rpc('log_events', { events: [] })).toBe(3);
    expect(calls[0].body).toEqual({ refresh_token: 'r0' });
    expect(calls[1].url).toBe(`${FAMILY.url}/rest/v1/rpc/log_events`);
    expect(calls[1].headers.Authorization).toBe('Bearer a2');
  });

  it('a refused refresh signs out and asks to sign in again', async () => {
    const { f } = server(() => ({ status: 400, json: { error_description: 'Invalid Refresh Token: Revoked' } }));
    const store = memory({ access: 'old', refresh: 'r0', expires: 0, email: null, userId: null });
    await expect(createFamilyClient(f, store).rpc('get_events', {})).rejects.toThrow('Your 128bit sign-in expired. Sign in again.');
    expect(store.value).toBeNull();
  });

  it('names a project without the family feed', async () => {
    const { f } = server(() => ({ status: 404, json: { message: 'Could not find the function public.log_events' } }));
    const store = memory({ access: 'a', refresh: 'r', expires: future, email: null, userId: null });
    await expect(createFamilyClient(f, store).rpc('log_events', {})).rejects.toMatchObject({ code: 'missing-feed' });
  });

  it('signing out forgets the session even offline', async () => {
    const { f } = server(() => 'offline');
    const store = memory({ access: 'a', refresh: 'r', expires: future, email: null, userId: null });
    await createFamilyClient(f, store).signOut();
    expect(store.value).toBeNull();
  });

  it('builds the PKCE sign-in page address', () => {
    const u = new URL(oauthUrl('google', 'bitfit://family-auth', 'abc'));
    expect(u.pathname).toBe('/auth/v1/authorize');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      provider: 'google',
      redirect_to: 'bitfit://family-auth',
      code_challenge: 'abc',
      code_challenge_method: 's256',
    });
    expect(base64url('a+b/c==')).toBe('a-b_c');
  });
});
