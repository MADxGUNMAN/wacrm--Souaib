// ============================================================
// AI connector — consent: who is connecting, what may be granted, and
// what the user chose.
//
// The consent page and the decision endpoint both call
// `loadConsentContext`, so the server re-derives everything at decision
// time and never trusts what the page rendered. Tier availability reuses
// `evaluateToolAccess` (the same function that gates tool calls), so the
// consent screen can never offer something the gate would refuse for
// policy or role reasons.
// Plan: docs/ai-connector/04-permissions-and-crm-ui.md §3.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAccountRole, type AccountRole } from '@/lib/auth/roles';
import { getCachedGateConfig } from '@/lib/subscription/gate-cache';
import { resolveSubscriptionState } from '@/lib/subscription/status';
import type { MemberPermissions } from '@/types';
import type { OAuthClientRecord } from './clients';
import { isAccountAllowed, type AiConnectorConfig } from './config';
import type { Platform } from './platforms';
import { evaluateToolAccess, type AccessInput, type DenyCode } from './policy';
import {
  AI_SCOPES,
  SCOPE_INFO,
  isAiScope,
  type AiScope,
  type ConsentTier,
} from './scopes';
import {
  DEFAULT_CONNECTION_SETTINGS,
  normalizeWorkspacePolicy,
  type ConnectionSettings,
  type WorkspacePolicy,
} from './settings';
import { TOOL_NAMES, getToolSpec } from './tool-catalog';
import {
  getClientById,
  type AuthorizationRequestRow,
  type ConnectionRow,
} from './store';

/** Tiers the user can switch on or off. View is always granted. */
export const OPTIONAL_TIERS = [
  'edit',
  'send',
  'broadcast',
  'automations',
] as const;
export type OptionalTier = (typeof OPTIONAL_TIERS)[number];

export function isOptionalTier(v: unknown): v is OptionalTier {
  return (
    typeof v === 'string' && (OPTIONAL_TIERS as readonly string[]).includes(v)
  );
}

/** Why the whole connection can't be made (shown instead of the form). */
export type ConsentBlock =
  | 'unavailable'
  | 'expired'
  | 'no_account'
  | 'super_admin'
  | 'inactive'
  | 'account_not_allowed'
  | 'account_banned'
  | 'subscription_required'
  | 'ai_locked'
  | 'policy_disabled'
  | 'policy_platform'
  | 'policy_members'
  | 'platform_disabled';

export interface TierOption {
  tier: OptionalTier;
  scopes: AiScope[];
  available: boolean;
  /** Why not available (translated on the consent screen). */
  reasonCode: DenyCode | null;
}

export interface AccessSubject {
  role: AccountRole;
  memberPermissions: MemberPermissions | null;
  policy: WorkspacePolicy;
  platform: Platform;
  account: AccessInput['account'];
}

/**
 * Scopes grouped by consent tier, limited to what was requested.
 * `profile` and every requested view scope are always granted.
 */
export function splitRequestedScopes(requested: readonly string[]): {
  always: AiScope[];
  byTier: Partial<Record<OptionalTier, AiScope[]>>;
} {
  const req = new Set(requested.filter(isAiScope));
  req.add('profile');
  const always: AiScope[] = [];
  const byTier: Partial<Record<OptionalTier, AiScope[]>> = {};
  for (const scope of AI_SCOPES) {
    if (!req.has(scope)) continue;
    const tier: ConsentTier = SCOPE_INFO[scope].tier;
    if (tier === 'always' || tier === 'view') always.push(scope);
    else (byTier[tier] ??= []).push(scope);
  }
  return { always, byTier };
}

/**
 * Whether a scope is usable at all under policy + role: true when at
 * least one tool needing it would pass layers 1–3 (account, policy,
 * role). Connection settings and scopes are not considered here.
 */
