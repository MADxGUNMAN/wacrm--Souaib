// ============================================================
// AI connector — OAuth 2.1 authorization server logic.
//
// Pure request → response functions with the database behind a small
// interface, so every rule is unit-tested without Supabase. The route
// files under src/app/oauth and src/app/.well-known only parse HTTP and
// call these.
//
//   * Authorization code + PKCE (S256) only; public clients (`none`).
//   * RFC 9207 `iss` on every authorization response.
//   * RFC 8707 `resource` bound into codes and tokens (= the MCP URL).
//   * Refresh tokens rotate; presenting a used one revokes the connection.
//   * Codes are single use; presenting a used one revokes the connection.
//
// Plan: docs/ai-connector/01-architecture.md §3, 02-security.md T1–T6.
// ============================================================

import type { AiConnectorConfig } from './config';
import {
  redirectUriMatches,
  type OAuthClientRecord,
  type ResolveError,
} from './clients';
import { isValidChallenge, verifyPkce } from './pkce';
import {
  AI_SCOPES,
  DEFAULT_REQUESTED_SCOPES,
  OFFLINE_ACCESS,
  formatScopes,
  parseScopeString,
} from './scopes';
import { looksLikeToken } from './tokens';
import type {
  ConnectionRow,
  RotateResult,
  StoredCodeRow,
  TokenPair,
} from './store';

type Cfg = Pick<
  AiConnectorConfig,
  'issuer' | 'mcpUrl' | 'dcrEnabled' | 'allowDevClients'
>;

// ------------------------------------------------------------
// Metadata documents
// ------------------------------------------------------------

