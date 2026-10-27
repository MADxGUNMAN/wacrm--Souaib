// ============================================================
// AI connector — the /mcp auth gate.
//
// Runs BEFORE the MCP SDK sees the request. Answers one question: is
// this bearer token a live Replai connection, and who is it? Anything
// that makes the token itself useless (unknown, expired, revoked, minted
// by the other deployment, connection gone, user moved or deactivated)
// is a 401 with a WWW-Authenticate challenge so the client re-runs
// sign-in. Account-level states that the user can fix (ban,
// subscription, allowlist, workspace policy) pass the gate and are
// refused per tool by evaluateToolAccess with a readable reason.
//
// Plan: docs/ai-connector/01-architecture.md §5, 02-security.md §3.3.
// ============================================================

import type { KeyObject } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAccountRole, type AccountRole } from '@/lib/auth/roles';
import type { ServiceContext } from '@/lib/services/context';
import type { MemberPermissions } from '@/types';
import type { OAuthClientRecord } from './clients';
import { isAccountAllowed, type AiConnectorConfig } from './config';
import { policyForClient } from './consent';
import type { Platform } from './platforms';
import type { AccessInput } from './policy';
import { AI_SCOPES, OFFLINE_ACCESS, isAiScope, type AiScope } from './scopes';
import {
  normalizeConnectionSettings,
  normalizeWorkspacePolicy,
  type ConnectionSettings,
  type WorkspacePolicy,
} from './settings';
import type { AccessTokenRow, ConnectionRow } from './store';
import {
  createUserScopedClient,
  mintUserJwt,
  parseSigningKey,
} from './supabase-jwt';
import { looksLikeToken } from './tokens';

type Cfg = Pick<
  AiConnectorConfig,
  | 'issuer'
  | 'mcpUrl'
  | 'allowDevClients'
  | 'disabledPlatforms'
  | 'allowedAccounts'
  | 'enabled'
>;

// ------------------------------------------------------------
// Challenges
// ------------------------------------------------------------

export function resourceMetadataUrl(
  config: Pick<AiConnectorConfig, 'issuer'>
): string {
  return `${config.issuer}/.well-known/oauth-protected-resource/mcp`;
}