export function scopeAvailability(
  scope: AiScope,
  subject: AccessSubject
): { available: boolean; reasonCode: DenyCode | null } {
  let reasonCode: DenyCode | null = null;
  for (const tool of TOOL_NAMES) {
    if (getToolSpec(tool).scope !== scope) continue;
    const d = evaluateToolAccess({
      tool,
      grantedScopes: AI_SCOPES,
      settings: {
        ...DEFAULT_CONNECTION_SETTINGS,
        read_only: false,
        groups: {
          edit_records: true,
          send_messages: true,
          send_to_new_numbers: true,
          broadcasts: true,
          automations: true,
        },
      },
      policy: subject.policy,
      role: subject.role,
      memberPermissions: subject.memberPermissions,
      platform: subject.platform,
      account: subject.account,
    });
    if (d.allowed) return { available: true, reasonCode: null };
    reasonCode ??= d.code;
  }
  return { available: false, reasonCode };
}

export function buildTierOptions(
  requested: readonly string[],
  subject: AccessSubject
): TierOption[] {
  const { byTier } = splitRequestedScopes(requested);
  const out: TierOption[] = [];
  for (const tier of OPTIONAL_TIERS) {
    const scopes = byTier[tier];
    if (!scopes?.length) continue;
    const results = scopes.map((s) => scopeAvailability(s, subject));
    const available = results.some((r) => r.available);
    out.push({
      tier,
      scopes,
      available,
      reasonCode: available
        ? null
        : (results.find((r) => r.reasonCode)?.reasonCode ?? null),
    });
  }
  return out;
}

/**
 * Final granted scopes: always-on scopes + the scopes of tiers the user
 * left on AND that are available. Anything the client didn't request is
 * never added, whatever the form posts.
 */
export function grantedScopesFor(
  requested: readonly string[],
  chosen: readonly string[],
  options: readonly TierOption[]
): AiScope[] {
  const { always } = splitRequestedScopes(requested);
  const set = new Set<AiScope>(always);
  const picked = new Set(chosen.filter(isOptionalTier));
  for (const opt of options) {
    if (opt.available && picked.has(opt.tier))
      for (const s of opt.scopes) set.add(s);
  }
  return AI_SCOPES.filter((s) => set.has(s));
}

const TIER_GROUP: Record<OptionalTier, keyof ConnectionSettings['groups']> = {
  edit: 'edit_records',
  send: 'send_messages',
  broadcast: 'broadcasts',
  automations: 'automations',
};

/**
 * Connection settings after consent. Group switches follow the granted
 * tiers; the user's own caps, idle window and "send to new numbers"
 * choice survive a reconnect.
 */
export function settingsAfterConsent(
  existing: ConnectionSettings | null,
  granted: readonly string[]
): ConnectionSettings {
  const base = existing ?? DEFAULT_CONNECTION_SETTINGS;
  const has = (tier: OptionalTier) =>
    granted.some((s) => isAiScope(s) && SCOPE_INFO[s].tier === tier);
  const groups = { ...base.groups };
  for (const tier of OPTIONAL_TIERS) groups[TIER_GROUP[tier]] = has(tier);
  const anyWrite = OPTIONAL_TIERS.some(has);
  return {
    ...base,
    read_only: !anyWrite,
    groups,
    caps: { ...base.caps },
  };
}

/**
 * The workspace policy as it applies to `client`. The owner's platform
 * allowlist only lists real platforms (Claude, ChatGPT, …). Development
 * clients (MCP Inspector, test scripts) exist only while
 * AI_CONNECTOR_ALLOW_DEV_CLIENTS is on, and that flag is the switch for
 * them: they are not additionally blocked by the platform list. In
 * production the flag is off and such clients can't get this far.
 */
export function policyForClient(
  policy: WorkspacePolicy,
  client: Pick<OAuthClientRecord, 'platform' | 'trust'>,
  config: Pick<AiConnectorConfig, 'allowDevClients'>
): WorkspacePolicy {
  if (
    client.trust === 'dev_only' &&
    config.allowDevClients &&
    !policy.allowed_platforms.includes(client.platform)
  ) {
    return {
      ...policy,
      allowed_platforms: [...policy.allowed_platforms, client.platform],
    };
  }
  return policy;
}

// ------------------------------------------------------------
// Loading the live context
// ------------------------------------------------------------

