import { describe, expect, it, vi } from 'vitest';
import {
  fetchCimdDocument,
  isCimdClientId,
  isLoopbackRedirect,
  redirectUriMatches,
  resolveClient,
  validateCimdDocument,
  validateDcrRequest,
  type ClientStore,
  type OAuthClientRecord,
} from './clients';

const CLAUDE_ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const CLAUDE_DOC = {
  client_id: CLAUDE_ID,
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  token_endpoint_auth_method: 'none',
};
const CHATGPT_DOC = {
  client_id: 'https://chatgpt.com/oauth/client.json',
  redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
  token_endpoint_auth_method: 'private_key_jwt',
  token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
};

describe('redirect URIs', () => {
  it('detects loopback redirects', () => {
    expect(isLoopbackRedirect('http://localhost:5555/callback')).toBe(true);
    expect(isLoopbackRedirect('http://127.0.0.1/callback')).toBe(true);
    expect(isLoopbackRedirect('https://localhost/callback')).toBe(false);
    expect(isLoopbackRedirect('http://localhost.evil.com/callback')).toBe(
      false
    );
  });

  it('matches exactly for normal redirects', () => {
    const reg = ['https://claude.ai/api/mcp/auth_callback'];
    expect(
      redirectUriMatches('https://claude.ai/api/mcp/auth_callback', reg)
    ).toBe(true);
    expect(
      redirectUriMatches('https://claude.ai/api/mcp/auth_callback/', reg)
    ).toBe(false);
    expect(
      redirectUriMatches('https://claude.ai/api/mcp/auth_callback?x=1', reg)
    ).toBe(false);
    expect(
      redirectUriMatches('https://evil.com/api/mcp/auth_callback', reg)
    ).toBe(false);
  });

  it('ignores only the port for loopback redirects (Claude Code)', () => {
    const reg = ['http://localhost/callback', 'http://127.0.0.1/callback'];
    expect(redirectUriMatches('http://localhost:49152/callback', reg)).toBe(
      true
    );
    expect(redirectUriMatches('http://127.0.0.1:3118/callback', reg)).toBe(
      true
    );
    expect(redirectUriMatches('http://localhost:49152/other', reg)).toBe(false);
    expect(redirectUriMatches('http://localhost:49152/callback?x=1', reg)).toBe(
      false
    );
    expect(redirectUriMatches('https://localhost:49152/callback', reg)).toBe(
      false
    );
  });
});

describe('CIMD', () => {
  it('recognises plausible CIMD client ids', () => {
    expect(isCimdClientId(CLAUDE_ID)).toBe(true);
    expect(isCimdClientId('https://claude.ai/')).toBe(false);
    expect(isCimdClientId('http://claude.ai/x')).toBe(false);
    expect(isCimdClientId('https://u:p@claude.ai/x')).toBe(false);
    expect(isCimdClientId('dcr_abc')).toBe(false);
  });

  it('validates the real Claude and ChatGPT documents', () => {
    expect(validateCimdDocument(CLAUDE_DOC, CLAUDE_ID).ok).toBe(true);
    expect(validateCimdDocument(CHATGPT_DOC, CHATGPT_DOC.client_id).ok).toBe(
      true
    );
  });

  it('rejects documents that do not name themselves or have bad redirects', () => {
    expect(validateCimdDocument(CLAUDE_DOC, 'https://evil.com/meta').ok).toBe(
      false
    );
    expect(
      validateCimdDocument({ ...CLAUDE_DOC, redirect_uris: [] }, CLAUDE_ID).ok
    ).toBe(false);
    expect(
      validateCimdDocument(
        { ...CLAUDE_DOC, redirect_uris: ['http://evil.com/cb'] },
        CLAUDE_ID
      ).ok
    ).toBe(false);
    expect(
      validateCimdDocument(
        { ...CLAUDE_DOC, redirect_uris: ['javascript:alert(1)'] },
        CLAUDE_ID
      ).ok
    ).toBe(false);
    expect(
      validateCimdDocument(
        { ...CLAUDE_DOC, token_endpoint_auth_method: 'client_secret_basic' },
        CLAUDE_ID
      ).ok
    ).toBe(false);
    expect(validateCimdDocument('nope', CLAUDE_ID).ok).toBe(false);
  });

  it('fetches with the SSRF guard, no redirects and a size cap', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(CLAUDE_DOC), { status: 200 })
    );
    const ok = await fetchCimdDocument(CLAUDE_ID, {
      fetchImpl: fetchImpl as typeof fetch,
      isDeliverable: async () => true,
    });
    expect(ok.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      CLAUDE_ID,
      expect.objectContaining({ redirect: 'manual' })
    );

    const blocked = await fetchCimdDocument(CLAUDE_ID, {
      fetchImpl: fetchImpl as typeof fetch,
      isDeliverable: async () => false,
    });
    expect(blocked).toEqual({
      ok: false,
      error: 'metadata host is not publicly routable',
    });

    const redirect = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/' },
        })
    );
    expect(
      (
        await fetchCimdDocument(CLAUDE_ID, {
          fetchImpl: redirect as typeof fetch,
          isDeliverable: async () => true,
        })
      ).ok
    ).toBe(false);

    const huge = vi.fn(
      async () => new Response('x'.repeat(9000), { status: 200 })
    );
    expect(
      (
        await fetchCimdDocument(CLAUDE_ID, {
          fetchImpl: huge as typeof fetch,
          isDeliverable: async () => true,
        })
      ).ok
    ).toBe(false);
  });
});

