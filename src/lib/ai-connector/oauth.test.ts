import { describe, expect, it, vi } from 'vitest';
import type { OAuthClientRecord } from './clients';
import {
  authorizationRedirect,
  authorizationServerMetadata,
  handleRevokeRequest,
  handleTokenRequest,
  protectedResourceMetadata,
  resourceMatches,
  validateAuthorizeParams,
  type ResolveClientFn,
  type TokenDeps,
} from './oauth';
import { s256Challenge } from './pkce';
import { DEFAULT_REQUESTED_SCOPES } from './scopes';
import type { ConnectionRow, RotateResult, StoredCodeRow } from './store';
import { generateToken } from './tokens';

const config = {
  issuer: 'https://wacrm.example.com',
  mcpUrl: 'https://wacrm.example.com/mcp',
  dcrEnabled: true,
  allowDevClients: false,
};

const CLAUDE: OAuthClientRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
  kind: 'cimd',
  platform: 'claude',
  display_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  trust: 'trusted',
};
const OTHER: OAuthClientRecord = {
  ...CLAUDE,
  id: '22222222-2222-4222-8222-222222222222',
  client_id: 'https://chatgpt.com/oauth/client.json',
  platform: 'chatgpt',
  redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
};
const DEV: OAuthClientRecord = {
  ...CLAUDE,
  id: '33333333-3333-4333-8333-333333333333',
  client_id: 'dcr_x',
  trust: 'dev_only',
};

const VERIFIER = 'a'.repeat(43) + '-._~b';
const CHALLENGE = s256Challenge(VERIFIER);

const resolve: ResolveClientFn = async (id) =>
  id === CLAUDE.client_id
    ? { ok: true, client: CLAUDE }
    : { ok: false, error: 'unknown_client' };

function authorizeParams(
  overrides: Record<string, string | null> = {}
): URLSearchParams {
  const base: Record<string, string | null> = {
    client_id: CLAUDE.client_id,
    redirect_uri: CLAUDE.redirect_uris[0],
    response_type: 'code',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'st-123',
    resource: config.mcpUrl,
    scope: 'contacts:read messages:send',
    ...overrides,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== null) p.set(k, v);
  return p;
}

describe('metadata', () => {
  it('protected resource points at the issuer', () => {
    const m = protectedResourceMetadata(config);
    expect(m.resource).toBe(config.mcpUrl);
    expect(m.authorization_servers).toEqual([config.issuer]);
  });
  it('authorization server advertises S256, none, CIMD and iss', () => {
    const m = authorizationServerMetadata(config);
    expect(m.issuer).toBe(config.issuer);
    expect(m.code_challenge_methods_supported).toEqual(['S256']);
    expect(m.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(m.client_id_metadata_document_supported).toBe(true);
    expect(m.authorization_response_iss_parameter_supported).toBe(true);
    expect(m.registration_endpoint).toBe(`${config.issuer}/oauth/register`);
    expect(m.scopes_supported).toContain('offline_access');
  });
  it('omits registration when DCR is off', () => {
    expect(
      'registration_endpoint' in
        authorizationServerMetadata({ ...config, dcrEnabled: false })
    ).toBe(false);
  });
});

describe('validateAuthorizeParams', () => {
  it('accepts a good request and always includes profile', async () => {
    const r = await validateAuthorizeParams(authorizeParams(), config, resolve);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.scopes).toEqual(['profile', 'contacts:read', 'messages:send']);
    expect(r.resource).toBe(config.mcpUrl);
    expect(r.state).toBe('st-123');
  });

  it('uses the default scope set when none is requested', async () => {
    const r = await validateAuthorizeParams(
      authorizeParams({ scope: null }),
      config,
      resolve
    );
    expect(r.kind === 'ok' && r.scopes).toEqual([...DEFAULT_REQUESTED_SCOPES]);
    const r2 = await validateAuthorizeParams(
      authorizeParams({ scope: 'offline_access' }),
      config,
      resolve
    );
    expect(r2.kind === 'ok' && r2.scopes).toEqual([
      ...DEFAULT_REQUESTED_SCOPES,
    ]);
  });

  it('defaults a missing resource and tolerates a trailing slash', async () => {
    expect(
      (
        await validateAuthorizeParams(
          authorizeParams({ resource: null }),
          config,
          resolve
        )
      ).kind
    ).toBe('ok');
    expect(
      (
        await validateAuthorizeParams(
          authorizeParams({ resource: `${config.mcpUrl}/` }),
          config,
          resolve
        )
      ).kind
    ).toBe('ok');
  });

  it('never redirects for an unknown client or unregistered redirect', async () => {
    const a = await validateAuthorizeParams(
      authorizeParams({ client_id: 'https://evil.example/c' }),
      config,
      resolve
    );
    expect(a.kind).toBe('error_page');
    const b = await validateAuthorizeParams(
      authorizeParams({ redirect_uri: 'https://evil.example/cb' }),
      config,
      resolve
    );
    expect(b.kind).toBe('error_page');
    const c = await validateAuthorizeParams(
      authorizeParams({ redirect_uri: null }),
      config,
      resolve
    );
    expect(c.kind).toBe('error_page');
    const d = await validateAuthorizeParams(
      authorizeParams({ client_id: null }),
      config,
      resolve
    );
    expect(d.kind).toBe('error_page');
  });

  it('rejects repeated parameters without redirecting', async () => {
    const p = authorizeParams();
    p.append('redirect_uri', 'https://evil.example/cb');
    expect((await validateAuthorizeParams(p, config, resolve)).kind).toBe(
      'error_page'
    );
  });

  it.each([
    [{ response_type: 'token' }, 'unsupported_response_type'],
    [{ state: null }, 'invalid_request'],
    [{ state: 'x'.repeat(1025) }, 'invalid_request'],
    [{ code_challenge_method: 'plain' }, 'invalid_request'],
    [{ code_challenge: null }, 'invalid_request'],
    [{ code_challenge: 'short' }, 'invalid_request'],
    [{ resource: 'https://evil.example/mcp' }, 'invalid_target'],
    [{ scope: 'contacts:read admin' }, 'invalid_scope'],
  ])('redirects with an error for %o', async (override, error) => {
    const r = await validateAuthorizeParams(
      authorizeParams(override),
      config,
      resolve
    );
    expect(r.kind).toBe('redirect_error');
    if (r.kind === 'redirect_error') {
      expect(r.error).toBe(error);
      expect(r.redirectUri).toBe(CLAUDE.redirect_uris[0]);
    }
  });
});

