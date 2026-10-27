// ============================================================
// AI connector — management from inside Replai (Settings → AI
// Connectors) and from the platform's super admin.
//
// Pure rules first (what a user may switch on for a connection, how a
// policy update is validated), then the database functions the
// /api/ai-connectors routes call. All writes go through the service-role
// client AFTER the route has checked who is asking: ai_connections and
// ai_workspace_policies have no write grants for `authenticated`.
//
// Who may do what:
//   * a member manages their OWN connections;
//   * the workspace owner manages every connection in the workspace and
//     the workspace policy;
//   * only a super admin sets `locked_by_platform`.
// Plan: docs/ai-connector/04-permissions-and-crm-ui.md §4.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountRole } from '@/lib/auth/roles';
import {
  DEFAULT_ALLOWED_PLATFORMS,
  isPlatform,
  type Platform,
} from './platforms';
import { SCOPE_INFO, isAiScope, type ConsentTier } from './scopes';
import {
  CONNECTION_CAP_LIMITS,
  normalizeConnectionSettings,
  normalizeWorkspacePolicy,
  tierRank,
  type ConnectionSettings,
  type WorkspacePolicy,
} from './settings';

// ------------------------------------------------------------
// Connection settings: what may be switched on
// ------------------------------------------------------------

export type SettingsGroup = keyof ConnectionSettings['groups'];

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  'edit_records',
  'send_messages',
  'send_to_new_numbers',
  'broadcasts',
  'automations',
];

const GROUP_TIER: Record<
  SettingsGroup,
  Exclude<ConsentTier, 'always' | 'view'>
> = {
  edit_records: 'edit',
  send_messages: 'send',
  send_to_new_numbers: 'send',
  broadcasts: 'broadcast',
  automations: 'automations',
};

/** Why a switch can't be turned on (null = it can). */
export type GroupBlock = 'not_granted' | 'policy' | 'member_limit' | null;

export interface GroupAvailability {
  group: SettingsGroup;
  available: boolean;
  block: GroupBlock;
}

/** Consent tiers held by a set of granted scopes. */
export function grantedTiers(scopes: readonly string[]): Set<ConsentTier> {
  const out = new Set<ConsentTier>();
  for (const s of scopes) if (isAiScope(s)) out.add(SCOPE_INFO[s].tier);
  return out;
}

/**
 * Whether each connection switch may be ON: the app must have been
 * granted that tier at consent, the workspace policy must allow it, and
 * (for members) it must be within the workspace's member limit. These are
 * the same rules evaluateToolAccess applies at call time; showing them
 * here keeps the UI from offering a switch that would do nothing.
 */
export function groupAvailability(
  scopes: readonly string[],
  policy: WorkspacePolicy,
  role: AccountRole
): GroupAvailability[] {
  const tiers = grantedTiers(scopes);
  return SETTINGS_GROUPS.map((group) => {
    const tier = GROUP_TIER[group];
    let block: GroupBlock = null;
    if (!tiers.has(tier)) block = 'not_granted';
    else if (
      (tier === 'send' && !policy.allow_messaging) ||
      (tier === 'broadcast' && !policy.allow_broadcasts) ||
      (tier === 'automations' && !policy.allow_automation_changes)
    )
      block = 'policy';
    else if (role !== 'owner') {
      const capability = tier === 'edit' ? 'edit' : 'send';
      if (
        !policy.members_allowed ||
        tierRank(capability) > tierRank(policy.max_member_tier)
      ) {
        block = 'member_limit';
      }
    }
    return { group, available: block === null, block };
  });
}

export interface SettingsPatch {
  read_only?: boolean;
  groups?: Partial<Record<SettingsGroup, boolean>>;
  messages_per_day?: number;
  idle_days?: number;
}

/** Max daily messages a connection may be set to under `policy`. */
export function connectionMessageCapLimit(policy: WorkspacePolicy): number {
  return Math.min(
    CONNECTION_CAP_LIMITS.messagesPerDayMax,
    policy.daily_message_cap
  );
}

