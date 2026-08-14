// ============================================================
// GET    /api/super-admin/newsletter — List subscribers (paginated)
// PATCH  /api/super-admin/newsletter — Update subscriber status
// DELETE /api/super-admin/newsletter — Delete a subscriber
//
// Super admin only. Mirrors the contact submissions API pattern.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'newest';

    const admin = supabaseAdmin();

    // ── Main query ────────────────────────────────────────────
    let query = admin
      .from('newsletter_subscribers')
      .select('*', { count: 'exact' });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    switch (sortBy) {
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[super-admin/newsletter] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
    }

    // ── Aggregate stats ───────────────────────────────────────
    const statuses = ['pending', 'confirmed', 'bounced', 'unsubscribed'] as const;
    const statsPromises = statuses.map(async (s) => {
      const { count: c } = await admin
        .from('newsletter_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      return [s, c || 0] as const;
    });
    const statEntries = await Promise.all(statsPromises);
    const stats = Object.fromEntries(statEntries) as Record<string, number>;
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      subscribers: data || [],
      total,
      totalPages,
      page,
      pageSize,
      stats,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/newsletter] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const validStatuses = ['pending', 'confirmed', 'bounced', 'unsubscribed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const now = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now,
    };

    // Set the appropriate timestamp
    if (status === 'confirmed') updatePayload.confirmed_at = now;
    if (status === 'bounced') updatePayload.bounced_at = now;

    const { error } = await admin
      .from('newsletter_subscribers')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      console.error('[super-admin/newsletter] Update error:', error);
      return NextResponse.json({ error: 'Failed to update subscriber' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/newsletter] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { error } = await admin
      .from('newsletter_subscribers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[super-admin/newsletter] Delete error:', error);
      return NextResponse.json({ error: 'Failed to delete subscriber' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/newsletter] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
