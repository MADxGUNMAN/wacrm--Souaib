// ============================================================
// AI connector — database operations (service-role client only).
//
// Every secret is looked up by HMAC hash (tokens.ts). Every state change
// that must happen at most once — consuming an authorization request,
// redeeming a code, rotating a refresh token, using a confirmation — is a
// single conditional UPDATE ... RETURNING, so two concurrent requests can
// never both succeed.
// Plan: docs/ai-connector/01-architecture.md §3, §4, §6.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { ClientStore, OAuthClientRecord } from './clients';
import type { DcrRegistration } from './clients';
import type { AiConnectorConfig } from './config';
import type { Platform } from './platforms';
import type { ConnectionSettings } from './settings';
import {
  TTL,
  addSeconds,
  candidateHashes,
  classifyRefreshToken,
  generateId,
  generateToken,
  hashSecret,
  nextRefreshExpiry,
  type RefreshState,
} from './tokens';

export function adminDb(): SupabaseClient {
  return supabaseAdmin();
}

type Pepper = Pick<AiConnectorConfig, 'tokenPepper' | 'tokenPepperPrevious'>;

const CLIENT_COLUMNS =
  'id, client_id, kind, platform, display_name, redirect_uris, trust';

// ------------------------------------------------------------
// Clients
// ------------------------------------------------------------

export function createClientStore(db: SupabaseClient): ClientStore {
  return {
    async findByClientId(clientId) {
      const { data, error } = await db
        .from('oauth_clients')
        .select(CLIENT_COLUMNS)
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw new Error(`client lookup failed: ${error.message}`);
      return (data as OAuthClientRecord | null) ?? null;
    },
    async saveDevCimdClient(input) {
      const { data, error } = await db
        .from('oauth_clients')
        .upsert(
          {
            client_id: input.client_id,
            kind: 'cimd',
            platform: 'other',
            display_name: input.display_name,
            redirect_uris: input.redirect_uris,
            trust: 'dev_only',
            metadata: input.metadata as object,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'client_id' }
        )
        .select(CLIENT_COLUMNS)
        .single();
      if (error) throw new Error(`client save failed: ${error.message}`);
      return data as OAuthClientRecord;
    },
  };
}

export async function getClientById(
  db: SupabaseClient,
  id: string
): Promise<OAuthClientRecord | null> {
  const { data, error } = await db
    .from('oauth_clients')
    .select(CLIENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`client lookup failed: ${error.message}`);
  return (data as OAuthClientRecord | null) ?? null;
}

export async function saveDcrClient(
  db: SupabaseClient,
  reg: DcrRegistration,
  metadata: unknown
): Promise<OAuthClientRecord> {
  const { data, error } = await db
    .from('oauth_clients')
    .insert({
      client_id: generateId('dcr_', 24),
      kind: 'dcr',
      platform: reg.platform,
      display_name: reg.displayName,
      redirect_uris: reg.redirectUris,
      trust: reg.trust,
      metadata: metadata as object,
    })
    .select(CLIENT_COLUMNS)
    .single();
  if (error) throw new Error(`client registration failed: ${error.message}`);
  return data as OAuthClientRecord;
}

export async function touchClient(
  db: SupabaseClient,
  id: string
): Promise<void> {
  await db
    .from('oauth_clients')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id);
}

// ------------------------------------------------------------
// Authorization requests (between /oauth/authorize and consent)
// ------------------------------------------------------------

export interface AuthorizationRequestRow {
  id: string;
  oauth_client_id: string;
  redirect_uri: string;
  state: string | null;
  code_challenge: string;
  requested_scopes: string[];
  resource: string;
  issuer: string;
  csrf_hash: string;
  user_id: string | null;
  expires_at: string;
  consumed_at: string | null;
}

export async function createAuthorizationRequest(
  db: SupabaseClient,
  pepper: Pepper,
  input: {
    clientDbId: string;
    redirectUri: string;
    state: string | null;
    codeChallenge: string;
    scopes: string[];
    resource: string;
    issuer: string;
  }
): Promise<string> {
  const id = generateId('req_', 24);
  const { error } = await db.from('oauth_authorization_requests').insert({
    id,
    oauth_client_id: input.clientDbId,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    requested_scopes: input.scopes,
    resource: input.resource,
    issuer: input.issuer,
    // Replaced with a real per-render token when the consent page loads.
    csrf_hash: hashSecret(generateId('csrf_', 32), pepper.tokenPepper),
    expires_at: addSeconds(new Date(), TTL.authorizationRequest).toISOString(),
  });
  if (error) throw new Error(`authorization request failed: ${error.message}`);
  return id;
}

