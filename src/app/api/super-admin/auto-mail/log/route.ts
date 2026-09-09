// ============================================================
// GET /api/super-admin/auto-mail/log — Auto Mail delivery history.
//
// Serves two screens from one route:
//   ?accountId=<id>  the per-account card on the account deep dive
//   (no accountId)   the global history tab, with filters
//
// One route rather than two because the shape is identical and the only
// difference is a WHERE clause. `total` is the count for the CURRENT
// filter, which is what the per-account card shows as "N emails sent".
//
// Paged in the DATABASE with count: 'exact' + .range(), not in memory.
// This table grows by one row per reminder per account forever, so it is
// the one place a "fetch and slice" would eventually stop working.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import {
  AUTO_EMAIL_SEGMENTS,
  type AutoEmailLogEntry,
} from '@/lib/auto-mail/types';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['sending', 'sent', 'failed', 'skipped'] as const;

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
    const accountId = searchParams.get('accountId');
    const segment = searchParams.get('segment') || 'all';
    const status = searchParams.get('status') || 'all';
    const search = (searchParams.get('search') || '').trim();

    let query = admin
      .from('auto_email_log')
      // The workspace name comes from the FK rather than being duplicated
      // on the log row: unlike the email address, a renamed workspace
      // should read as its current name in the admin's history.
      .select('*, accounts(name)', { count: 'exact' });

    if (accountId) query = query.eq('account_id', accountId);
    if (segment !== 'all' && AUTO_EMAIL_SEGMENTS.includes(segment as 'trial')) {
      query = query.eq('segment', segment);
    }
    if (
      status !== 'all' &&
      (VALID_STATUSES as readonly string[]).includes(status)
    ) {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.ilike('recipient_email', `%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[super-admin/auto-mail/log] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to load the email history' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as (AutoEmailLogEntry & {
      accounts?: { name: string | null } | null;
    })[];

    const entries: AutoEmailLogEntry[] = rows.map((row) => {
      const { accounts, ...rest } = row;
      return { ...rest, account_name: accounts?.name ?? null };
    });

    const total = count ?? 0;

    // Status tallies for the current scope. Head-count queries rather
    // than counting the page, which would only ever describe 20 rows.
    const scopeCounts = await Promise.all(
      VALID_STATUSES.map(async (s) => {
        let q = admin
          .from('auto_email_log')
          .select('id', { count: 'exact', head: true })
          .eq('status', s);
        if (accountId) q = q.eq('account_id', accountId);
        const { count: c } = await q;
        return [s, c ?? 0] as const;
      })
    );

    return NextResponse.json({
      entries,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      page,
      pageSize,
      counts: Object.fromEntries(scopeCounts) as Record<string, number>,
    });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/auto-mail/log] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load the email history' },
      { status: 500 }
    );
  }
}
