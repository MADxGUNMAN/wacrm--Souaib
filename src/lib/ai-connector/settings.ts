// ============================================================
// Connection settings (per user, per app) and the workspace AI policy
// (per account, owner-managed): types, defaults and safe parsing of the
// stored JSON / row. Plan: docs/ai-connector/04-permissions-and-crm-ui.md §2.
// ============================================================

import {
  DEFAULT_ALLOWED_PLATFORMS,
  isPlatform,
  type Platform,
} from './platforms';
import type { CapabilityTier, ToolGroup } from './tool-catalog';

// ------------------------------------------------------------
// Connection settings
// ------------------------------------------------------------

export type SettingGroup = Exclude<ToolGroup, 'account' | 'view'>;

export interface ConnectionSettings {
  /** Master switch: every write is refused while true. */
  read_only: boolean;
  groups: Record<SettingGroup, boolean> & { send_to_new_numbers: boolean };
  caps: { messages_per_day: number };
  idle_days: number;
}

export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = {
  read_only: false,
  groups: {
    edit_records: true,
    send_messages: true,
    send_to_new_numbers: false,
    broadcasts: false,
    automations: false,
  },
  caps: { messages_per_day: 100 },
  idle_days: 30,
};

export const CONNECTION_CAP_LIMITS = {
  messagesPerDayMax: 1000,
  idleDaysMin: 1,
  idleDaysMax: 90,
};

const bool = (v: unknown, fallback: boolean) =>
  typeof v === 'boolean' ? v : fallback;
const int = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;

/** Parse stored JSON; anything missing or malformed takes the default. */
export function normalizeConnectionSettings(raw: unknown): ConnectionSettings {
  const d = DEFAULT_CONNECTION_SETTINGS;
  const r =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const g =
    r.groups && typeof r.groups === 'object'
      ? (r.groups as Record<string, unknown>)
      : {};
  const c =
    r.caps && typeof r.caps === 'object'
      ? (r.caps as Record<string, unknown>)
      : {};
  return {
    read_only: bool(r.read_only, d.read_only),
    groups: {
      edit_records: bool(g.edit_records, d.groups.edit_records),
      send_messages: bool(g.send_messages, d.groups.send_messages),
      send_to_new_numbers: bool(
        g.send_to_new_numbers,
        d.groups.send_to_new_numbers
      ),
      broadcasts: bool(g.broadcasts, d.groups.broadcasts),
      automations: bool(g.automations, d.groups.automations),
    },
    caps: {
      messages_per_day: int(
        c.messages_per_day,
        d.caps.messages_per_day,
        0,
        CONNECTION_CAP_LIMITS.messagesPerDayMax
      ),
    },
    idle_days: int(
      r.idle_days,
      d.idle_days,
      CONNECTION_CAP_LIMITS.idleDaysMin,
      CONNECTION_CAP_LIMITS.idleDaysMax
    ),
  };
}

/**
 * Apply a change requested by the AI itself (`restrict_my_permissions`).
 * It may only LOWER access (D8): a switch can go true → false, read_only
 * false → true, caps can only decrease. Any attempt to raise is ignored
 * and reported.
 */
export function lowerOnly(
  current: ConnectionSettings,
  requested: {
    read_only?: boolean;
    groups?: Partial<Record<keyof ConnectionSettings['groups'], boolean>>;
    messages_per_day?: number;
  }
): { next: ConnectionSettings; ignored: string[] } {
  const next: ConnectionSettings = {
    ...current,
    groups: { ...current.groups },
    caps: { ...current.caps },
  };
  const ignored: string[] = [];

  if (requested.read_only !== undefined) {
    if (requested.read_only) next.read_only = true;
    else if (current.read_only) ignored.push('read_only');
  }
  for (const [key, value] of Object.entries(requested.groups ?? {})) {
    const k = key as keyof ConnectionSettings['groups'];
    if (!(k in next.groups) || typeof value !== 'boolean') continue;
    if (!value) next.groups[k] = false;
    else if (!current.groups[k]) ignored.push(`groups.${k}`);
  }
  if (requested.messages_per_day !== undefined) {
    const v = requested.messages_per_day;
    if (Number.isInteger(v) && v >= 0 && v <= current.caps.messages_per_day)
      next.caps.messages_per_day = v;
    else ignored.push('messages_per_day');
  }
  return { next, ignored };
}

// ------------------------------------------------------------
// Workspace policy
// ------------------------------------------------------------

export interface WorkspacePolicy {
  enabled: boolean;
  allowed_platforms: Platform[];
  members_allowed: boolean;
  max_member_tier: CapabilityTier;
  allow_messaging: boolean;
  allow_broadcasts: boolean;
  allow_automation_changes: boolean;
  daily_message_cap: number;
  daily_broadcast_recipient_cap: number;
  require_preview_for_sends: boolean;
  locked_by_platform: boolean;
}

/** Must match the column defaults in 20261001000100_ai_connector_policy_audit.sql. */
export const DEFAULT_WORKSPACE_POLICY: WorkspacePolicy = {
  enabled: true,
  allowed_platforms: [...DEFAULT_ALLOWED_PLATFORMS],
  members_allowed: true,
  max_member_tier: 'edit',
  allow_messaging: true,
  allow_broadcasts: false,
  allow_automation_changes: false,
  daily_message_cap: 300,
  daily_broadcast_recipient_cap: 500,
  require_preview_for_sends: false,
  locked_by_platform: false,
};

const TIERS: readonly CapabilityTier[] = ['view', 'edit', 'send'];

export function tierRank(t: CapabilityTier): number {
  return TIERS.indexOf(t);
}

/** Row from ai_workspace_policies (or null = no row) → policy. */
export function normalizeWorkspacePolicy(
  row: Record<string, unknown> | null | undefined
): WorkspacePolicy {
  const d = DEFAULT_WORKSPACE_POLICY;
  if (!row) return { ...d, allowed_platforms: [...d.allowed_platforms] };
  const platforms = Array.isArray(row.allowed_platforms)
    ? (row.allowed_platforms as unknown[]).filter(isPlatform)
    : [...d.allowed_platforms];
  const tier = TIERS.includes(row.max_member_tier as CapabilityTier)
    ? (row.max_member_tier as CapabilityTier)
    : d.max_member_tier;
  return {
    enabled: bool(row.enabled, d.enabled),
    allowed_platforms: platforms,
    members_allowed: bool(row.members_allowed, d.members_allowed),
    max_member_tier: tier,
    allow_messaging: bool(row.allow_messaging, d.allow_messaging),
    allow_broadcasts: bool(row.allow_broadcasts, d.allow_broadcasts),
    allow_automation_changes: bool(
      row.allow_automation_changes,
      d.allow_automation_changes
    ),
    daily_message_cap: int(
      row.daily_message_cap,
      d.daily_message_cap,
      0,
      100000
    ),
    daily_broadcast_recipient_cap: int(
      row.daily_broadcast_recipient_cap,
      d.daily_broadcast_recipient_cap,
      0,
      1000000
    ),
    require_preview_for_sends: bool(
      row.require_preview_for_sends,
      d.require_preview_for_sends
    ),
    locked_by_platform: bool(row.locked_by_platform, d.locked_by_platform),
  };
}