const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`;

/** 401 challenge (RFC 6750 §3 + RFC 9728 §5.1). */
export function unauthorizedChallenge(
  config: Pick<AiConnectorConfig, 'issuer'>,
  error?: { code: 'invalid_token' | 'invalid_request'; description: string }
): string {
  const parts = [
    `resource_metadata=${quote(resourceMetadataUrl(config))}`,
    // Every scope, like the metadata's scopes_supported. Claude requests
    // exactly what this challenge lists, while ChatGPT requests all
    // supported scopes; listing only View + Edit left Claude's Send /
    // Broadcast / Automation switches locked as 'not granted'. The consent
    // screen still lets the user turn each level off, and workspace policy
    // greys out what the owner doesn't allow.
    `scope=${quote([...AI_SCOPES, OFFLINE_ACCESS].join(' '))}`,
  ];
  if (error)
    parts.push(
      `error=${quote(error.code)}`,
      `error_description=${quote(error.description)}`
    );
  return `Bearer ${parts.join(', ')}`;
}

/**
 * Step-up challenge. `scopes` must be EVERY scope the new token should
 * hold (Claude doesn't carry earlier grants forward — Phase 0, S4).
 */
export function insufficientScopeChallenge(
  config: Pick<AiConnectorConfig, 'issuer'>,
  scopes: readonly string[],
  description = 'This action needs one more permission.'
): string {
  return `Bearer ${[
    `error=${quote('insufficient_scope')}`,
    `scope=${quote([...scopes, OFFLINE_ACCESS].join(' '))}`,
    `resource_metadata=${quote(resourceMetadataUrl(config))}`,
    `error_description=${quote(description)}`,
  ].join(', ')}`;
}

// ------------------------------------------------------------
// Origin
// ------------------------------------------------------------

const PLATFORM_ORIGINS = new Set([
  'https://claude.ai',
  'https://chatgpt.com',
  'https://chat.openai.com',
]);

/**
 * Browsers send Origin; server-to-server callers (Claude's and ChatGPT's
 * backends) usually don't. A present Origin must be a known platform,
 * our own site, or (dev only) a loopback page such as MCP Inspector.
 */
export function isAllowedMcpOrigin(
  origin: string | null,
  config: Pick<AiConnectorConfig, 'issuer' | 'allowDevClients'>
): boolean {
  if (origin === null) return true;
  if (origin === config.issuer || PLATFORM_ORIGINS.has(origin)) return true;
  if (!config.allowDevClients) return false;
  try {
    const u = new URL(origin);
    return (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Gate
// ------------------------------------------------------------

export interface GateProfileRow {
  account_id: string | null;
  account_role: string | null;
  permissions: unknown;
  is_active: boolean | null;
  is_super_admin: boolean | null;
  full_name: string | null;
  email: string | null;
}

export interface GateAccountRow {
  id: string;
  name: string | null;
  default_currency: string | null;
  is_banned: boolean | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
}

export interface GateDeps {
  findAccessToken(token: string): Promise<AccessTokenRow | null>;
  loadConnection(id: string): Promise<ConnectionRow | null>;
  loadClient(id: string): Promise<OAuthClientRecord | null>;
  loadProfile(userId: string): Promise<GateProfileRow | null>;
  loadAccount(accountId: string): Promise<GateAccountRow | null>;
  loadPolicy(accountId: string): Promise<Record<string, unknown> | null>;
  loadProfileId(accountId: string, userId: string): Promise<string | null>;
  isSubscriptionBlocked(account: GateAccountRow): Promise<boolean>;
}

export interface GateContext {
  connectionId: string;
  userId: string;
  accountId: string;
  accountName: string;
  currency: string | null;
  userName: string | null;
  userEmail: string | null;
  profileId: string | null;
  platform: Platform;
  client: Pick<OAuthClientRecord, 'id' | 'display_name' | 'platform' | 'trust'>;
  /** Token scopes ∩ connection scopes. */
  scopes: AiScope[];
  settings: ConnectionSettings;
  policy: WorkspacePolicy;
  role: AccountRole;
  memberPermissions: MemberPermissions | null;
  account: AccessInput['account'];
  lastUsedAt: string | null;
}

export type GateResult =
  | { ok: true; ctx: GateContext }
  | { ok: false; status: 401; challenge: string; reason: string };

/** `Bearer <token>` from the Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer[ ]+([^\s]+)[ ]*$/i.exec(header);
  return m ? m[1] : null;
}

export async function runGate(
  request: Pick<Request, 'headers' | 'url'>,
  config: Cfg,
  deps: GateDeps,
  now: Date = new Date()
): Promise<GateResult> {
  const deny = (reason: string, description?: string): GateResult => ({
    ok: false,
    status: 401,
    reason,
    challenge: unauthorizedChallenge(
      config,
      description ? { code: 'invalid_token', description } : undefined
    ),
  });

  // Tokens in the URL are never accepted (they end up in logs).
  const url = new URL(request.url);
  if (url.searchParams.has('access_token')) {
    return {
      ok: false,
      status: 401,
      reason: 'token_in_query',
      challenge: unauthorizedChallenge(config, {
        code: 'invalid_request',
        description: 'Send the token in the Authorization header.',
      }),
    };
  }

  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return deny('missing_token');
  if (!looksLikeToken('access', token))
    return deny('malformed_token', 'The access token is not valid.');

  const row = await deps.findAccessToken(token);
  if (!row) return deny('unknown_token', 'The access token is not valid.');
  if (row.revoked_at)
    return deny('revoked_token', 'The access token was revoked.');
  if (Date.parse(row.expires_at) <= now.getTime())
    return deny('expired_token', 'The access token expired.');
  if (row.issuer !== config.issuer || row.resource !== config.mcpUrl) {
    return deny(
      'wrong_audience',
      'The access token was issued for a different server.'
    );
  }

  const conn = await deps.loadConnection(row.connection_id);
  if (!conn || conn.revoked_at)
    return deny('connection_revoked', 'This connection was disconnected.');
  if (conn.issuer !== config.issuer)
    return deny(
      'wrong_audience',
      'The access token was issued for a different server.'
    );

  const [client, profile, account, policyRow, profileId] = await Promise.all([
    deps.loadClient(conn.oauth_client_id),
    deps.loadProfile(conn.user_id),
    deps.loadAccount(conn.account_id),
    deps.loadPolicy(conn.account_id),
    deps.loadProfileId(conn.account_id, conn.user_id),
  ]);

  if (
    !client ||
    client.trust === 'blocked' ||
    (client.trust === 'dev_only' && !config.allowDevClients)
  ) {
    return deny('client_blocked', 'This app can no longer connect to Replai.');
  }
  // The person must still be an active, regular member of THIS account.
  if (
    !profile ||
    profile.account_id !== conn.account_id ||
    !isAccountRole(profile.account_role) ||
    profile.is_active === false ||
    profile.is_super_admin === true
  ) {
    return deny(
      'membership_changed',
      'Your access to this workspace changed. Connect Replai again.'
    );
  }
  if (!account)
    return deny('account_missing', 'This workspace no longer exists.');
  const subscriptionBlocked = await deps.isSubscriptionBlocked(account);

  const granted = new Set(conn.granted_scopes);
  const scopes = row.scopes.filter(
    (s): s is AiScope => isAiScope(s) && granted.has(s)
  );

  return {
    ok: true,
    ctx: {
      connectionId: conn.id,
      userId: conn.user_id,
      accountId: conn.account_id,
      accountName: account.name ?? '',
      currency: account.default_currency ?? null,
      userName: profile.full_name,
      userEmail: profile.email,
      profileId,
      platform: conn.platform,
      client: {
        id: client.id,
        display_name: client.display_name,
        platform: client.platform,
        trust: client.trust,
      },
      scopes,
      settings: normalizeConnectionSettings(conn.settings),
      policy: policyForClient(
        normalizeWorkspacePolicy(policyRow),
        client,
        config
      ),
      role: profile.account_role,
      memberPermissions:
        (profile.permissions as MemberPermissions | null) ?? null,
      account: {
        connectorEnabled: config.enabled,
        platformEnabled: !config.disabledPlatforms.has(conn.platform),
        allowlisted: isAccountAllowed(
          config as AiConnectorConfig,
          conn.account_id
        ),
        banned: account.is_banned === true,
        subscriptionBlocked,
      },
      lastUsedAt: conn.last_used_at,
    },
  };
}

// ------------------------------------------------------------
// Running as the user
// ------------------------------------------------------------

let cachedKey: { raw: string; key: KeyObject } | null = null;

function signingKey(raw: string): KeyObject {
  if (!cachedKey || cachedKey.raw !== raw)
    cachedKey = { raw, key: parseSigningKey(raw) };
  return cachedKey.key;
}

/**
 * Service context for one request: a Supabase client authenticated with
 * a 5-minute JWT for the user (RLS applies), carrying the `ai_conn`
 * claim the AI-deny policies key on.
 */
export function userServiceContext(
  ctx: GateContext,
  config: Pick<AiConnectorConfig, 'supabaseUrl' | 'jwtPrivateKey' | 'jwtKid'>,
  anonKey: string,
  makeClient: (
    url: string,
    anon: string,
    jwt: string
  ) => SupabaseClient = createUserScopedClient
): ServiceContext {
  const jwt = mintUserJwt({
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    platform: ctx.platform,
    supabaseUrl: config.supabaseUrl,
    privateKey: signingKey(config.jwtPrivateKey),
    kid: config.jwtKid,
  });
  return {
    db: makeClient(config.supabaseUrl, anonKey, jwt),
    userId: ctx.userId,
    accountId: ctx.accountId,
    actor: {
      kind: 'ai',
      connectionId: ctx.connectionId,
      platform: ctx.platform,
    },
  };
}

/** Production deps backed by the service-role client. */
export function gateDeps(
  db: SupabaseClient,
  pepper: Pick<AiConnectorConfig, 'tokenPepper' | 'tokenPepperPrevious'>,
  helpers: {
    findAccessToken: (
      db: SupabaseClient,
      p: typeof pepper,
      t: string
    ) => Promise<AccessTokenRow | null>;
    getConnection: (
      db: SupabaseClient,
      id: string
    ) => Promise<ConnectionRow | null>;
    getClientById: (
      db: SupabaseClient,
      id: string
    ) => Promise<OAuthClientRecord | null>;
    isSubscriptionBlocked: (
      account: Record<string, unknown> | null
    ) => Promise<boolean>;
  }
): GateDeps {
  return {
    findAccessToken: (t) => helpers.findAccessToken(db, pepper, t),
    loadConnection: (id) => helpers.getConnection(db, id),
    loadClient: (id) => helpers.getClientById(db, id),
    async loadProfile(userId) {
      const { data } = await db
        .from('profiles')
        .select(
          'account_id, account_role, permissions, is_active, is_super_admin, full_name, email'
        )
        .eq('user_id', userId)
        .maybeSingle();
      return (data as GateProfileRow | null) ?? null;
    },
    async loadAccount(accountId) {
      const { data } = await db
        .from('accounts')
        .select(
          'id, name, default_currency, is_banned, subscription_status, trial_ends_at, subscription_ends_at'
        )
        .eq('id', accountId)
        .maybeSingle();
      return (data as GateAccountRow | null) ?? null;
    },
    async loadPolicy(accountId) {
      const { data } = await db
        .from('ai_workspace_policies')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      return (data as Record<string, unknown> | null) ?? null;
    },
    async loadProfileId(accountId, userId) {
      const { data } = await db
        .from('ai_connector_profiles')
        .select('profile_id')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .maybeSingle();
      return (data?.profile_id as string | undefined) ?? null;
    },
    isSubscriptionBlocked: (account) =>
      helpers.isSubscriptionBlocked(
        account as unknown as Record<string, unknown>
      ),
  };
}
