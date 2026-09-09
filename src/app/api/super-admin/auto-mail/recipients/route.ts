// ============================================================
// /api/super-admin/auto-mail/recipients
//
// GET   — every workspace with its live window, the stage due next, what
//         has already been sent, and whether it is opted out.
// PATCH — flip a workspace's opt-out.
//
// This is the section's main screen: "who is in line to be emailed, and
// what has each of them had". It answers that from derived state rather
// than a stored schedule, because there is no schedule table — the cron
// recomputes eligibility every tick, so anything this page showed from a
// separate source could disagree with what actually gets sent.
//
// Paging is done in memory here, unlike the log route, and that is a
// deliberate trade: the ordering that matters is "soonest deadline first",
// which is a property of DERIVED state (`resolveSubscriptionState` picks
// between two window columns) and cannot be expressed as an ORDER BY. The
// row count is bounded by the number of workspaces on the platform, which
// is the same set the Accounts screen already lists in full.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { loadOperatorAccountIds, loadRules } from '@/lib/auto-mail/reminders';
import { resolveDueOffset } from '@/lib/auto-mail/templates';
import type { AutoEmailSegment } from '@/lib/auto-mail/types';
import { getGateConfig } from '@/lib/subscription/queries';
import { resolveSubscriptionState } from '@/lib/subscription/status';
import type { SubscriptionStatus } from '@/lib/subscription/types';

export const dynamic = 'force-dynamic';

/** Hard ceiling on the scan, so one enormous tenant list cannot stall the page. */
const MAX_SCAN = 2000;

interface AccountRow {
  id: string;
  name: string | null;
  owner_user_id: string | null;
  is_banned: boolean | null;
  auto_email_opted_out: boolean | null;
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  subscription_plan_name: string | null;
}

