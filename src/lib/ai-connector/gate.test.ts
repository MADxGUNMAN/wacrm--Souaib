import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/subscription/gate-cache', () => ({
  getCachedGateConfig: vi.fn(),
}));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: vi.fn() }));

import type { OAuthClientRecord } from './clients';
import {
  bearerToken,
  insufficientScopeChallenge,
  isAllowedMcpOrigin,
  runGate,
  unauthorizedChallenge,
  type GateDeps,
} from './gate';
import type { AccessTokenRow, ConnectionRow } from './store';
import { generateToken } from './tokens';

const config = {
  enabled: true,
  issuer: 'https://wacrm.example.com',
  mcpUrl: 'https://wacrm.example.com/mcp',
  allowDevClients: false,
  disabledPlatforms: new Set<never>(),
  allowedAccounts: null,
};
const ACCOUNT = '3430edae-763b-4aac-9b82-1c2364936d79';
const USER = '2b7a9798-3044-440f-80be-68952f57d708';
const CONN = '44444444-4444-4444-8444-444444444444';
const CLIENT: OAuthClientRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
  kind: 'cimd',
  platform: 'claude',
  display_name: 'Claude',
  redirect_uris: [],
  trust: 'trusted',
};

function setup(
  over: {
    token?: Partial<AccessTokenRow> | null;
    conn?: Partial<ConnectionRow> | null;
    client?: Partial<OAuthClientRecord> | null;
    profile?: Record<string, unknown> | null;
    banned?: boolean;
    blocked?: boolean;
  } = {}
) {
  const token = generateToken('access');
  const tokenRow: AccessTokenRow = {
    connection_id: CONN,
    scopes: ['profile', 'contacts:read', 'messages:send'],
    issuer: config.issuer,
    resource: config.mcpUrl,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    revoked_at: null,
    ...over.token,
  };
  const conn: ConnectionRow = {
    id: CONN,
    account_id: ACCOUNT,
    user_id: USER,
    oauth_client_id: CLIENT.id,
    platform: 'claude',
    granted_scopes: ['profile', 'contacts:read'],
    settings: {},
    issuer: config.issuer,
    revoked_at: null,
    created_at: new Date().toISOString(),
    last_used_at: null,
    ...over.conn,
  };
  const deps: GateDeps = {
    findAccessToken: vi.fn(async (t) =>
      t === token && over.token !== null ? tokenRow : null
    ),
    loadConnection: vi.fn(async () => (over.conn === null ? null : conn)),
    loadClient: vi.fn(async () =>
      over.client === null ? null : { ...CLIENT, ...over.client }
    ),
    loadProfile: vi.fn(async () =>
      over.profile === null
        ? null
        : {
            account_id: ACCOUNT,
            account_role: 'owner',
            permissions: null,
            is_active: true,
            is_super_admin: false,
            full_name: 'Souaib Ansari',
            email: 'owner@example.com',
            ...over.profile,
          }
    ),
    loadAccount: vi.fn(async () => ({
      id: ACCOUNT,
      name: 'Acme',
      default_currency: 'INR',
      is_banned: over.banned ?? false,
    })),
    loadPolicy: vi.fn(async () => null),
    loadProfileId: vi.fn(async () => 'prf_abc'),
    isSubscriptionBlocked: vi.fn(async () => over.blocked ?? false),
  };
  const request = (
    auth: string | null = `Bearer ${token}`,
    url = config.mcpUrl
  ) =>
    ({
      url,
      headers: new Headers(auth ? { authorization: auth } : {}),
    }) as Request;
  return { deps, request, token };
}