/**
 * Apply a user's change from the Settings page. Turning anything OFF is
 * always allowed; turning a switch ON only when groupAvailability says it
 * can be; caps are clamped to the workspace limit. Returns the fields
 * that were adjusted so the UI can say why.
 */
export function applySettingsPatch(
  current: ConnectionSettings,
  patch: SettingsPatch,
  ctx: { scopes: readonly string[]; policy: WorkspacePolicy; role: AccountRole }
): { next: ConnectionSettings; adjusted: string[] } {
  const next: ConnectionSettings = {
    ...current,
    groups: { ...current.groups },
    caps: { ...current.caps },
  };
  const adjusted: string[] = [];
  const availability = new Map(
    groupAvailability(ctx.scopes, ctx.policy, ctx.role).map((a) => [a.group, a])
  );

  if (typeof patch.read_only === 'boolean') next.read_only = patch.read_only;

  for (const group of SETTINGS_GROUPS) {
    const value = patch.groups?.[group];
    if (typeof value !== 'boolean') continue;
    if (!value || availability.get(group)?.available)
      next.groups[group] = value;
    else adjusted.push(`groups.${group}`);
  }

  if (patch.messages_per_day !== undefined) {
    const max = connectionMessageCapLimit(ctx.policy);
    const v = Number.isInteger(patch.messages_per_day)
      ? patch.messages_per_day
      : NaN;
    if (Number.isNaN(v) || v < 0) adjusted.push('messages_per_day');
    else {
      next.caps.messages_per_day = Math.min(v, max);
      if (v > max) adjusted.push('messages_per_day');
    }
  }

  if (patch.idle_days !== undefined) {
    const { idleDaysMin: lo, idleDaysMax: hi } = CONNECTION_CAP_LIMITS;
    const v = Number.isInteger(patch.idle_days) ? patch.idle_days : NaN;
    if (Number.isNaN(v)) adjusted.push('idle_days');
    else {
      next.idle_days = Math.min(hi, Math.max(lo, v));
      if (v !== next.idle_days) adjusted.push('idle_days');
    }
  }

  return { next, adjusted };
}

/** Parse a PATCH body into a label + settings patch, ignoring junk. */
export function parseConnectionPatch(body: unknown): {
  label?: string | null;
  settings: SettingsPatch;
} | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const out: { label?: string | null; settings: SettingsPatch } = {
    settings: {},
  };
  if (b.label === null) out.label = null;
  else if (typeof b.label === 'string')
    out.label = b.label.trim().slice(0, 80) || null;

  const s =
    b.settings && typeof b.settings === 'object'
      ? (b.settings as Record<string, unknown>)
      : {};
  if (typeof s.read_only === 'boolean') out.settings.read_only = s.read_only;
  if (typeof s.messages_per_day === 'number')
    out.settings.messages_per_day = s.messages_per_day;
  if (typeof s.idle_days === 'number') out.settings.idle_days = s.idle_days;
  if (s.groups && typeof s.groups === 'object') {
    const g = s.groups as Record<string, unknown>;
    const groups: Partial<Record<SettingsGroup, boolean>> = {};
    for (const key of SETTINGS_GROUPS)
      if (typeof g[key] === 'boolean') groups[key] = g[key] as boolean;
    out.settings.groups = groups;
  }
  return out;
}

// ------------------------------------------------------------
// Workspace policy (owner)
// ------------------------------------------------------------

/** Platforms an owner can allow. Development clients are not listed. */
export const POLICY_PLATFORMS: readonly Platform[] = DEFAULT_ALLOWED_PLATFORMS;

const POLICY_FIELDS = [
  'enabled',
  'members_allowed',
  'allow_messaging',
  'allow_broadcasts',
  'allow_automation_changes',
  'require_preview_for_sends',
] as const;

/**
 * Merge an owner's update onto the current policy. `locked_by_platform`
 * is never taken from the request; invalid values keep the current one.
 */