/** RFC 9728 protected resource metadata for `${issuer}/mcp`. */
export function protectedResourceMetadata(config: Cfg) {
  return {
    resource: config.mcpUrl,
    authorization_servers: [config.issuer],
    scopes_supported: [...AI_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Replai',
  };
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(config: Cfg) {
  const base = config.issuer;
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    ...(config.dcrEnabled
      ? { registration_endpoint: `${base}/oauth/register` }
      : {}),
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...AI_SCOPES, OFFLINE_ACCESS],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

// ------------------------------------------------------------
// Authorization endpoint
// ------------------------------------------------------------

/** Accept the MCP URL with or without a trailing slash. */
export function resourceMatches(requested: string, mcpUrl: string): boolean {
  return requested.replace(/\/+$/, '') === mcpUrl.replace(/\/+$/, '');
}

const SINGLE_VALUE_PARAMS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'state',
  'resource',
] as const;

const MAX_STATE_LENGTH = 1024;

export const AUTHORIZE_ERROR_REASONS = [
  'repeated_param',
  'missing_client',
  'unknown_client',
  'blocked_client',
  'platform_disabled',
  'invalid_metadata',
  'bad_redirect',
  'unavailable',
  'expired',
] as const;
export type AuthorizeErrorReason = (typeof AUTHORIZE_ERROR_REASONS)[number];

export type AuthorizeResult =
  /** Can't trust the redirect URI: show an error page, never redirect. */
  | {
      kind: 'error_page';
      error: string;
      /** Stable key the error page translates (never echoes input). */
      reason: AuthorizeErrorReason;
      description: string;
    }
  /** Client and redirect are fine: send the error back to the client. */
  | {
      kind: 'redirect_error';
      redirectUri: string;
      state: string | null;
      error: string;
      description: string;
    }
  | {
      kind: 'ok';
      client: OAuthClientRecord;
      redirectUri: string;
      state: string;
      codeChallenge: string;
      scopes: string[];
      resource: string;
    };

export type ResolveClientFn = (
  clientId: string
) => Promise<
  | { ok: true; client: OAuthClientRecord }
  | { ok: false; error: ResolveError; detail?: string }
>;

const RESOLVE_ERROR_TEXT: Record<ResolveError, string> = {
  unknown_client: 'This app is not registered with Replai.',
  blocked_client: 'This app has been blocked from connecting to Replai.',
  platform_disabled: 'Connections from this app are temporarily disabled.',
  invalid_metadata: 'This app published invalid registration details.',
};

/**
 * Validate an authorization request (RFC 6749 §4.1.2.1 ordering): client
 * and redirect URI problems are shown to the user; everything after that
 * goes back to the client as an error redirect carrying state and iss.
 */
export async function validateAuthorizeParams(
  params: URLSearchParams,
  config: Cfg,
  resolveClient: ResolveClientFn
): Promise<AuthorizeResult> {
  for (const name of SINGLE_VALUE_PARAMS) {
    if (params.getAll(name).length > 1) {
      return {
        kind: 'error_page',
        error: 'invalid_request',
        reason: 'repeated_param',
        description: `The ${name} parameter was repeated.`,
      };
    }
  }

  const clientId = params.get('client_id');
  if (!clientId) {
    return {
      kind: 'error_page',
      error: 'invalid_request',
      reason: 'missing_client',
      description: 'The request did not say which app is connecting.',
    };
  }
  const resolved = await resolveClient(clientId);
  if (!resolved.ok) {
    return {
      kind: 'error_page',
      error: 'invalid_client',
      reason: resolved.error,
      description: RESOLVE_ERROR_TEXT[resolved.error],
    };
  }
  const client = resolved.client;

  const redirectUri = params.get('redirect_uri');
  if (!redirectUri || !redirectUriMatches(redirectUri, client.redirect_uris)) {
    return {
      kind: 'error_page',
      error: 'invalid_request',
      reason: 'bad_redirect',
      description:
        'The app asked to return to an address it has not registered.',
    };
  }

  const stateRaw = params.get('state');
  const state =
    stateRaw && stateRaw.length <= MAX_STATE_LENGTH ? stateRaw : null;
  const fail = (error: string, description: string): AuthorizeResult => ({
    kind: 'redirect_error',
    redirectUri,
    state,
    error,
    description,
  });

  if (params.get('response_type') !== 'code') {
    return fail(
      'unsupported_response_type',
      'Only response_type=code is supported.'
    );
  }
  if (!state)
    return fail(
      'invalid_request',
      'state is required (at most 1024 characters).'
    );

  const codeChallenge = params.get('code_challenge');
  if (!isValidChallenge(codeChallenge, params.get('code_challenge_method'))) {
    return fail(
      'invalid_request',
      'PKCE with code_challenge_method=S256 is required.'
    );
  }

  const resource = params.get('resource') ?? config.mcpUrl;
  if (!resourceMatches(resource, config.mcpUrl)) {
    return fail('invalid_target', `resource must be ${config.mcpUrl}.`);
  }

  const scopeParam = params.get('scope');
  const parsed = parseScopeString(scopeParam);
  if (parsed.unknown.length) {
    return fail(
      'invalid_scope',
      `Unknown scope: ${parsed.unknown.slice(0, 5).join(' ')}`
    );
  }
  // Only offline_access / nothing requested → the default set (View + Edit).
  const onlyProfile = parsed.scopes.length === 1;
  const scopes = onlyProfile ? [...DEFAULT_REQUESTED_SCOPES] : parsed.scopes;

  return {
    kind: 'ok',
    client,
    redirectUri,
    state,
    codeChallenge,
    scopes,
    resource: config.mcpUrl,
  };
}

/**
 * Build the redirect back to the client: success (`code`) or error, plus
 * `state` and `iss` (RFC 9207 — lets the client detect mix-up attacks).
 * Existing query parameters on the registered redirect URI are kept.
 */
export function authorizationRedirect(
  redirectUri: string,
  issuer: string,
  result: { code: string } | { error: string; description?: string },
  state: string | null
): string {
  const url = new URL(redirectUri);
  if ('code' in result) {
    url.searchParams.set('code', result.code);
  } else {
    url.searchParams.set('error', result.error);
    if (result.description)
      url.searchParams.set('error_description', result.description);
  }
  if (state) url.searchParams.set('state', state);
  url.searchParams.set('iss', issuer);
  return url.toString();
}

// ------------------------------------------------------------
// Token endpoint
// ------------------------------------------------------------

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
} as const;