export interface ConsentContext {
  client: OAuthClientRecord;
  userId: string;
  accountId: string;
  accountName: string;
  userEmail: string | null;
  userName: string | null;
  subject: AccessSubject;
  options: TierOption[];
  alwaysScopes: AiScope[];
  existing: ConnectionRow | null;
}

const ACCOUNT_BLOCK_CODES = new Set<ConsentBlock>([
  'account_not_allowed',
  'account_banned',
  'subscription_required',
  'ai_locked',
  'policy_disabled',
  'policy_platform',
  'policy_members',
  'platform_disabled',
]);

/**
 * Everything the consent screen (and the decision) needs, loaded fresh
 * with the service-role client. Returns a block reason when the user
 * can't connect this app at all.
 */
export async function loadConsentContext(
  db: SupabaseClient,
  config: AiConnectorConfig,
  request: AuthorizationRequestRow,
  userId: string
): Promise<
  { ok: true; ctx: ConsentContext } | { ok: false; block: ConsentBlock }
> {
  if (!config.enabled) return { ok: false, block: 'unavailable' };

  const client = await getClientById(db, request.oauth_client_id);
  if (
    !client ||
    client.trust === 'blocked' ||
    (client.trust === 'dev_only' && !config.allowDevClients)
  ) {
    return { ok: false, block: 'expired' };
  }

  const { data: profile } = await db
    .from('profiles')
    .select(
      'account_id, account_role, permissions, is_active, is_super_admin, full_name, email'
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.account_id || !isAccountRole(profile.account_role))
    return { ok: false, block: 'no_account' };
  if (profile.is_super_admin) return { ok: false, block: 'super_admin' };
  if (profile.is_active === false) return { ok: false, block: 'inactive' };

  const accountId = profile.account_id as string;
  const [{ data: account }, { data: policyRow }, gate] = await Promise.all([
    db
      .from('accounts')
      .select(
        'id, name, is_banned, subscription_status, trial_ends_at, subscription_ends_at'
      )
      .eq('id', accountId)
      .maybeSingle(),
    db
      .from('ai_workspace_policies')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle(),
    getCachedGateConfig(),
  ]);
  if (!account) return { ok: false, block: 'no_account' };

  const subject: AccessSubject = {
    role: profile.account_role,
    memberPermissions:
      (profile.permissions as MemberPermissions | null) ?? null,
    policy: policyForClient(
      normalizeWorkspacePolicy(policyRow as Record<string, unknown> | null),
      client,
      config
    ),
    platform: client.platform,
    account: {
      connectorEnabled: config.enabled,
      platformEnabled: !config.disabledPlatforms.has(client.platform),
      allowlisted: isAccountAllowed(config, accountId),
      banned: account.is_banned === true,
      subscriptionBlocked: resolveSubscriptionState(account, gate).isBlocked,
    },
  };

  // Layers 1–2 for the always-on `profile` tool decide whether this app
  // can be connected at all.
  const base = evaluateToolAccess({
    tool: 'get_profile',
    grantedScopes: AI_SCOPES,
    settings: DEFAULT_CONNECTION_SETTINGS,
    ...subject,
    memberPermissions: subject.memberPermissions,
  });
  if (!base.allowed) {
    const code = base.code as ConsentBlock;
    return {
      ok: false,
      block: ACCOUNT_BLOCK_CODES.has(code) ? code : 'unavailable',
    };
  }

  const { data: existing } = await db
    .from('ai_connections')
    .select(
      'id, account_id, user_id, oauth_client_id, platform, granted_scopes, settings, issuer, revoked_at, created_at, last_used_at'
    )
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .eq('oauth_client_id', client.id)
    .is('revoked_at', null)
    .maybeSingle();

  return {
    ok: true,
    ctx: {
      client,
      userId,
      accountId,
      accountName: (account.name as string) ?? '',
      userEmail: (profile.email as string | null) ?? null,
      userName: (profile.full_name as string | null) ?? null,
      subject,
      options: buildTierOptions(request.requested_scopes, subject),
      alwaysScopes: splitRequestedScopes(request.requested_scopes).always,
      existing: (existing as ConnectionRow | null) ?? null,
    },
  };
}