export function mergePolicyUpdate(
  current: WorkspacePolicy,
  body: unknown
): WorkspacePolicy {
  const b =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const row: Record<string, unknown> = { ...current };
  for (const key of POLICY_FIELDS)
    if (typeof b[key] === 'boolean') row[key] = b[key];
  if (
    b.max_member_tier === 'view' ||
    b.max_member_tier === 'edit' ||
    b.max_member_tier === 'send'
  ) {
    row.max_member_tier = b.max_member_tier;
  }
  for (const key of [
    'daily_message_cap',
    'daily_broadcast_recipient_cap',
  ] as const) {
    const v = b[key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) row[key] = v;
  }
  if (Array.isArray(b.allowed_platforms)) {
    const requested = new Set(b.allowed_platforms.filter(isPlatform));
    // Development platforms already present (rare) are kept as they are.
    const kept = current.allowed_platforms.filter(
      (p) => !POLICY_PLATFORMS.includes(p)
    );
    row.allowed_platforms = [
      ...POLICY_PLATFORMS.filter((p) => requested.has(p)),
      ...kept,
    ];
  }
  row.locked_by_platform = current.locked_by_platform;
  return normalizeWorkspacePolicy(row);
}

/** Columns written for a policy row (no lock fields — owner can't set them). */
export function policyRowForSave(policy: WorkspacePolicy) {
  return {
    enabled: policy.enabled,
    allowed_platforms: policy.allowed_platforms,
    members_allowed: policy.members_allowed,
    max_member_tier: policy.max_member_tier,
    allow_messaging: policy.allow_messaging,
    allow_broadcasts: policy.allow_broadcasts,
    allow_automation_changes: policy.allow_automation_changes,
    daily_message_cap: policy.daily_message_cap,
    daily_broadcast_recipient_cap: policy.daily_broadcast_recipient_cap,
    require_preview_for_sends: policy.require_preview_for_sends,
  };
}

// ------------------------------------------------------------
// Views returned to the browser
// ------------------------------------------------------------

export interface Viewer {
  accountId: string;
  userId: string;
  role: AccountRole;
}

export interface ConnectionView {
  id: string;
  platform: Platform;
  app_name: string;
  label: string | null;
  scopes: string[];
  tiers: ConsentTier[];
  settings: ConnectionSettings;
  availability: GroupAvailability[];
  message_cap_limit: number;
  created_at: string;
  last_used_at: string | null;
  is_mine: boolean;
  user: { id: string; name: string | null; email: string | null };
}

export interface ActivityView {
  id: string;
  created_at: string;
  connection_id: string | null;
  platform: string | null;
  app_name: string | null;
  user_name: string | null;
  action: string;
  outcome: string;
  deny_reason: string | null;
  summary: string | null;
  duration_ms: number | null;
}