export interface RecipientRow {
  accountId: string;
  accountName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  segment: AutoEmailSegment | null;
  /** Live status, derived — may differ from the stored column. */
  status: string;
  endsAt: string | null;
  daysLeft: number | null;
  planName: string | null;
  /** The stage due right now, or null when none applies. */
  dueOffset: number | null;
  /** True when this exact stage has already been claimed for this window. */
  alreadySentForWindow: boolean;
  optedOut: boolean;
  isBanned: boolean;
  /** Lifetime count of log rows for this workspace. */
  totalSent: number;
  lastSentAt: string | null;
  /** Why this workspace will not be emailed, when it will not be. */
  blockedReason: string | null;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10))
    );
    const segmentFilter = searchParams.get('segment') || 'all';
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const onlyDue = searchParams.get('onlyDue') === 'true';

    const [rules, gateConfig, operatorAccounts] = await Promise.all([
      loadRules(admin),
      getGateConfig(),
      loadOperatorAccountIds(admin),
    ]);

    const { data: accounts, error } = await admin
      .from('accounts')
      .select(
        'id, name, owner_user_id, is_banned, auto_email_opted_out, subscription_status, trial_ends_at, subscription_ends_at, subscription_plan_name'
      )
      .order('created_at', { ascending: false })
      .limit(MAX_SCAN);

    if (error) {
      console.error(
        '[super-admin/auto-mail/recipients] accounts query failed:',
        error.message
      );
      return NextResponse.json(
        { error: 'Failed to load recipients' },
        { status: 500 }
      );
    }

    /**
     * Operator-owned workspaces are dropped before anything else looks at
     * them, so this list matches exactly what the cron would send to. They
     * are counted, and the count is returned, because a workspace that
     * silently vanishes from an admin screen is its own small mystery —
     * the UI states "N operator workspace hidden" instead.
     */
    const allRows = (accounts ?? []) as AccountRow[];
    const rows = allRows.filter((r) => !operatorAccounts.has(r.id));
    const hiddenOperatorCount = allRows.length - rows.length;

    // ---- Owners, batched ----
    const ownerIds = [
      ...new Set(rows.map((r) => r.owner_user_id).filter(Boolean)),
    ] as string[];
    const owners = new Map<
      string,
      { name: string | null; email: string | null }
    >();
    if (ownerIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ownerIds);
      for (const p of (profiles ?? []) as {
        user_id: string;
        full_name: string | null;
        email: string | null;
      }[]) {
        owners.set(p.user_id, { name: p.full_name, email: p.email });
      }
    }

    // ---- Log summary, batched ----
    // One scan of the log rather than a count per account: at N
    // workspaces the per-account version is N round trips for a page that
    // is refreshed on every filter change.
    const { data: logRows } = await admin
      .from('auto_email_log')
      .select('account_id, segment, offset_days, window_end, created_at')
      .order('created_at', { ascending: false })
      .limit(20000);

    const totals = new Map<string, number>();
    const lastSent = new Map<string, string>();
    const claimed = new Set<string>();
    for (const row of (logRows ?? []) as {
      account_id: string;
      segment: string;
      offset_days: number;
      window_end: string;
      created_at: string;
    }[]) {
      totals.set(row.account_id, (totals.get(row.account_id) ?? 0) + 1);
      if (!lastSent.has(row.account_id)) {
        lastSent.set(row.account_id, row.created_at);
      }
      claimed.add(
        `${row.account_id}|${row.segment}|${new Date(row.window_end).toISOString()}|${row.offset_days}`
      );
    }

    // ---- Derive per row ----
    const all: RecipientRow[] = rows.map((row) => {
      const state = resolveSubscriptionState(
        { ...row, subscription_status: row.subscription_status ?? undefined },
        gateConfig
      );

      const segment: AutoEmailSegment | null = state.isTrialing
        ? 'trial'
        : state.isActive
          ? 'paid'
          : null;

      const rule = segment ? rules[segment] : null;
      const dueOffset =
        segment && rule && rule.is_enabled && state.daysLeft !== null
          ? resolveDueOffset(state.daysLeft, rule.offsets_days)
          : null;

      const owner = row.owner_user_id
        ? owners.get(row.owner_user_id)
        : undefined;

      // Stated explicitly so the operator never has to infer why someone
      // is absent from the send queue. Ordered by precedence — the first
      // true reason is the one that actually stops the send.
      let blockedReason: string | null = null;
      if (row.is_banned) blockedReason = 'Workspace is banned';
      else if (row.auto_email_opted_out)
        blockedReason = 'Opted out of Auto Mail';
      else if (gateConfig.is_enabled === false)
        blockedReason = 'Billing is disabled platform-wide';
      else if (!segment) blockedReason = 'No live trial or subscription window';
      else if (!rule || !rule.is_enabled)
        blockedReason = `The ${segment} segment is turned off`;
      else if (state.pendingWindow)
        blockedReason = 'Already covered by a queued window';
      else if (!owner?.email) blockedReason = 'No owner email on file';

      const claimKey =
        segment && dueOffset !== null && state.endsAt
          ? `${row.id}|${segment}|${state.endsAt.toISOString()}|${dueOffset}`
          : null;

      return {
        accountId: row.id,
        accountName: row.name ?? 'Workspace',
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        segment,
        status: state.status,
        endsAt: state.endsAt ? state.endsAt.toISOString() : null,
        daysLeft: state.daysLeft,
        planName: row.subscription_plan_name ?? null,
        dueOffset,
        alreadySentForWindow: claimKey ? claimed.has(claimKey) : false,
        optedOut: Boolean(row.auto_email_opted_out),
        isBanned: Boolean(row.is_banned),
        totalSent: totals.get(row.id) ?? 0,
        lastSentAt: lastSent.get(row.id) ?? null,
        blockedReason,
      };
    });

    let filtered = all;
    if (segmentFilter === 'trial' || segmentFilter === 'paid') {
      filtered = filtered.filter((r) => r.segment === segmentFilter);
    } else if (segmentFilter === 'none') {
      filtered = filtered.filter((r) => r.segment === null);
    }
    if (onlyDue) {
      filtered = filtered.filter(
        (r) =>
          r.dueOffset !== null && !r.alreadySentForWindow && !r.blockedReason
      );
    }
    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.accountName.toLowerCase().includes(search) ||
          (r.ownerEmail ?? '').toLowerCase().includes(search) ||
          (r.ownerName ?? '').toLowerCase().includes(search)
      );
    }

    // Soonest deadline first, workspaces with no window last. This is the
    // ordering that cannot be done in SQL — see the note at the top.
    filtered.sort((a, b) => {
      if (a.daysLeft === null && b.daysLeft === null) return 0;
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

    const total = filtered.length;
    const from = (page - 1) * pageSize;

    const summary = {
      total: all.length,
      trialing: all.filter((r) => r.segment === 'trial').length,
      paid: all.filter((r) => r.segment === 'paid').length,
      dueNow: all.filter(
        (r) =>
          r.dueOffset !== null && !r.alreadySentForWindow && !r.blockedReason
      ).length,
      optedOut: all.filter((r) => r.optedOut).length,
      emailsSentTotal: [...totals.values()].reduce((a, b) => a + b, 0),
    };

    return NextResponse.json({
      recipients: filtered.slice(from, from + pageSize),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      page,
      pageSize,
      summary,
      // Surfaced so the UI can explain a platform-wide "nothing will send"
      // rather than showing an unexplained empty queue.
      billingEnabled: gateConfig.is_enabled,
      hiddenOperatorCount,
      rules,
    });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/auto-mail/recipients] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load recipients' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const accountId =
      typeof body.accountId === 'string' ? body.accountId.trim() : '';
    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }
    if (typeof body.optedOut !== 'boolean') {
      return NextResponse.json(
        { error: 'optedOut must be true or false' },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('accounts')
      .update({
        auto_email_opted_out: body.optedOut,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .select('id, auto_email_opted_out')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      accountId: data.id,
      optedOut: data.auto_email_opted_out,
    });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/auto-mail/recipients] PATCH failed:', err);
    return NextResponse.json(
      { error: 'Failed to update the opt-out' },
      { status: 500 }
    );
  }
}