export interface OAuthResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export function oauthError(
  status: number,
  error: string,
  description?: string
): OAuthResponse {
  return {
    status,
    body: description ? { error, error_description: description } : { error },
    headers:
      status === 401
        ? { 'WWW-Authenticate': 'Basic realm="replai"' }
        : undefined,
  };
}

/** What the token endpoint needs from the database (store.ts in prod). */
export interface TokenDeps {
  findClient(clientId: string): Promise<OAuthClientRecord | null>;
  findCode(code: string): Promise<StoredCodeRow | null>;
  claimCode(codeHash: string): Promise<boolean>;
  getConnection(
    id: string
  ): Promise<Pick<
    ConnectionRow,
    'id' | 'oauth_client_id' | 'revoked_at'
  > | null>;
  revokeConnection(id: string, reason: 'code_reuse'): Promise<void>;
  issueTokens(input: {
    connectionId: string;
    scopes: string[];
    issuer: string;
    resource: string;
  }): Promise<TokenPair>;
  rotateRefresh(
    token: string,
    expected: { issuer: string; resource: string; clientDbId: string }
  ): Promise<RotateResult>;
  /** Security-relevant events for audit / email. Must not throw. */
  onEvent?(event: TokenEvent): void | Promise<void>;
}

export type TokenEvent =
  | { type: 'code_reuse'; connectionId: string }
  | { type: 'refresh_reuse'; connectionId: string }
  | {
      type: 'tokens_issued';
      connectionId: string;
      grant: 'authorization_code' | 'refresh_token';
    };

function tokenBody(
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  scopes: string[]
) {
  return {
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: formatScopes(scopes),
  };
}

function clientUsable(
  client: OAuthClientRecord | null,
  config: Cfg
): client is OAuthClientRecord {
  if (!client || client.trust === 'blocked') return false;
  return client.trust === 'trusted' || config.allowDevClients;
}