function makeStore(
  rows: OAuthClientRecord[] = []
): ClientStore & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    async findByClientId(id) {
      return rows.find((r) => r.client_id === id) ?? null;
    },
    async saveDevCimdClient(input) {
      saved.push(input);
      return {
        id: 'new',
        kind: 'cimd',
        platform: 'other',
        trust: 'dev_only',
        ...input,
      };
    },
  };
}

const trustedClaude: OAuthClientRecord = {
  id: '1',
  client_id: CLAUDE_ID,
  kind: 'cimd',
  platform: 'claude',
  display_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  trust: 'trusted',
};
const prod = { allowDevClients: false, disabledPlatforms: new Set<never>() };

describe('resolveClient', () => {
  it('accepts registry-trusted clients without fetching anything', async () => {
    const fetchImpl = vi.fn();
    const r = await resolveClient(CLAUDE_ID, prod, makeStore([trustedClaude]), {
      fetchImpl: fetchImpl as never,
    });
    expect(r.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses blocked clients and disabled platforms', async () => {
    expect(
      await resolveClient(
        CLAUDE_ID,
        prod,
        makeStore([{ ...trustedClaude, trust: 'blocked' }])
      )
    ).toEqual({
      ok: false,
      error: 'blocked_client',
    });
    const off = {
      allowDevClients: false,
      disabledPlatforms: new Set(['claude' as const]),
    };
    expect(
      (await resolveClient(CLAUDE_ID, off, makeStore([trustedClaude]))).ok
    ).toBe(false);
  });

  it('refuses unknown clients in production', async () => {
    const r = await resolveClient(
      'https://evil.example/client.json',
      prod,
      makeStore()
    );
    expect(r).toEqual({ ok: false, error: 'unknown_client' });
  });

  it('refuses dev-only clients in production but accepts them in development', async () => {
    const dev = {
      ...trustedClaude,
      client_id: 'dcr_x',
      trust: 'dev_only' as const,
      platform: 'other' as const,
    };
    expect((await resolveClient('dcr_x', prod, makeStore([dev]))).ok).toBe(
      false
    );
    expect(
      (
        await resolveClient(
          'dcr_x',
          { ...prod, allowDevClients: true },
          makeStore([dev])
        )
      ).ok
    ).toBe(true);
  });

  it('registers an unknown CIMD client as dev_only only when dev clients are allowed', async () => {
    const id = 'https://inspector.example/client.json';
    const doc = {
      client_id: id,
      redirect_uris: ['http://localhost:6274/oauth/callback'],
    };
    const store = makeStore();
    const r = await resolveClient(
      id,
      { ...prod, allowDevClients: true },
      store,
      {
        fetchImpl: (async () =>
          new Response(JSON.stringify(doc), { status: 200 })) as typeof fetch,
        isDeliverable: async () => true,
      }
    );
    expect(r.ok && r.client.trust).toBe('dev_only');
    expect(store.saved).toHaveLength(1);
  });
});

describe('validateDcrRequest', () => {
  const cfg = { allowDevClients: false, dcrEnabled: true };

  it('treats a registration that can only redirect to claude.ai as Claude', () => {
    const r = validateDcrRequest(
      {
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        client_name: 'Totally Claude',
      },
      cfg
    );
    expect(r).toEqual({
      ok: true,
      value: {
        redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
        platform: 'claude',
        trust: 'trusted',
        displayName: 'Claude',
      },
    });
  });

  it('rejects any other redirect host in production', () => {
    expect(
      validateDcrRequest({ redirect_uris: ['https://evil.com/cb'] }, cfg).ok
    ).toBe(false);
    expect(
      validateDcrRequest(
        { redirect_uris: ['https://claude.ai/cb', 'https://evil.com/cb'] },
        cfg
      ).ok
    ).toBe(false);
    expect(
      validateDcrRequest({ redirect_uris: ['http://localhost:6274/cb'] }, cfg)
        .ok
    ).toBe(false);
  });

  it('allows other redirects as dev_only in development', () => {
    const r = validateDcrRequest(
      {
        redirect_uris: ['http://localhost:6274/cb'],
        client_name: 'MCP Inspector',
      },
      {
        ...cfg,
        allowDevClients: true,
      }
    );
    expect(r.ok && r.value.trust).toBe('dev_only');
    expect(r.ok && r.value.platform).toBe('mcp_inspector');
  });

  it('rejects confidential clients, odd grants and disabled DCR', () => {
    const uris = ['https://claude.ai/api/mcp/auth_callback'];
    expect(
      validateDcrRequest(
        {
          redirect_uris: uris,
          token_endpoint_auth_method: 'client_secret_post',
        },
        cfg
      ).ok
    ).toBe(false);
    expect(
      validateDcrRequest(
        { redirect_uris: uris, grant_types: ['client_credentials'] },
        cfg
      ).ok
    ).toBe(false);
    expect(
      validateDcrRequest({ redirect_uris: uris }, { ...cfg, dcrEnabled: false })
        .ok
    ).toBe(false);
    expect(validateDcrRequest(null, cfg).ok).toBe(false);
  });
});