describe('runGate', () => {
  it('accepts a live token and intersects token and connection scopes', async () => {
    const { deps, request } = setup();
    const r = await runGate(request(), config, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ctx.scopes).toEqual(['profile', 'contacts:read']);
    expect(r.ctx).toMatchObject({
      userId: USER,
      accountId: ACCOUNT,
      profileId: 'prf_abc',
      role: 'owner',
      accountName: 'Acme',
    });
  });

  it.each([
    ['no header', null],
    ['basic auth', 'Basic abc'],
    ['malformed', 'Bearer not-a-token'],
  ])('401 for %s', async (_label, auth) => {
    const { deps, request } = setup();
    const r = await runGate(request(auth), config, deps);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.challenge).toContain(
        'resource_metadata="https://wacrm.example.com/.well-known/oauth-protected-resource/mcp"'
      );
    expect(deps.findAccessToken).not.toHaveBeenCalled();
  });

  it('rejects tokens in the query string', async () => {
    const { deps, request, token } = setup();
    const r = await runGate(
      request(null, `${config.mcpUrl}?access_token=${token}`),
      config,
      deps
    );
    expect(r.ok === false && r.reason).toBe('token_in_query');
  });

  it.each([
    ['unknown', { token: null }, 'unknown_token'],
    [
      'revoked',
      { token: { revoked_at: new Date().toISOString() } },
      'revoked_token',
    ],
    [
      'expired',
      { token: { expires_at: new Date(Date.now() - 1000).toISOString() } },
      'expired_token',
    ],
    // Isolation 7: a devcrm token presented to wacrm.
    [
      'other deployment',
      { token: { issuer: 'https://devcrm.example.com' } },
      'wrong_audience',
    ],
    [
      'other resource',
      { token: { resource: 'https://wacrm.example.com/other' } },
      'wrong_audience',
    ],
    // Isolation 6: revoked connection → 401.
    [
      'revoked connection',
      { conn: { revoked_at: new Date().toISOString() } },
      'connection_revoked',
    ],
    ['missing connection', { conn: null }, 'connection_revoked'],
    ['blocked client', { client: { trust: 'blocked' } }, 'client_blocked'],
    ['dev client in prod', { client: { trust: 'dev_only' } }, 'client_blocked'],
    [
      'moved account',
      { profile: { account_id: '99999999-9999-4999-8999-999999999999' } },
      'membership_changed',
    ],
    ['deactivated', { profile: { is_active: false } }, 'membership_changed'],
    [
      'super admin',
      { profile: { is_super_admin: true } },
      'membership_changed',
    ],
  ] as const)('401 for %s', async (_label, over, reason) => {
    const { deps, request } = setup(over as Parameters<typeof setup>[0]);
    const r = await runGate(request(), config, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(reason);
      expect(r.challenge).toContain('error="invalid_token"');
    }
  });

  it('lets ban and lapsed subscription through to per-tool refusal', async () => {
    const { deps, request } = setup({ banned: true, blocked: true });
    const r = await runGate(request(), config, deps);
    expect(r.ok && r.ctx.account).toMatchObject({
      banned: true,
      subscriptionBlocked: true,
    });
  });
});

describe('challenges', () => {
  it('401 asks for every scope plus offline_access (the user picks on consent)', () => {
    const c = unauthorizedChallenge(config);
    expect(c).toMatch(
      /^Bearer resource_metadata="[^"]+", scope="profile contacts:read .*offline_access"$/
    );
    // Claude requests exactly these; leaving out a tier locks its switch.
    for (const s of ['messages:send', 'broadcasts:send', 'automations:manage'])
      expect(c).toContain(s);
  });
  it('403 step-up lists every required scope', () => {
    const c = insufficientScopeChallenge(
      config,
      ['profile', 'contacts:read', 'messages:send'],
      'Needs "send"'
    );
    expect(c).toContain('error="insufficient_scope"');
    expect(c).toContain(
      'scope="profile contacts:read messages:send offline_access"'
    );
    expect(c).toContain('error_description="Needs send"');
  });
});

describe('bearerToken / origin', () => {
  it('parses bearer headers strictly', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
  it('allows platform, own and (dev only) loopback origins', () => {
    expect(isAllowedMcpOrigin(null, config)).toBe(true);
    expect(isAllowedMcpOrigin('https://claude.ai', config)).toBe(true);
    expect(isAllowedMcpOrigin('https://chatgpt.com', config)).toBe(true);
    expect(isAllowedMcpOrigin(config.issuer, config)).toBe(true);
    expect(isAllowedMcpOrigin('https://evil.example', config)).toBe(false);
    expect(isAllowedMcpOrigin('http://localhost:6274', config)).toBe(false);
    expect(
      isAllowedMcpOrigin('http://localhost:6274', {
        ...config,
        allowDevClients: true,
      })
    ).toBe(true);
  });
});
