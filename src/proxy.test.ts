import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// --- Scenario knobs the mock reads -----------------------------------------
// `mockUser`         — what getUser() resolves to (a refreshed session ⇒ user,
//                      or null for the logged-out path).
// `refreshedCookies` — cookies Supabase writes via setAll() during getUser(),
//                      i.e. the freshly *rotated* auth token. The whole point
//                      of the test is that these must survive onto whatever
//                      response the Proxy returns — including redirects.
let mockUser: { id: string } | null = null;
let refreshedCookies: Array<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> = [];

// Rows the mocked PostgREST client returns, keyed by table. Defaults to
// `null` (no row), which is the "can't resolve this user" path — the
// Proxy treats that as fail-open and simply doesn't gate.
let mockRows: Record<string, unknown> = {};

// What security_two_factor_gate() returns for the signed-in user.
let mockGate: { required: string; satisfied: boolean } | 'error' = {
  required: 'none',
  satisfied: true,
};
let rpcCalls = 0;

/**
 * Minimal chainable PostgREST stub.
 *
 * The Proxy issues `.from(t).select(...).eq(...).maybeSingle()`.
 * Every builder method returns `this` so the chain composes in any
 * order, and `maybeSingle()` resolves the row registered for the table.
 * Without this the Proxy's super-admin lookup throws
 * "supabase.from is not a function" and every assertion below is
 * unreachable.
 */
function makeQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: mockRows[table] ?? null, error: null }),
    single: async () => ({ data: mockRows[table] ?? null, error: null }),
  };
  return builder;
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: { setAll: (c: typeof refreshedCookies) => void };
    }
  ) => ({
    auth: {
      // Mirrors real auth-js: an expired access token is transparently
      // refreshed inside getUser(), which rotates the refresh token and
      // pushes the new cookies through setAll() before resolving.
      getUser: async () => {
        if (refreshedCookies.length) opts.cookies.setAll(refreshedCookies);
        return { data: { user: mockUser } };
      },
      getSession: async () => ({
        data: { session: mockUser ? { access_token: 'h.e30.s' } : null },
      }),
    },
    rpc: async () => {
      rpcCalls++;
      return mockGate === 'error'
        ? { data: null, error: { message: 'down' } }
        : { data: [mockGate], error: null };
    },
    from: (table: string) => makeQueryBuilder(table),
  }),
}));

// The real gate cache reads `subscription_settings` with the service role.
// Pin it so the subscription-gate cases below are deterministic.
vi.mock('@/lib/subscription/gate-cache', () => ({
  getCachedGateConfig: async () => ({ is_enabled: true, grace_days: 0 }),
}));

// Imported after the mock is registered.
const { proxy } = await import('./proxy');
const { __resetTwoFactorGateCacheForTests } =
  await import('@/lib/two-factor/gate');

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  mockUser = null;
  refreshedCookies = [];
  mockRows = {};
  mockGate = { required: 'none', satisfied: true };
  rpcCalls = 0;
  __resetTwoFactorGateCacheForTests();
});

afterEach(() => vi.clearAllMocks());

const ROTATED = {
  name: 'sb-test-auth-token',
  value: 'rotated-refresh-token',
  options: { path: '/', httpOnly: true },
};