/** Live (unexpired, unconsumed) request or null. */
export async function getAuthorizationRequest(
  db: SupabaseClient,
  id: string
): Promise<AuthorizationRequestRow | null> {
  if (!/^req_[A-Za-z0-9_-]{32}$/.test(id)) return null;
  const { data, error } = await db
    .from('oauth_authorization_requests')
    .select('*')
    .eq('id', id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error)
    throw new Error(`authorization request lookup failed: ${error.message}`);
  return (data as AuthorizationRequestRow | null) ?? null;
}

/**
 * Bind the request to the signed-in user and issue a fresh CSRF token for
 * the consent form. Re-rendering (or switching account) replaces both,
 * so only the latest form can be submitted.
 */
export async function bindRequestToUser(
  db: SupabaseClient,
  pepper: Pepper,
  id: string,
  userId: string
): Promise<string> {
  const csrf = generateId('csrf_', 32);
  const { data, error } = await db
    .from('oauth_authorization_requests')
    .update({
      user_id: userId,
      csrf_hash: hashSecret(csrf, pepper.tokenPepper),
    })
    .eq('id', id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id');
  if (error)
    throw new Error(`authorization request update failed: ${error.message}`);
  if (!data?.length) throw new Error('authorization request expired');
  return csrf;
}

/** Mark the request used, exactly once. Null if already consumed or expired. */
export async function consumeAuthorizationRequest(
  db: SupabaseClient,
  id: string,
  userId: string
): Promise<AuthorizationRequestRow | null> {
  const { data, error } = await db
    .from('oauth_authorization_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('*');
  if (error)
    throw new Error(`authorization request consume failed: ${error.message}`);
  return (data?.[0] as AuthorizationRequestRow | undefined) ?? null;
}

// ------------------------------------------------------------
// Connections and profile ids
// ------------------------------------------------------------

export interface ConnectionRow {
  id: string;
  account_id: string;
  user_id: string;
  oauth_client_id: string;
  platform: Platform;
  granted_scopes: string[];
  settings: unknown;
  issuer: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

const CONNECTION_COLUMNS =
  'id, account_id, user_id, oauth_client_id, platform, granted_scopes, settings, issuer, revoked_at, created_at, last_used_at';

export async function getConnection(
  db: SupabaseClient,
  id: string
): Promise<ConnectionRow | null> {
  const { data, error } = await db
    .from('ai_connections')
    .select(CONNECTION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`connection lookup failed: ${error.message}`);
  return (data as ConnectionRow | null) ?? null;
}

/**
 * Create the connection, or update the existing active one for the same
 * user + account + client (reconnect / step-up). Reconnecting keeps the
 * connection id (so Settings and the activity log stay continuous) and
 * revokes every token issued under the previous consent.
 */
export async function upsertConnection(
  db: SupabaseClient,
  input: {
    accountId: string;
    userId: string;
    client: OAuthClientRecord;
    scopes: string[];
    settings: ConnectionSettings;
    issuer: string;
  }
): Promise<{ connection: ConnectionRow; created: boolean }> {
  const { data: existing, error: findErr } = await db
    .from('ai_connections')
    .select(CONNECTION_COLUMNS)
    .eq('account_id', input.accountId)
    .eq('user_id', input.userId)
    .eq('oauth_client_id', input.client.id)
    .is('revoked_at', null)
    .maybeSingle();
  if (findErr) throw new Error(`connection lookup failed: ${findErr.message}`);

  const now = new Date().toISOString();
  if (existing) {
    await revokeTokensForConnection(db, existing.id);
    const { data, error } = await db
      .from('ai_connections')
      .update({
        granted_scopes: input.scopes,
        settings: input.settings,
        issuer: input.issuer,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(CONNECTION_COLUMNS)
      .single();
    if (error) throw new Error(`connection update failed: ${error.message}`);
    return { connection: data as ConnectionRow, created: false };
  }

  const { data, error } = await db
    .from('ai_connections')
    .insert({
      account_id: input.accountId,
      user_id: input.userId,
      oauth_client_id: input.client.id,
      platform: input.client.platform,
      granted_scopes: input.scopes,
      settings: input.settings,
      issuer: input.issuer,
    })
    .select(CONNECTION_COLUMNS)
    .single();
  if (error) throw new Error(`connection create failed: ${error.message}`);
  return { connection: data as ConnectionRow, created: true };
}

/** Stable, opaque id for ChatGPT multi-account. Created once, never reused. */
export async function getOrCreateProfileId(
  db: SupabaseClient,
  accountId: string,
  userId: string
): Promise<string> {
  const { data } = await db
    .from('ai_connector_profiles')
    .select('profile_id')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (data?.profile_id) return data.profile_id as string;
  const profileId = generateId('prf_', 16);
  const { error } = await db
    .from('ai_connector_profiles')
    .upsert(
      { account_id: accountId, user_id: userId, profile_id: profileId },
      { onConflict: 'account_id,user_id', ignoreDuplicates: true }
    );
  if (error) throw new Error(`profile id create failed: ${error.message}`);
  const { data: again } = await db
    .from('ai_connector_profiles')
    .select('profile_id')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .single();
  return (again?.profile_id as string) ?? profileId;
}

export type RevokeReason =
  | 'user'
  | 'owner'
  | 'replaced'
  | 'membership_changed'
  | 'refresh_reuse'
  | 'code_reuse'
  | 'client_revoked'
  | 'idle'
  | 'platform';

export async function revokeTokensForConnection(
  db: SupabaseClient,
  connectionId: string
): Promise<void> {
  const now = new Date().toISOString();
  const [a, r] = await Promise.all([
    db
      .from('oauth_access_tokens')
      .update({ revoked_at: now })
      .eq('connection_id', connectionId)
      .is('revoked_at', null),
    db
      .from('oauth_refresh_tokens')
      .update({ revoked_at: now })
      .eq('connection_id', connectionId)
      .is('revoked_at', null),
  ]);
  if (a.error || r.error) throw new Error('token revocation failed');
}

export async function revokeConnection(
  db: SupabaseClient,
  connectionId: string,
  reason: RevokeReason,
  revokedBy: string | null = null
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from('ai_connections')
    .update({
      revoked_at: now,
      revoke_reason: reason,
      revoked_by: revokedBy,
      updated_at: now,
    })
    .eq('id', connectionId)
    .is('revoked_at', null);
  if (error) throw new Error(`connection revoke failed: ${error.message}`);
  await revokeTokensForConnection(db, connectionId);
}

// ------------------------------------------------------------
// Authorization codes
// ------------------------------------------------------------

export interface CodeRow {
  code_hash: string;
  connection_id: string;
  oauth_client_id: string;
  redirect_uri: string;
  code_challenge: string;
  granted_scopes: string[];
  resource: string;
  issuer: string;
  expires_at: string;
}

export async function issueAuthorizationCode(
  db: SupabaseClient,
  pepper: Pepper,
  input: {
    requestId: string;
    connectionId: string;
    clientDbId: string;
    redirectUri: string;
    codeChallenge: string;
    scopes: string[];
    resource: string;
    issuer: string;
  }
): Promise<string> {
  const code = generateToken('code');
  const { error } = await db.from('oauth_authorization_codes').insert({
    code_hash: hashSecret(code, pepper.tokenPepper),
    request_id: input.requestId,
    connection_id: input.connectionId,
    oauth_client_id: input.clientDbId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    granted_scopes: input.scopes,
    resource: input.resource,
    issuer: input.issuer,
    expires_at: addSeconds(new Date(), TTL.code).toISOString(),
  });
  if (error) throw new Error(`code issue failed: ${error.message}`);
  return code;
}

export interface StoredCodeRow extends CodeRow {
  used_at: string | null;
}

/**
 * Look a code up WITHOUT using it, so the token endpoint can check client,
 * redirect URI and PKCE first: a stolen code presented without the
 * verifier is rejected and does not burn the legitimate client's code.
 */
export async function findAuthorizationCode(
  db: SupabaseClient,
  pepper: Pepper,
  code: string
): Promise<StoredCodeRow | null> {
  const hashes = candidateHashes(
    code,
    pepper.tokenPepper,
    pepper.tokenPepperPrevious
  );
  const { data, error } = await db
    .from('oauth_authorization_codes')
    .select('*')
    .in('code_hash', hashes)
    .limit(1);
  if (error) throw new Error(`code lookup failed: ${error.message}`);
  return (data?.[0] as StoredCodeRow | undefined) ?? null;
}

/** Mark a code used, exactly once. False if it was used (or expired) meanwhile. */
export async function claimAuthorizationCode(
  db: SupabaseClient,
  codeHash: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('oauth_authorization_codes')
    .update({ used_at: now })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('code_hash');
  if (error) throw new Error(`code claim failed: ${error.message}`);
  return Boolean(data?.length);
}

// ------------------------------------------------------------
// Access and refresh tokens
// ------------------------------------------------------------

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueTokenPair(
  db: SupabaseClient,
  pepper: Pepper,
  input: {
    connectionId: string;
    scopes: string[];
    issuer: string;
    resource: string;
    familyId?: string;
    absoluteExpiresAt?: Date;
  }
): Promise<TokenPair & { refreshHash: string }> {
  const now = new Date();
  const accessToken = generateToken('access');
  const refreshToken = generateToken('refresh');
  const absolute =
    input.absoluteExpiresAt ?? addSeconds(now, TTL.refreshAbsolute);
  const refreshHash = hashSecret(refreshToken, pepper.tokenPepper);

  const [a, r] = await Promise.all([
    db.from('oauth_access_tokens').insert({
      token_hash: hashSecret(accessToken, pepper.tokenPepper),
      connection_id: input.connectionId,
      scopes: input.scopes,
      issuer: input.issuer,
      resource: input.resource,
      expires_at: addSeconds(now, TTL.access).toISOString(),
    }),
    db.from('oauth_refresh_tokens').insert({
      token_hash: refreshHash,
      connection_id: input.connectionId,
      family_id: input.familyId ?? randomUUID(),
      scopes: input.scopes,
      issuer: input.issuer,
      resource: input.resource,
      expires_at: nextRefreshExpiry(absolute, now).toISOString(),
      absolute_expires_at: absolute.toISOString(),
    }),
  ]);
  if (a.error || r.error) throw new Error('token issue failed');
  return { accessToken, refreshToken, expiresIn: TTL.access, refreshHash };
}

interface RefreshRowFull {
  token_hash: string;
  connection_id: string;
  family_id: string;
  scopes: string[];
  issuer: string;
  resource: string;
  expires_at: string;
  absolute_expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export type RotateResult =
  | {
      state: 'ok';
      tokens: TokenPair;
      connection: ConnectionRow;
      scopes: string[];
    }
  | { state: 'reused'; connection: ConnectionRow | null }
  | {
      state:
        | Exclude<RefreshState, 'valid' | 'reused'>
        | 'connection_revoked'
        | 'wrong_client';
    };

/**
 * Rotate a refresh token: classify, check it belongs to the presenting
 * client, atomically mark it used, issue a new pair in the same family.
 * Reuse of an already-used token revokes the whole connection (the
 * caller audits and emails).
 */
export async function rotateRefreshToken(
  db: SupabaseClient,
  pepper: Pepper,
  token: string,
  expected: { issuer: string; resource: string; clientDbId: string }
): Promise<RotateResult> {
  const hashes = candidateHashes(
    token,
    pepper.tokenPepper,
    pepper.tokenPepperPrevious
  );
  const { data: rows, error } = await db
    .from('oauth_refresh_tokens')
    .select('*')
    .in('token_hash', hashes)
    .limit(1);
  if (error) throw new Error(`refresh lookup failed: ${error.message}`);
  const row = (rows?.[0] as RefreshRowFull | undefined) ?? null;
  if (!row) return { state: 'unknown' };

  const connection = await getConnection(db, row.connection_id);
  // A token is only ever usable by the client it was issued to. Checked
  // before anything else so another client can't trigger family revocation.
  if (!connection || connection.oauth_client_id !== expected.clientDbId)
    return { state: 'wrong_client' };

  const state = classifyRefreshToken(row, expected);
  if (state === 'reused') {
    if (!connection.revoked_at)
      await revokeConnection(db, row.connection_id, 'refresh_reuse');
    return { state: 'reused', connection };
  }
  if (state !== 'valid') return { state };
  if (connection.revoked_at) return { state: 'connection_revoked' };

  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('oauth_refresh_tokens')
    .update({ used_at: now })
    .eq('token_hash', row.token_hash)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('token_hash');
  if (claimErr) throw new Error(`refresh claim failed: ${claimErr.message}`);
  if (!claimed?.length) {
    // Lost a race with another use of the same token: treat as reuse.
    await revokeConnection(db, row.connection_id, 'refresh_reuse');
    return { state: 'reused', connection };
  }

  const tokens = await issueTokenPair(db, pepper, {
    connectionId: row.connection_id,
    scopes: row.scopes,
    issuer: row.issuer,
    resource: row.resource,
    familyId: row.family_id,
    absoluteExpiresAt: new Date(row.absolute_expires_at),
  });
  await db
    .from('oauth_refresh_tokens')
    .update({ replaced_by: tokens.refreshHash })
    .eq('token_hash', row.token_hash);
  return {
    state: 'ok',
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    },
    connection,
    scopes: row.scopes,
  };
}

export interface AccessTokenRow {
  connection_id: string;
  scopes: string[];
  issuer: string;
  resource: string;
  expires_at: string;
  revoked_at: string | null;
}

/** For the /mcp gate (Phase 3). */
export async function findAccessToken(
  db: SupabaseClient,
  pepper: Pepper,
  token: string
): Promise<AccessTokenRow | null> {
  const hashes = candidateHashes(
    token,
    pepper.tokenPepper,
    pepper.tokenPepperPrevious
  );
  const { data, error } = await db
    .from('oauth_access_tokens')
    .select('connection_id, scopes, issuer, resource, expires_at, revoked_at')
    .in('token_hash', hashes)
    .limit(1);
  if (error) throw new Error(`access token lookup failed: ${error.message}`);
  return (data?.[0] as AccessTokenRow | undefined) ?? null;
}

/**
 * RFC 7009: revoke by token. A platform revoking its token means the user
 * disconnected there, so the whole connection is revoked. Unknown tokens
 * are ignored (the endpoint answers 200 either way).
 */
export async function revokeByToken(
  db: SupabaseClient,
  pepper: Pepper,
  token: string
): Promise<string | null> {
  const hashes = candidateHashes(
    token,
    pepper.tokenPepper,
    pepper.tokenPepperPrevious
  );
  for (const table of [
    'oauth_refresh_tokens',
    'oauth_access_tokens',
  ] as const) {
    const { data } = await db
      .from(table)
      .select('connection_id')
      .in('token_hash', hashes)
      .limit(1);
    const connectionId = (data?.[0] as { connection_id: string } | undefined)
      ?.connection_id;
    if (connectionId) {
      await revokeConnection(db, connectionId, 'client_revoked');
      return connectionId;
    }
  }
  return null;
}

// ------------------------------------------------------------
// Housekeeping
// ------------------------------------------------------------

/** Delete expired OAuth artifacts and old audit rows. Returns counts. */
export async function cleanupExpired(
  db: SupabaseClient,
  now: Date = new Date()
): Promise<Record<string, number>> {
  const dayAgo = addSeconds(now, -24 * 3600).toISOString();
  const weekAgo = addSeconds(now, -7 * 24 * 3600).toISOString();
  const auditCutoff = addSeconds(now, -90 * 24 * 3600).toISOString();
  const out: Record<string, number> = {};
  const run = async (
    key: string,
    table: string,
    column: string,
    before: string
  ) => {
    const { count, error } = await db
      .from(table)
      .delete({ count: 'exact' })
      .lt(column, before);
    out[key] = error ? -1 : (count ?? 0);
  };
  await run('requests', 'oauth_authorization_requests', 'expires_at', dayAgo);
  await run('codes', 'oauth_authorization_codes', 'expires_at', dayAgo);
  await run('access_tokens', 'oauth_access_tokens', 'expires_at', weekAgo);
  await run('refresh_tokens', 'oauth_refresh_tokens', 'expires_at', weekAgo);
  await run('confirmations', 'ai_confirmations', 'expires_at', dayAgo);
  await run('audit', 'ai_audit_log', 'created_at', auditCutoff);
  return out;
}
