// ============================================================
// GET /api/super-admin/sheets-addon/reports/replies?reportId=<uuid>
//
// The operator reply thread for one issue report, oldest first — a
// conversation reads top to bottom.
//
// `sent_by_email` is deliberately NOT selected. It exists for audit
// ("which operator answered this?"), and the thread displays `sent_by`.
// Not selecting it keeps an internal identity out of a payload the
// client has no use for.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { ISSUE_REPLIES_TABLE } from '@/lib/sheets-addon/help';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');
    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from(ISSUE_REPLIES_TABLE)
      .select('id, subject, body, sent_by, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(
        '[super-admin/sheets-addon/reports/replies] fetch failed:',
        error
      );
      return NextResponse.json(
        {
          error: `Could not read the reply thread: ${error.message}`,
          code: 'replies_query_failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ replies: data ?? [] });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error(
      '[super-admin/sheets-addon/reports/replies] GET failed:',
      err
    );
    return NextResponse.json(
      { error: (err as Error).message, code: 'replies_get_failed' },
      { status: 500 }
    );
  }
}