describe('proxy — refreshed auth cookies survive redirects', () => {
  it('carries the rotated token when redirecting a signed-in user off /login', async () => {
    mockUser = { id: 'user-1' };
    refreshedCookies = [ROTATED];

    const res = await proxy(new NextRequest('https://app.test/login'));

    // Redirect to /dashboard…
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/dashboard');
    // …and the rotated cookie MUST ride along, otherwise the browser keeps
    // replaying the now-consumed refresh token and the session wedges until
    // the user manually clears cookies.
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it('carries the rotated token when redirecting an unauth user to /login', async () => {
    mockUser = null;
    // Even on the logged-out path getUser() may emit cookie writes (e.g.
    // clearing a dead session); those must not be dropped on the redirect.
    refreshedCookies = [{ ...ROTATED, value: 'cleared' }];

    const res = await proxy(new NextRequest('https://app.test/dashboard'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.cookies.get(ROTATED.name)?.value).toBe('cleared');
  });

  it('redirects a signed-in user with an invite token to /join/<token>', async () => {
    mockUser = { id: 'user-1' };
    refreshedCookies = [ROTATED];

    const res = await proxy(
      new NextRequest('https://app.test/login?invite=abc123')
    );

    expect(res.headers.get('location')).toContain('/join/abc123');
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it('passes through (no redirect) for a signed-in user on a protected page', async () => {
    mockUser = { id: 'user-1' };
    refreshedCookies = [ROTATED];

    const res = await proxy(new NextRequest('https://app.test/dashboard'));

    // No redirect — the normal NextResponse.next() already carries cookies.
    expect(res.headers.get('location')).toBeNull();
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });
});

describe('proxy � lapsed subscription gate', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const lapsedTrialAccount = {
    is_banned: false,
    subscription_status: 'trialing',
    trial_ends_at: yesterday,
    subscription_ends_at: null,
    plan_selection_required: false,
    selected_plan_id: 'p1',
    selected_cycle_id: 'c1',
  };

  it('sends a lapsed-trial owner to the plan chooser, not the payment page', async () => {
    mockUser = { id: 'user-1' };
    mockRows = {
      profiles: {
        account_id: 'acc-1',
        is_super_admin: false,
        account_role: 'owner',
      },
      accounts: lapsedTrialAccount,
    };

    const res = await proxy(new NextRequest('https://app.test/dashboard'));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/upgrade-plan');
    expect(location.search).toBe('');
  });

  it('sends a lapsed-trial member to /subscription-required', async () => {
    mockUser = { id: 'user-1' };
    mockRows = {
      profiles: {
        account_id: 'acc-1',
        is_super_admin: false,
        account_role: 'member',
      },
      accounts: lapsedTrialAccount,
    };

    const res = await proxy(new NextRequest('https://app.test/dashboard'));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe(
      '/subscription-required'
    );
  });
});

describe('proxy — two-factor gate', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    refreshedCookies = [ROTATED];
  });

  it('sends an unverified session to /two-factor with a safe next', async () => {
    mockGate = { required: 'personal', satisfied: false };
    const res = await proxy(new NextRequest('https://app.test/inbox?c=42'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location') ?? '');
    expect(loc.pathname).toBe('/two-factor');
    expect(loc.searchParams.get('next')).toBe('/inbox?c=42');
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it('answers API calls with 403 two_factor_required', async () => {
    mockGate = { required: 'owner', satisfied: false };
    const res = await proxy(new NextRequest('https://app.test/api/contacts'));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'two_factor_required' });
  });

  it('leaves the 2FA flow, sign-out and public pages open', async () => {
    mockGate = { required: 'owner', satisfied: false };
    for (const path of [
      '/two-factor',
      '/api/security/two-factor/verify',
      '/api/security/two-factor/challenge',
      '/api/security/sessions/logout',
      '/docs',
    ]) {
      const res = await proxy(new NextRequest(`https://app.test${path}`));
      expect(res.headers.get('location')).toBeNull();
      expect(res.status).toBe(200);
    }
    expect(rpcCalls).toBe(0);
  });

  it('fails closed when the gate check errors', async () => {
    mockGate = 'error';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await proxy(new NextRequest('https://app.test/settings'));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe(
      '/two-factor'
    );
  });

  it('caches a passed check for the same session', async () => {
    mockGate = { required: 'personal', satisfied: true };
    await proxy(new NextRequest('https://app.test/dashboard'));
    await proxy(new NextRequest('https://app.test/api/contacts'));
    expect(rpcCalls).toBe(1);
  });
});
