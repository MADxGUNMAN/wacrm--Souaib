// ============================================================
// GET /api/super-admin/newsletter/export?status=confirmed
//
// Super admin only. Exports newsletter subscribers as a CSV.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';

    const admin = supabaseAdmin();

    let query = admin
      .from('newsletter_subscribers')
      .select('email, status, source, created_at, confirmed_at, bounced_at, bounce_reason')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[newsletter/export] Query error:', error);
      return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
    }

    // Build CSV
    const headers = ['Email', 'Status', 'Source', 'Subscribed At', 'Confirmed At', 'Bounced At', 'Bounce Reason'];
    const rows = (data || []).map((row) => [
      `"${(row.email || '').replace(/"/g, '""')}"`,
      row.status,
      row.source || '',
      row.created_at || '',
      row.confirmed_at || '',
      row.bounced_at || '',
      `"${(row.bounce_reason || '').replace(/"/g, '""')}"`,
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="newsletter_subscribers_${today}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[newsletter/export] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