describe('authorizationRedirect', () => {
  it('adds code, state and iss and keeps existing query', () => {
    const url = new URL(
      authorizationRedirect(
        'https://app.example/cb?x=1',
        config.issuer,
        { code: 'C' },
        'S'
      )
    );
    expect(url.searchParams.get('x')).toBe('1');
    expect(url.searchParams.get('code')).toBe('C');
    expect(url.searchParams.get('state')).toBe('S');
    expect(url.searchParams.get('iss')).toBe(config.issuer);
  });
  it('builds an error redirect without state when absent', () => {
    const url = new URL(
      authorizationRedirect(
        CLAUDE.redirect_uris[0],
        config.issuer,
        { error: 'access_denied', description: 'no' },
        null
      )
    );
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('error_description')).toBe('no');
    expect(url.searchParams.has('state')).toBe(false);
    expect(url.searchParams.get('iss')).toBe(config.issuer);
  });
});

// ------------------------------------------------------------
// Token endpoint
// ------------------------------------------------------------

const CONN_ID = '44444444-4444-4444-8444-444444444444';

function makeDeps(
  opts: {
    code?: Partial<StoredCodeRow>;
    claim?: boolean;
    connRevoked?: boolean;
    rotate?: RotateResult;
  } = {}
) {
  const code = generateToken('code');
  const row: StoredCodeRow = {
    code_hash: 'h1',
    connection_id: CONN_ID,
    oauth_client_id: CLAUDE.id,
    redirect_uri: CLAUDE.redirect_uris[0],
    code_challenge: CHALLENGE,
    granted_scopes: ['profile', 'contacts:read'],
    resource: config.mcpUrl,
    issuer: config.issuer,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    ...opts.code,
  };
  const conn = {
    id: CONN_ID,
    oauth_client_id: CLAUDE.id,
    revoked_at: opts.connRevoked ? new Date().toISOString() : null,
  };
  const deps = {
    findClient: vi.fn(
      async (id: string) =>
        [CLAUDE, OTHER, DEV].find((c) => c.client_id === id) ?? null
    ),
    findCode: vi.fn(async (c: string) => (c === code ? row : null)),
    claimCode: vi.fn(async () => opts.claim ?? true),
    getConnection: vi.fn(async () => conn),
    revokeConnection: vi.fn(async () => {}),
    issueTokens: vi.fn(async () => ({
      accessToken: 'rpl_at_x',
      refreshToken: 'rpl_rt_x',
      expiresIn: 3600,
    })),
    rotateRefresh: vi.fn(
      async (): Promise<RotateResult> =>
        opts.rotate ?? {
          state: 'ok',
          tokens: {
            accessToken: 'rpl_at_y',
            refreshToken: 'rpl_rt_y',
            expiresIn: 3600,
          },
          scopes: ['profile', 'contacts:read'],
          connection: { id: CONN_ID } as ConnectionRow,
        }
    ),
    onEvent: vi.fn(),
  } satisfies TokenDeps;
  return { deps, code };
}