/** Token endpoint (RFC 6749 §3.2) for form-encoded `params`. */
export async function handleTokenRequest(
  params: URLSearchParams,
  config: Cfg,
  deps: TokenDeps
): Promise<OAuthResponse> {
  for (const name of [
    'grant_type',
    'code',
    'refresh_token',
    'client_id',
    'redirect_uri',
    'code_verifier',
    'resource',
  ]) {
    if (params.getAll(name).length > 1)
      return oauthError(400, 'invalid_request', `${name} was repeated`);
  }
  const grantType = params.get('grant_type');
  const clientId = params.get('client_id');
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return oauthError(400, 'unsupported_grant_type');
  }
  if (!clientId)
    return oauthError(401, 'invalid_client', 'client_id is required');
  const client = await deps.findClient(clientId);
  if (!clientUsable(client, config)) return oauthError(401, 'invalid_client');

  const resourceParam = params.get('resource');
  if (
    resourceParam !== null &&
    !resourceMatches(resourceParam, config.mcpUrl)
  ) {
    return oauthError(400, 'invalid_target');
  }

  if (grantType === 'authorization_code') {
    const code = params.get('code');
    if (!looksLikeToken('code', code)) return oauthError(400, 'invalid_grant');
    const row = await deps.findCode(code);
    if (!row) return oauthError(400, 'invalid_grant');

    if (row.used_at) {
      // A code is presented twice: whoever has it, the tokens issued from
      // it can't be trusted any more (RFC 6749 §4.1.2).
      const conn = await deps.getConnection(row.connection_id);
      if (conn && conn.oauth_client_id === client.id && !conn.revoked_at) {
        await deps.revokeConnection(row.connection_id, 'code_reuse');
        await deps.onEvent?.({
          type: 'code_reuse',
          connectionId: row.connection_id,
        });
      }
      return oauthError(400, 'invalid_grant');
    }
    if (Date.parse(row.expires_at) <= Date.now())
      return oauthError(400, 'invalid_grant', 'code expired');
    if (row.oauth_client_id !== client.id)
      return oauthError(400, 'invalid_grant');
    if (
      row.issuer !== config.issuer ||
      !resourceMatches(row.resource, config.mcpUrl)
    ) {
      return oauthError(400, 'invalid_grant');
    }
    if (params.get('redirect_uri') !== row.redirect_uri) {
      return oauthError(400, 'invalid_grant', 'redirect_uri does not match');
    }
    if (!verifyPkce(params.get('code_verifier'), row.code_challenge)) {
      return oauthError(400, 'invalid_grant', 'PKCE verification failed');
    }
    if (!(await deps.claimCode(row.code_hash))) {
      // Lost a race with another redemption of the same code.
      await deps.revokeConnection(row.connection_id, 'code_reuse');
      await deps.onEvent?.({
        type: 'code_reuse',
        connectionId: row.connection_id,
      });
      return oauthError(400, 'invalid_grant');
    }
    const conn = await deps.getConnection(row.connection_id);
    if (!conn || conn.revoked_at)
      return oauthError(400, 'invalid_grant', 'connection revoked');

    const tokens = await deps.issueTokens({
      connectionId: row.connection_id,
      scopes: row.granted_scopes,
      issuer: config.issuer,
      resource: config.mcpUrl,
    });
    await deps.onEvent?.({
      type: 'tokens_issued',
      connectionId: row.connection_id,
      grant: 'authorization_code',
    });
    return {
      status: 200,
      body: tokenBody(tokens, row.granted_scopes),
      headers: { ...NO_STORE_HEADERS },
    };
  }

  // refresh_token
  const refreshToken = params.get('refresh_token');
  if (!looksLikeToken('refresh', refreshToken))
    return oauthError(400, 'invalid_grant');
  const result = await deps.rotateRefresh(refreshToken, {
    issuer: config.issuer,
    resource: config.mcpUrl,
    clientDbId: client.id,
  });
  if (result.state === 'reused') {
    if (result.connection)
      await deps.onEvent?.({
        type: 'refresh_reuse',
        connectionId: result.connection.id,
      });
    return oauthError(400, 'invalid_grant');
  }
  if (result.state !== 'ok') return oauthError(400, 'invalid_grant');
  const ok = result;

  // A `scope` parameter is ignored: a refresh never widens the grant, and
  // the response's `scope` tells the client exactly what it holds. (Failing
  // here would be worse — the old refresh token is already spent.)
  await deps.onEvent?.({
    type: 'tokens_issued',
    connectionId: ok.connection.id,
    grant: 'refresh_token',
  });
  return {
    status: 200,
    body: tokenBody(ok.tokens, ok.scopes),
    headers: { ...NO_STORE_HEADERS },
  };
}

// ------------------------------------------------------------
// Revocation endpoint (RFC 7009)
// ------------------------------------------------------------

/**
 * Revoke by token. Always 200 (even for unknown tokens) so the endpoint
 * can't be used to probe which tokens exist.
 */
export async function handleRevokeRequest(
  params: URLSearchParams,
  revokeByToken: (token: string) => Promise<unknown>
): Promise<OAuthResponse> {
  const token = params.get('token');
  if (!token) return oauthError(400, 'invalid_request', 'token is required');
  if (looksLikeToken('access', token) || looksLikeToken('refresh', token)) {
    await revokeByToken(token);
  }
  return { status: 200, body: {}, headers: { ...NO_STORE_HEADERS } };
}

/** RFC 7591 registration response for a stored client. */
export function registrationResponse(
  client: OAuthClientRecord,
  issuedAt: Date = new Date()
) {
  return {
    client_id: client.client_id,
    client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
    client_name: client.display_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}
