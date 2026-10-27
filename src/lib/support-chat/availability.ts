// ============================================================
// Live Chat visibility — SERVER ONLY loaders around the pure rule.
//
// Reads the singleton settings row, the workspace's override and its
// WhatsApp connection, then hands all three to `computeSupportAccess`.
// Nothing here decides anything itself; see ./access-rules.ts.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { isWhatsAppConnected } from '@/lib/super-admin/account-status';
import {
  DEFAULT_SUPPORT_SETTINGS,
  computeSupportAccess,
  isSupportVisibility,
  type SupportAccess,
  type SupportChatSettings,
  type SupportOverrideMode,
  type SupportOverrideSource,
} from './access-rules';

export const SUPPORT_SETTINGS_TABLE = 'support_chat_settings';
export const SUPPORT_ACCESS_TABLE = 'support_chat_access';

/**
 * The platform settings.
 *
 * A missing row, or a failed read, returns the DEFAULTS (on, everyone)
 * rather than throwing. Those defaults are exactly the behaviour before
 * this feature existed, so a deployment that has not run the migration
 * keeps working instead of every Live chat request 500ing.
 */
export async function loadSupportSettings(
  admin: SupabaseClient
): Promise<SupportChatSettings> {
  const { data, error } = await admin
    .from(SUPPORT_SETTINGS_TABLE)
    .select('enabled, visibility, widget_enabled, welcome_message, updated_at')
    .eq('id', true)
    .maybeSingle();

  if (error) {
    console.error('[support-chat/availability] settings read failed:', error);
    return DEFAULT_SUPPORT_SETTINGS;
  }
  if (!data) return DEFAULT_SUPPORT_SETTINGS;

  return {
    enabled: data.enabled !== false,
    visibility: isSupportVisibility(data.visibility) ? data.visibility : 'all',
    widgetEnabled: data.widget_enabled !== false,
    welcomeMessage: (data.welcome_message as string | null)?.trim() || null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export interface SupportOverride {
  mode: SupportOverrideMode;
  source: SupportOverrideSource;
  updatedAt: string;
}

/** Overrides and connection state for a batch of workspaces. */
async function loadAccessInputs(
  admin: SupabaseClient,
  accountIds: string[]
): Promise<{
  overrides: Map<string, SupportOverride>;
  connected: Set<string>;
}> {
  const overrides = new Map<string, SupportOverride>();
  const connected = new Set<string>();
  if (accountIds.length === 0) return { overrides, connected };

  const [overrideRes, whatsappRes] = await Promise.all([
    admin
      .from(SUPPORT_ACCESS_TABLE)
      .select('account_id, mode, source, updated_at')
      .in('account_id', accountIds),
    admin
      .from('whatsapp_config')
      .select('account_id, status')
      .in('account_id', accountIds),
  ]);

  if (overrideRes.error) {
    console.error(
      '[support-chat/availability] override read failed:',
      overrideRes.error
    );
  }
  for (const row of overrideRes.data ?? []) {
    const mode = row.mode as string;
    if (mode !== 'allow' && mode !== 'deny') continue;
    overrides.set(row.account_id as string, {
      mode,
      source: row.source === 'admin_message' ? 'admin_message' : 'manual',
      updatedAt: row.updated_at as string,
    });
  }

  if (whatsappRes.error) {
    console.error(
      '[support-chat/availability] whatsapp read failed:',
      whatsappRes.error
    );
  }
  for (const row of whatsappRes.data ?? []) {
    // Same predicate the accounts list and deep dive use, so "connected"
    // means one thing across the admin panel.
    if (isWhatsAppConnected(row.status as string | null)) {
      connected.add(row.account_id as string);
    }
  }

  return { overrides, connected };
}

export interface SupportAccessDetail extends SupportAccess {
  override: SupportOverride | null;
  whatsappConnected: boolean;
}

/** Access for many workspaces in three queries total. */
export async function getSupportAccessForAccounts(
  admin: SupabaseClient,
  accountIds: string[],
  settings?: SupportChatSettings
): Promise<Map<string, SupportAccessDetail>> {
  const resolvedSettings = settings ?? (await loadSupportSettings(admin));
  const unique = [...new Set(accountIds.filter(Boolean))];
  const { overrides, connected } = await loadAccessInputs(admin, unique);

  const out = new Map<string, SupportAccessDetail>();
  for (const id of unique) {
    const override = overrides.get(id) ?? null;
    const whatsappConnected = connected.has(id);
    out.set(id, {
      ...computeSupportAccess({
        settings: resolvedSettings,
        override: override?.mode ?? null,
        whatsappConnected,
      }),
      override,
      whatsappConnected,
    });
  }
  return out;
}

export async function getSupportAccessForAccount(
  admin: SupabaseClient,
  accountId: string,
  settings?: SupportChatSettings
): Promise<SupportAccessDetail> {
  const map = await getSupportAccessForAccounts(admin, [accountId], settings);
  return map.get(accountId) as SupportAccessDetail;
}

/**
 * Make sure a workspace can see Live chat, because an operator is about
 * to message it.
 *
 * Only ever ADDS access, and only when it is missing. A workspace that
 * already has access keeps whatever it had (including no override at
 * all) — writing a needless 'allow' would pin it open against a later
 * rule change the operator actually wanted to apply to it.
 *
 * Returns what happened so the caller can tell the operator.
 */
export async function ensureSupportAccessForAdminMessage(
  admin: SupabaseClient,
  accountId: string,
  operatorUserId: string
): Promise<
  | { ok: true; granted: boolean }
  | { ok: false; reason: 'disabled' | 'write_failed' }
> {
  const settings = await loadSupportSettings(admin);
  if (!settings.enabled) return { ok: false, reason: 'disabled' };

  const access = await getSupportAccessForAccount(admin, accountId, settings);
  if (access.available) return { ok: true, granted: false };

  // Covers both "not selected by the rule" and an explicit block. Messaging
  // a blocked workspace is a deliberate act from the same operator who can
  // unblock it, and the inbox says so before they send.
  const { error } = await admin.from(SUPPORT_ACCESS_TABLE).upsert(
    {
      account_id: accountId,
      mode: 'allow',
      source: 'admin_message',
      granted_by: operatorUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' }
  );
  if (error) {
    console.error('[support-chat/availability] auto-grant failed:', error);
    return { ok: false, reason: 'write_failed' };
  }
  return { ok: true, granted: true };
}

// ------------------------------------------------------------
// Directory of every workspace with its Live chat access
// ------------------------------------------------------------

export interface SupportAccessRow {
  accountId: string;
  accountName: string | null;
  createdAt: string;
  owner: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  whatsappConnected: boolean;
  override: SupportOverride | null;
  access: SupportAccess;
  /** Existing support conversation, if the workspace has ever had one. */
  conversationId: string | null;
  lastMessageAt: string | null;
}

/**
 * Every workspace, with owner, connection, override and computed access.
 *
 * Reads each table ONCE in full rather than `.in(<every account id>)`. A
 * PostgREST `in` filter travels in the URL, so at a few thousand
 * workspaces the request would exceed URL limits and fail — the pattern
 * that is fine for a page of conversations is wrong for a directory.
 */
export async function listSupportAccessRows(
  admin: SupabaseClient,
  settings?: SupportChatSettings
): Promise<SupportAccessRow[]> {
  const resolvedSettings = settings ?? (await loadSupportSettings(admin));
  const LIMIT = 10_000;

  const [accountsRes, ownersRes, whatsappRes, overridesRes, convosRes] =
    await Promise.all([
      admin
        .from('accounts')
        .select('id, name, created_at')
        .order('name', { ascending: true })
        .limit(LIMIT),
      admin
        .from('profiles')
        .select('user_id, account_id, full_name, email, avatar_url')
        .eq('account_role', 'owner')
        .limit(LIMIT),
      admin.from('whatsapp_config').select('account_id, status').limit(LIMIT),
      admin
        .from(SUPPORT_ACCESS_TABLE)
        .select('account_id, mode, source, updated_at')
        .limit(LIMIT),
      admin
        .from('support_conversations')
        .select('id, account_id, last_message_at')
        .limit(LIMIT),
    ]);

  if (accountsRes.error) throw accountsRes.error;

  const owners = new Map<string, SupportAccessRow['owner']>();
  for (const p of ownersRes.data ?? []) {
    const id = p.account_id as string;
    if (!id || owners.has(id)) continue;
    owners.set(id, {
      user_id: p.user_id as string,
      full_name: (p.full_name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      avatar_url: (p.avatar_url as string | null) ?? null,
    });
  }

  const connected = new Set<string>();
  for (const w of whatsappRes.data ?? []) {
    if (isWhatsAppConnected(w.status as string | null)) {
      connected.add(w.account_id as string);
    }
  }

  const overrides = new Map<string, SupportOverride>();
  for (const o of overridesRes.data ?? []) {
    if (o.mode !== 'allow' && o.mode !== 'deny') continue;
    overrides.set(o.account_id as string, {
      mode: o.mode,
      source: o.source === 'admin_message' ? 'admin_message' : 'manual',
      updatedAt: o.updated_at as string,
    });
  }

  const convos = new Map<string, { id: string; last: string | null }>();
  for (const c of convosRes.data ?? []) {
    convos.set(c.account_id as string, {
      id: c.id as string,
      last: (c.last_message_at as string | null) ?? null,
    });
  }

  return (accountsRes.data ?? []).map((a) => {
    const accountId = a.id as string;
    const override = overrides.get(accountId) ?? null;
    const whatsappConnected = connected.has(accountId);
    const convo = convos.get(accountId);
    return {
      accountId,
      accountName: (a.name as string | null) ?? null,
      createdAt: a.created_at as string,
      owner: owners.get(accountId) ?? null,
      whatsappConnected,
      override,
      access: computeSupportAccess({
        settings: resolvedSettings,
        override: override?.mode ?? null,
        whatsappConnected,
      }),
      conversationId: convo?.id ?? null,
      lastMessageAt: convo?.last ?? null,
    };
  });
}