interface ConnectionDbRow {
  id: string;
  account_id: string;
  user_id: string;
  oauth_client_id: string;
  platform: string;
  granted_scopes: string[];
  settings: unknown;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

const CONNECTION_SELECT =
  'id, account_id, user_id, oauth_client_id, platform, granted_scopes, settings, label, created_at, last_used_at';

const TIER_ORDER: ConsentTier[] = [
  'always',
  'view',
  'edit',
  'send',
  'broadcast',
  'automations',
];

/** True when `viewer` may manage a connection owned by `ownerUserId` in `accountId`. */
export function canManage(
  viewer: Viewer,
  row: { account_id: string; user_id: string }
): boolean {
  return (
    row.account_id === viewer.accountId &&
    (row.user_id === viewer.userId || viewer.role === 'owner')
  );
}

async function lookupNames(
  db: SupabaseClient,
  clientIds: string[],
  userIds: string[]
) {
  const [clients, people] = await Promise.all([
    clientIds.length
      ? db.from('oauth_clients').select('id, display_name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    userIds.length
      ? db
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds)
      : Promise.resolve({
          data: [] as {
            user_id: string;
            full_name: string | null;
            email: string | null;
          }[],
        }),
  ]);
  return {
    clients: new Map(
      (clients.data ?? []).map((c) => [
        c.id as string,
        c.display_name as string,
      ])
    ),
    people: new Map(
      (people.data ?? []).map((p) => [
        p.user_id as string,
        {
          name: (p.full_name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
        },
      ])
    ),
  };
}

/** Policy row for an account (defaults when absent). */
export async function loadPolicy(
  db: SupabaseClient,
  accountId: string
): Promise<WorkspacePolicy> {
  const { data } = await db
    .from('ai_workspace_policies')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  return normalizeWorkspacePolicy(
    (data as Record<string, unknown> | null) ?? null
  );
}

async function rolesFor(
  db: SupabaseClient,
  userIds: string[]
): Promise<Map<string, AccountRole>> {
  if (!userIds.length) return new Map();
  const { data } = await db
    .from('profiles')
    .select('user_id, account_role')
    .in('user_id', userIds);
  return new Map(
    (data ?? []).map((r) => [
      r.user_id as string,
      r.account_role === 'owner' ? 'owner' : ('member' as AccountRole),
    ])
  );
}

/**
 * Active connections the viewer may see: their own, plus (owner) every
 * teammate's. Newest first.
 */
export async function listConnections(
  db: SupabaseClient,
  viewer: Viewer,
  policy?: WorkspacePolicy
): Promise<ConnectionView[]> {
  let query = db
    .from('ai_connections')
    .select(CONNECTION_SELECT)
    .eq('account_id', viewer.accountId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (viewer.role !== 'owner') query = query.eq('user_id', viewer.userId);
  const { data, error } = await query;
  if (error) throw new Error(`connections lookup failed: ${error.message}`);
  const rows = (data ?? []) as ConnectionDbRow[];
  if (!rows.length) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [names, roles, pol] = await Promise.all([
    lookupNames(db, [...new Set(rows.map((r) => r.oauth_client_id))], userIds),
    rolesFor(db, userIds),
    policy ? Promise.resolve(policy) : loadPolicy(db, viewer.accountId),
  ]);
  return rows.map((r) =>
    toView(r, viewer, names, roles.get(r.user_id) ?? 'member', pol)
  );
}

function toView(
  r: ConnectionDbRow,
  viewer: Viewer,
  names: Awaited<ReturnType<typeof lookupNames>>,
  role: AccountRole,
  policy: WorkspacePolicy
): ConnectionView {
  const tiers = grantedTiers(r.granted_scopes);
  const person = names.people.get(r.user_id) ?? { name: null, email: null };
  return {
    id: r.id,
    platform: isPlatform(r.platform) ? r.platform : 'other',
    app_name: names.clients.get(r.oauth_client_id) ?? 'AI app',
    label: r.label,
    scopes: r.granted_scopes,
    tiers: TIER_ORDER.filter((t) => tiers.has(t) && t !== 'always'),
    settings: normalizeConnectionSettings(r.settings),
    availability: groupAvailability(r.granted_scopes, policy, role),
    message_cap_limit: connectionMessageCapLimit(policy),
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    is_mine: r.user_id === viewer.userId,
    user: { id: r.user_id, name: person.name, email: person.email },
  };
}

/** One active connection the viewer may manage, or null (also for "exists but not yours"). */
export async function getManageableConnection(
  db: SupabaseClient,
  viewer: Viewer,
  id: string
): Promise<(ConnectionDbRow & { role: AccountRole }) | null> {
  if (!UUID_RE.test(id)) return null;
  const { data } = await db
    .from('ai_connections')
    .select(CONNECTION_SELECT)
    .eq('id', id)
    .eq('account_id', viewer.accountId)
    .is('revoked_at', null)
    .maybeSingle();
  const row = (data as ConnectionDbRow | null) ?? null;
  if (!row || !canManage(viewer, row)) return null;
  const roles = await rolesFor(db, [row.user_id]);
  return { ...row, role: roles.get(row.user_id) ?? 'member' };
}

export async function getConnectionView(
  db: SupabaseClient,
  viewer: Viewer,
  id: string
): Promise<ConnectionView | null> {
  const row = await getManageableConnection(db, viewer, id);
  if (!row) return null;
  const [names, policy] = await Promise.all([
    lookupNames(db, [row.oauth_client_id], [row.user_id]),
    loadPolicy(db, viewer.accountId),
  ]);
  return toView(row, viewer, names, row.role, policy);
}

export async function saveConnection(
  db: SupabaseClient,
  id: string,
  update: { label?: string | null; settings?: ConnectionSettings }
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.label !== undefined) row.label = update.label;
  if (update.settings) row.settings = update.settings;
  const { error } = await db
    .from('ai_connections')
    .update(row)
    .eq('id', id)
    .is('revoked_at', null);
  if (error) throw new Error(`connection update failed: ${error.message}`);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------
// Activity
// ------------------------------------------------------------

/** Short, human summary of a redacted argument summary (never free text). */
export function summarizeActivityArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args as Record<string, unknown>).slice(
    0,
    4
  )) {
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      parts.push(`${k}: ${String(v).slice(0, 40)}`);
    } else if (Array.isArray(v))
      parts.push(`${k}: ${v.length} item${v.length === 1 ? '' : 's'}`);
    else if (v && typeof v === 'object' && 'text_length' in v)
      parts.push(`${k}: text`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export async function listActivity(
  db: SupabaseClient,
  viewer: Viewer,
  opts: {
    connectionId?: string;
    before?: string;
    limit?: number;
    /** 1-based page number. Switches to offset paging with a total count. */
    page?: number;
    /** Only this app (ai_audit_log.platform, e.g. 'claude'). */
    platform?: string;
  } = {}
): Promise<{
  items: ActivityView[];
  next_before: string | null;
  /** Set in page mode only. */
  total?: number;
  page?: number;
  page_size?: number;
}> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const pageNo =
    opts.page && Number.isFinite(opts.page)
      ? Math.min(10_000, Math.max(1, Math.floor(opts.page)))
      : null;
  let query = db
    .from('ai_audit_log')
    .select(
      'id, created_at, connection_id, user_id, platform, action, outcome, deny_reason, args_summary, duration_ms',
      pageNo ? { count: 'exact' } : undefined
    )
    .eq('account_id', viewer.accountId)
    .order('created_at', { ascending: false });
  // Page mode: an exact window plus a total, for numbered pagination.
  // Cursor mode (default): one extra row tells us whether more exist.
  query = pageNo
    ? query.range((pageNo - 1) * limit, pageNo * limit - 1)
    : query.limit(limit + 1);
  if (opts.platform && /^[a-z_]{1,32}$/.test(opts.platform))
    query = query.eq('platform', opts.platform);
  if (viewer.role !== 'owner') query = query.eq('user_id', viewer.userId);
  if (opts.connectionId) query = query.eq('connection_id', opts.connectionId);
  if (opts.before && !Number.isNaN(Date.parse(opts.before)))
    query = query.lt('created_at', opts.before);
  const { data, error, count } = await query;
  if (error) throw new Error(`activity lookup failed: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    created_at: string;
    connection_id: string | null;
    user_id: string | null;
    platform: string | null;
    action: string;
    outcome: string;
    deny_reason: string | null;
    args_summary: unknown;
    duration_ms: number | null;
  }[];
  const page = rows.slice(0, limit);

  const connIds = [
    ...new Set(
      page.map((r) => r.connection_id).filter((v): v is string => Boolean(v))
    ),
  ];
  const { data: conns } = connIds.length
    ? await db
        .from('ai_connections')
        .select('id, oauth_client_id')
        .in('id', connIds)
    : { data: [] as { id: string; oauth_client_id: string }[] };
  const clientOf = new Map(
    (conns ?? []).map((c) => [c.id as string, c.oauth_client_id as string])
  );
  const names = await lookupNames(
    db,
    [...new Set([...clientOf.values()])],
    viewer.role === 'owner'
      ? [
          ...new Set(
            page.map((r) => r.user_id).filter((v): v is string => Boolean(v))
          ),
        ]
      : []
  );

  return {
    items: page.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      connection_id: r.connection_id,
      platform: r.platform,
      app_name: r.connection_id
        ? (names.clients.get(clientOf.get(r.connection_id) ?? '') ?? null)
        : null,
      user_name: r.user_id ? (names.people.get(r.user_id)?.name ?? null) : null,
      action: r.action,
      outcome: r.outcome,
      deny_reason: r.deny_reason,
      summary: summarizeActivityArgs(r.args_summary),
      duration_ms: r.duration_ms,
    })),
    next_before:
      !pageNo && rows.length > limit ? page[page.length - 1].created_at : null,
    ...(pageNo
      ? { total: count ?? page.length, page: pageNo, page_size: limit }
      : {}),
  };
}

// ------------------------------------------------------------
// Super admin
// ------------------------------------------------------------

export interface PlatformSummary {
  locked: boolean;
  locked_reason: string | null;
  active_connections: number;
  by_platform: {
    platform: string;
    count: number;
    last_used_at: string | null;
  }[];
  last_used_at: string | null;
  calls_7d: number;
  errors_7d: number;
}

export async function accountConnectorSummary(
  db: SupabaseClient,
  accountId: string
): Promise<PlatformSummary> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: conns }, { data: policy }, calls, errors] = await Promise.all([
    db
      .from('ai_connections')
      .select('platform, last_used_at')
      .eq('account_id', accountId)
      .is('revoked_at', null),
    db
      .from('ai_workspace_policies')
      .select('locked_by_platform, locked_reason')
      .eq('account_id', accountId)
      .maybeSingle(),
    db
      .from('ai_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', weekAgo),
    db
      .from('ai_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('outcome', 'error')
      .gte('created_at', weekAgo),
  ]);
  const by = new Map<string, { count: number; last_used_at: string | null }>();
  for (const c of (conns ?? []) as {
    platform: string;
    last_used_at: string | null;
  }[]) {
    const e = by.get(c.platform) ?? { count: 0, last_used_at: null };
    e.count += 1;
    if (c.last_used_at && (!e.last_used_at || c.last_used_at > e.last_used_at))
      e.last_used_at = c.last_used_at;
    by.set(c.platform, e);
  }
  const byPlatform = [...by.entries()].map(([platform, v]) => ({
    platform,
    ...v,
  }));
  return {
    locked: policy?.locked_by_platform === true,
    locked_reason: (policy?.locked_reason as string | null) ?? null,
    active_connections: (conns ?? []).length,
    by_platform: byPlatform,
    last_used_at: byPlatform.reduce<string | null>(
      (max, p) =>
        p.last_used_at && (!max || p.last_used_at > max) ? p.last_used_at : max,
      null
    ),
    calls_7d: calls.count ?? 0,
    errors_7d: errors.count ?? 0,
  };
}

/** Super admin lock. Upserts the policy row, keeping the owner's settings. */
export async function setPlatformLock(
  db: SupabaseClient,
  accountId: string,
  locked: boolean,
  reason: string | null,
  adminUserId: string
): Promise<void> {
  const { data: existing } = await db
    .from('ai_workspace_policies')
    .select('account_id')
    .eq('account_id', accountId)
    .maybeSingle();
  const lock = {
    locked_by_platform: locked,
    locked_reason: locked ? (reason?.slice(0, 300) ?? null) : null,
    updated_by: adminUserId,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db
        .from('ai_workspace_policies')
        .update(lock)
        .eq('account_id', accountId)
    : await db
        .from('ai_workspace_policies')
        .insert({ account_id: accountId, ...lock });
  if (error) throw new Error(`lock update failed: ${error.message}`);
}

/** Owner's policy save. Upsert without touching the lock columns. */
export async function savePolicy(
  db: SupabaseClient,
  accountId: string,
  policy: WorkspacePolicy,
  userId: string
): Promise<void> {
  const row = {
    ...policyRowForSave(policy),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await db
    .from('ai_workspace_policies')
    .select('account_id')
    .eq('account_id', accountId)
    .maybeSingle();
  const { error } = existing
    ? await db
        .from('ai_workspace_policies')
        .update(row)
        .eq('account_id', accountId)
    : await db
        .from('ai_workspace_policies')
        .insert({ account_id: accountId, ...row });
  if (error) throw new Error(`policy save failed: ${error.message}`);
}
