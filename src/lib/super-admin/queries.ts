// ============================================================
// Super Admin data queries — all server-side, service-role.
//
// Every function here uses `supabaseAdmin()` which bypasses RLS,
// allowing cross-account analytics and management. These are
// ONLY called from `/api/super-admin/*` routes that first call
// `requireSuperAdmin(request)` to verify authorization.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import type {
  PlatformMetrics,
  AccountSummary,
  AccountDeepDive,
  AccountFilters,
  SignupDataPoint,
  HealthDashboardData,
} from '@/types/super-admin';

// ============================================================
// Platform-wide metrics
// ============================================================

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('fn_platform_metrics');

  if (error) {
    console.error('[super-admin] getPlatformMetrics error:', error);
    throw new Error(`Failed to fetch platform metrics: ${error.message}`);
  }

  return data as PlatformMetrics;
}

// ============================================================
// Accounts list (paginated, searchable, filterable)
// ============================================================

export async function getAccountsList(
  page: number = 1,
  pageSize: number = 20,
  filters?: AccountFilters
): Promise<{ accounts: AccountSummary[]; total: number }> {
  const admin = supabaseAdmin();

  // Build the base query
  let query = admin
    .from('v_platform_accounts_summary')
    .select('*', { count: 'exact' });

  // Exclude accounts owned by super admins (they are platform operators, not tenants)
  const { data: superAdminProfiles } = await admin
    .from('profiles')
    .select('account_id')
    .eq('is_super_admin', true)
    .not('account_id', 'is', null);

  const superAdminAccountIds = (superAdminProfiles ?? [])
    .map((p) => p.account_id)
    .filter(Boolean) as string[];

  if (superAdminAccountIds.length > 0) {
    query = query.not('account_id', 'in', `(${superAdminAccountIds.join(',')})`);
  }

  // Apply filters
  if (filters?.status === 'banned') {
    query = query.eq('is_banned', true);
  } else if (filters?.status === 'active') {
    query = query.eq('is_banned', false);
  }

  if (filters?.whatsapp === 'connected') {
    query = query.eq('whatsapp_status', 'connected');
  } else if (filters?.whatsapp === 'disconnected') {
    query = query.eq('whatsapp_status', 'disconnected');
  }

  if (filters?.search) {
    const search = `%${filters.search}%`;
    query = query.or(
      `account_name.ilike.${search},owner_name.ilike.${search},owner_email.ilike.${search}`
    );
  }

  // Apply sorting
  switch (filters?.sortBy) {
    case 'oldest':
      query = query.order('account_created_at', { ascending: true });
      break;
    case 'most_active':
      query = query.order('messages_30d', { ascending: false });
      break;
    case 'most_members':
      query = query.order('member_count', { ascending: false });
      break;
    case 'newest':
    default:
      query = query.order('account_created_at', { ascending: false });
      break;
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('[super-admin] getAccountsList error:', error);
    throw new Error(`Failed to fetch accounts: ${error.message}`);
  }

  return {
    accounts: (data ?? []) as AccountSummary[],
    total: count ?? 0,
  };
}

// ============================================================
// Account deep dive
// ============================================================

export async function getAccountDeepDive(
  accountId: string
): Promise<AccountDeepDive> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('fn_account_deep_dive', {
    target_account_id: accountId,
  });

  if (error) {
    console.error('[super-admin] getAccountDeepDive error:', error);
    throw new Error(`Failed to fetch account details: ${error.message}`);
  }

  return data as AccountDeepDive;
}

// ============================================================
// Signups growth chart data
// ============================================================

export async function getSignupsOverTime(
  days: number = 30
): Promise<SignupDataPoint[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('fn_signups_over_time', {
    days_back: days,
  });

  if (error) {
    console.error('[super-admin] getSignupsOverTime error:', error);
    throw new Error(`Failed to fetch signup data: ${error.message}`);
  }

  return (data ?? []) as SignupDataPoint[];
}

// ============================================================
// Ban / Unban account
// ============================================================

export async function banAccount(
  accountId: string,
  reason: string,
  bannedByUserId: string
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from('accounts')
    .update({
      is_banned: true,
      banned_at: new Date().toISOString(),
      banned_reason: reason,
      banned_by_user_id: bannedByUserId,
    })
    .eq('id', accountId);

  if (error) {
    console.error('[super-admin] banAccount error:', error);
    throw new Error(`Failed to ban account: ${error.message}`);
  }
}

export async function unbanAccount(accountId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from('accounts')
    .update({
      is_banned: false,
      banned_at: null,
      banned_reason: null,
      banned_by_user_id: null,
    })
    .eq('id', accountId);

  if (error) {
    console.error('[super-admin] unbanAccount error:', error);
    throw new Error(`Failed to unban account: ${error.message}`);
  }
}

// ============================================================
// Health Dashboard data
// ============================================================

export async function getHealthDashboardData(): Promise<HealthDashboardData> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('fn_health_metrics');

  if (error) {
    console.error('[super-admin] getHealthDashboardData error:', error);
    throw new Error(`Failed to fetch health data: ${error.message}`);
  }

  return data as HealthDashboardData;
}