function codeForm(code: string, overrides: Record<string, string | null> = {}) {
  const base: Record<string, string | null> = {
    grant_type: 'authorization_code',
    code,
    client_id: CLAUDE.client_id,
    redirect_uri: CLAUDE.redirect_uris[0],
    code_verifier: VERIFIER,
    resource: config.mcpUrl,
    ...overrides,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== null) p.set(k, v);
  return p;
}

describe('handleTokenRequest — authorization_code', () => {
  it('issues tokens for a valid code', async () => {
    const { deps, code } = makeDeps();
    const r = await handleTokenRequest(codeForm(code), config, deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      token_type: 'Bearer',
      access_token: 'rpl_at_x',
      refresh_token: 'rpl_rt_x',
      scope: 'profile contacts:read',
    });
    expect(r.headers?.['Cache-Control']).toBe('no-store');
    expect(deps.claimCode).toHaveBeenCalledWith('h1');
    expect(deps.issueTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: CONN_ID,
        resource: config.mcpUrl,
      })
    );
  });

  it('does not burn the code when PKCE fails', async () => {
    const { deps, code } = makeDeps();
    const r = await handleTokenRequest(
      codeForm(code, { code_verifier: 'b'.repeat(43) }),
      config,
      deps
    );
    expect(r.body.error).toBe('invalid_grant');
    expect(deps.claimCode).not.toHaveBeenCalled();
    expect(deps.revokeConnection).not.toHaveBeenCalled();
  });

  it.each([
    [{ redirect_uri: 'https://claude.ai/other' }],
    [{ code_verifier: null }],
    [{ code: 'not-a-code' }],
  ])('rejects %o with invalid_grant', async (override) => {
    const { deps, code } = makeDeps();
    const r = await handleTokenRequest(codeForm(code, override), config, deps);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_grant');
    expect(deps.issueTokens).not.toHaveBeenCalled();
  });

  it('rejects a code issued to another client', async () => {
    const { deps, code } = makeDeps({ code: { oauth_client_id: OTHER.id } });
    const r = await handleTokenRequest(codeForm(code), config, deps);
    expect(r.body.error).toBe('invalid_grant');
  });

  it('rejects a code minted by the other deployment', async () => {
    const { deps, code } = makeDeps({
      code: { issuer: 'https://devcrm.example.com' },
    });
    expect(
      (await handleTokenRequest(codeForm(code), config, deps)).body.error
    ).toBe('invalid_grant');
  });

  it('rejects an expired code', async () => {
    const { deps, code } = makeDeps({
      code: { expires_at: new Date(Date.now() - 1000).toISOString() },
    });
    expect(
      (await handleTokenRequest(codeForm(code), config, deps)).body.error
    ).toBe('invalid_grant');
  });

  it('revokes the connection when a used code is presented again', async () => {
    const { deps, code } = makeDeps({
      code: { used_at: new Date().toISOString() },
    });
    const r = await handleTokenRequest(codeForm(code), config, deps);
    expect(r.body.error).toBe('invalid_grant');
    expect(deps.revokeConnection).toHaveBeenCalledWith(CONN_ID, 'code_reuse');
    expect(deps.onEvent).toHaveBeenCalledWith({
      type: 'code_reuse',
      connectionId: CONN_ID,
    });
  });

  it('a different client replaying a used code cannot revoke the connection', async () => {
    const { deps, code } = makeDeps({
      code: { used_at: new Date().toISOString() },
    });
    await handleTokenRequest(
      codeForm(code, { client_id: OTHER.client_id }),
      config,
      deps
    );
    expect(deps.revokeConnection).not.toHaveBeenCalled();
  });

  it('treats a lost claim race as reuse', async () => {
    const { deps, code } = makeDeps({ claim: false });
    const r = await handleTokenRequest(codeForm(code), config, deps);
    expect(r.body.error).toBe('invalid_grant');
    expect(deps.revokeConnection).toHaveBeenCalledWith(CONN_ID, 'code_reuse');
    expect(deps.issueTokens).not.toHaveBeenCalled();
  });

  it('does not issue tokens for a revoked connection', async () => {
    const { deps, code } = makeDeps({ connRevoked: true });
    expect(
      (await handleTokenRequest(codeForm(code), config, deps)).body.error
    ).toBe('invalid_grant');
    expect(deps.issueTokens).not.toHaveBeenCalled();
  });

  it('client errors', async () => {
    const { deps, code } = makeDeps();
    const missing = await handleTokenRequest(
      codeForm(code, { client_id: null }),
      config,
      deps
    );
    expect(missing.status).toBe(401);
    const unknown = await handleTokenRequest(
      codeForm(code, { client_id: 'https://evil.example/c' }),
      config,
      deps
    );
    expect(unknown.body.error).toBe('invalid_client');
    const dev = await handleTokenRequest(
      codeForm(code, { client_id: DEV.client_id }),
      config,
      deps
    );
    expect(dev.body.error).toBe('invalid_client');
  });

  it('other request errors', async () => {
    const { deps, code } = makeDeps();
    expect(
      (
        await handleTokenRequest(
          codeForm(code, { grant_type: 'password' }),
          config,
          deps
        )
      ).body.error
    ).toBe('unsupported_grant_type');
    expect(
      (
        await handleTokenRequest(
          codeForm(code, { resource: 'https://evil.example/mcp' }),
          config,
          deps
        )
      ).body.error
    ).toBe('invalid_target');
    const p = codeForm(code);
    p.append('code', code);
    expect((await handleTokenRequest(p, config, deps)).body.error).toBe(
      'invalid_request'
    );
  });
});

