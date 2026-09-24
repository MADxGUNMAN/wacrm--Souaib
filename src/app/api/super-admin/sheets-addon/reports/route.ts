// ============================================================
// GET / PATCH / DELETE /api/super-admin/sheets-addon/reports
//
// The issue-report inbox. Deliberately shaped like the contact
// submissions API so the two inboxes in the panel behave identically:
// same filter/sort/search/paginate contract, same status vocabulary,
// same hard-delete semantics.
//
// One difference from the contact routes, kept on purpose: every handler
// here calls `requireSuperAdmin` first. The contact equivalents call the
// service-role client with no auth check at all, which makes them
// reachable unauthenticated — worth not copying.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  ISSUE_REPORTS_TABLE,
  REPORT_CLOSING_STATUSES,
  REPORT_STATUSES,
} from '@/lib/sheets-addon/help';
import type {
  SheetsAddonReportCounts,
  SheetsAddonReportStatus,
} from '@/types/super-admin';

export const dynamic = 'force-dynamic';

/** Columns a free-text search scans. */
const SEARCH_COLUMNS = [
  'message',
  'reporter_email',
  'account_name',
  'spreadsheet_name',
] as const;

/**
 * Escape the PostgREST `or()` filter metacharacters.
 *
 * A raw comma or parenthesis in a search term would be parsed as filter
 * syntax, silently turning one search into several conditions. The
 * contact-submissions route interpolates the term unescaped; that is a
 * bug, not a convention to copy.
 */
function escapeForOr(term: string): string {
  return term.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchFilter(term: string): string {
  return SEARCH_COLUMNS.map((c) => `${c}.ilike.%${term}%`).join(',');
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(
      1,
      parseInt(searchParams.get('page') ?? '1', 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20)
    );
    const statusParam = searchParams.get('status');
    const status = REPORT_STATUSES.includes(
      statusParam as SheetsAddonReportStatus
    )
      ? (statusParam as SheetsAddonReportStatus)
      : null;
    const search = escapeForOr(searchParams.get('search') ?? '');
    const ascending = searchParams.get('sortBy') === 'oldest';

    const admin = supabaseAdmin();

    let query = admin
      .from(ISSUE_REPORTS_TABLE)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq('status', status);
    if (search) query = query.or(searchFilter(search));

    const { data, count, error } = await query;

    if (error) {
      console.error('[super-admin/sheets-addon/reports] query failed:', error);
      return NextResponse.json(
        {
          error: `Could not read issue reports: ${error.message}`,
          code: 'reports_query_failed',
        },
        { status: 500 }
      );
    }

    // Per-status counts for the tiles. Computed with head-only count
    // queries rather than from the current page, which would only ever
    // describe what is already on screen. They respect an active search
    // so the tiles and the table agree, but ignore the status filter —
    // that is the point of them.
    const counts: SheetsAddonReportCounts = {
      new: 0,
      read: 0,
      replied: 0,
      archived: 0,
      total: 0,
    };

    await Promise.all(
      REPORT_STATUSES.map(async (value) => {
        let countQuery = admin
          .from(ISSUE_REPORTS_TABLE)
          .select('*', { count: 'exact', head: true })
          .eq('status', value);
        if (search) countQuery = countQuery.or(searchFilter(search));
        const { count: statusCount } = await countQuery;
        counts[value] = statusCount ?? 0;
      })
    );
    counts.total = counts.new + counts.read + counts.replied + counts.archived;

    const total = count ?? 0;

    return NextResponse.json({
      reports: data ?? [],
      counts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/reports] GET failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'reports_get_failed' },
      { status: 500 }
    );
  }
}

/**
 * Change a report's status.
 *
 * `resolved_at` is maintained here rather than by the caller, so the
 * timestamp always matches the status beside it: stamped on the way into
 * replied/archived, cleared on the way back out. That keeps "how long
 * did this take to answer" a question the data can answer.
 */
export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Expected a JSON body' },
        { status: 400 }
      );
    }

    const source = (body ?? {}) as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id : '';
    const status = typeof source.status === 'string' ? source.status : '';

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    if (!REPORT_STATUSES.includes(status as SheetsAddonReportStatus)) {
      return NextResponse.json(
        { error: `Status must be one of: ${REPORT_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const isClosing = REPORT_CLOSING_STATUSES.includes(
      status as SheetsAddonReportStatus
    );

    const { data, error } = await supabaseAdmin()
      .from(ISSUE_REPORTS_TABLE)
      .update({
        status,
        resolved_at: isClosing ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[super-admin/sheets-addon/reports] update failed:', error);
      return NextResponse.json(
        {
          error: `Could not update the report: ${error.message}`,
          code: 'report_update_failed',
        },
        { status: 500 }
      );
    }

    // A bad id surfaces here as a null row: the update itself succeeds
    // against zero rows. Reporting 404 rather than a cheerful success is
    // what stops the UI showing a status change that never happened.
    if (!data) {
      return NextResponse.json(
        { error: 'That report no longer exists.', code: 'report_not_found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, report: data });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/reports] PATCH failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'report_patch_failed' },
      { status: 500 }
    );
  }
}

/** Hard delete. The reply thread goes with it via ON DELETE CASCADE. */
export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin()
      .from(ISSUE_REPORTS_TABLE)
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[super-admin/sheets-addon/reports] delete failed:', error);
      return NextResponse.json(
        {
          error: `Could not delete the report: ${error.message}`,
          code: 'report_delete_failed',
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'That report no longer exists.', code: 'report_not_found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/reports] DELETE failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'report_delete_failed' },
      { status: 500 }
    );
  }
}
