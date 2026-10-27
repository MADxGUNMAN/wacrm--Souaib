// ============================================================
// Read-only lookups shared by the super-admin billing read routes
// (events, ledger, collected) — SERVER ONLY.
//
// Every query here is a SELECT. Workspaces owned by a super admin are
// excluded from billing reports: they can never be gated or billed, so
// their rows are noise in a revenue audit trail (same rule as the
// Workspaces list).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { BillingDbError } from './razorpay/db';

type Row = Record<string, unknown>;

export interface AccountInfo {
  id: string;
  name: string | null;
  ownerUserId: string | null;
}

export interface ProfileInfo {
  userId: string;
  fullName: string | null;
  email: string | null;
  isSuperAdmin: boolean;
}

export interface BillingDirectory {
  accounts: Map<string, AccountInfo>;
  profiles: Map<string, ProfileInfo>;
  /** Accounts owned by a super admin; excluded from billing reports. */
  superAdminOwned: Set<string>;
  ownerEmail(accountId: string): string | null;
}

/** accounts + profiles, once per request. Throws on a database error. */
export async function loadBillingDirectory(
  admin: SupabaseClient
): Promise<BillingDirectory> {
  const [accountsRes, profilesRes] = await Promise.all([
    admin.from('accounts').select('id, name, owner_user_id'),
    admin.from('profiles').select('user_id, full_name, email, is_super_admin'),
  ]);
  if (accountsRes.error) {
    throw new BillingDbError(
      `Could not read accounts: ${accountsRes.error.message}`
    );
  }
  if (profilesRes.error) {
    throw new BillingDbError(
      `Could not read profiles: ${profilesRes.error.message}`
    );
  }

  const accounts = new Map<string, AccountInfo>();
  for (const a of (accountsRes.data ?? []) as Row[]) {
    accounts.set(String(a.id), {
      id: String(a.id),
      name: (a.name as string | null) ?? null,
      ownerUserId: (a.owner_user_id as string | null) ?? null,
    });
  }
  const profiles = new Map<string, ProfileInfo>();
  for (const p of (profilesRes.data ?? []) as Row[]) {
    profiles.set(String(p.user_id), {
      userId: String(p.user_id),
      fullName: (p.full_name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      isSuperAdmin: p.is_super_admin === true,
    });
  }
  const superAdminOwned = new Set<string>();
  for (const a of accounts.values()) {
    if (a.ownerUserId && profiles.get(a.ownerUserId)?.isSuperAdmin) {
      superAdminOwned.add(a.id);
    }
  }
  return {
    accounts,
    profiles,
    superAdminOwned,
    ownerEmail(accountId) {
      const owner = accounts.get(accountId)?.ownerUserId;
      return (owner && profiles.get(owner)?.email) || null;
    },
  };
}

/**
 * `select columns from table where id in (ids)`, 200 ids per request so
 * the URL stays short. Returns id -> row. Throws on a database error.
 */
export async function rowsByIds(
  admin: SupabaseClient,
  table: string,
  columns: string,
  ids: Iterable<string | null | undefined>
): Promise<Map<string, Row>> {
  const unique = [...new Set([...ids].filter((x): x is string => !!x))];
  const out = new Map<string, Row>();
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .in('id', chunk);
    if (error) {
      throw new BillingDbError(`Could not read ${table}: ${error.message}`);
    }
    for (const r of (data ?? []) as unknown as Row[]) out.set(String(r.id), r);
  }
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