describe('handleTokenRequest — refresh_token', () => {
  const form = (token: string, extra: Record<string, string> = {}) =>
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token,
      client_id: CLAUDE.client_id,
      ...extra,
    });

  it('rotates and binds to the presenting client', async () => {
    const { deps } = makeDeps();
    const token = generateToken('refresh');
    const r = await handleTokenRequest(
      form(token, { scope: 'contacts:write' }),
      config,
      deps
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      access_token: 'rpl_at_y',
      refresh_token: 'rpl_rt_y',
      scope: 'profile contacts:read',
    });
    expect(deps.rotateRefresh).toHaveBeenCalledWith(token, {
      issuer: config.issuer,
      resource: config.mcpUrl,
      clientDbId: CLAUDE.id,
    });
  });

  it('reports reuse', async () => {
    const { deps } = makeDeps({
      rotate: { state: 'reused', connection: { id: CONN_ID } as ConnectionRow },
    });
    const r = await handleTokenRequest(
      form(generateToken('refresh')),
      config,
      deps
    );
    expect(r.body.error).toBe('invalid_grant');
    expect(deps.onEvent).toHaveBeenCalledWith({
      type: 'refresh_reuse',
      connectionId: CONN_ID,
    });
  });

  it.each([
    'unknown',
    'expired',
    'revoked',
    'wrong_audience',
    'wrong_client',
    'connection_revoked',
  ] as const)('maps %s to invalid_grant', async (state) => {
    const { deps } = makeDeps({ rotate: { state } });
    expect(
      (await handleTokenRequest(form(generateToken('refresh')), config, deps))
        .body.error
    ).toBe('invalid_grant');
  });

  it('rejects malformed tokens without a lookup', async () => {
    const { deps } = makeDeps();
    expect(
      (await handleTokenRequest(form('rpl_at_nope'), config, deps)).body.error
    ).toBe('invalid_grant');
    expect(deps.rotateRefresh).not.toHaveBeenCalled();
  });
});

describe('handleRevokeRequest', () => {
  it('revokes known token shapes and always answers 200', async () => {
    const revoke = vi.fn(async () => null);
    const t = generateToken('refresh');
    expect(
      (await handleRevokeRequest(new URLSearchParams({ token: t }), revoke))
        .status
    ).toBe(200);
    expect(revoke).toHaveBeenCalledWith(t);
    expect(
      (
        await handleRevokeRequest(
          new URLSearchParams({ token: 'garbage' }),
          revoke
        )
      ).status
    ).toBe(200);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(
      (await handleRevokeRequest(new URLSearchParams(), revoke)).status
    ).toBe(400);
  });
});

describe('resourceMatches', () => {
  it('ignores only trailing slashes', () => {
    expect(
      resourceMatches('https://a.example/mcp/', 'https://a.example/mcp')
    ).toBe(true);
    expect(
      resourceMatches('https://a.example/mcp2', 'https://a.example/mcp')
    ).toBe(false);
  });
});
