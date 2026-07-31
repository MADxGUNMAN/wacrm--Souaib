// ============================================================
// /api/super-admin/cms/pricing
//
// GET    — List all pricing tiers (ordered by position)
// POST   — Create a new pricing tier
// PUT    — Update an existing pricing tier
// DELETE — Delete a pricing tier
//
// Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('landing_pricing_tiers')
      .select('*')
      .order('position', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pricing: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to fetch pricing tiers' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const body = await request.json();

    const { data, error } = await admin
      .from('landing_pricing_tiers')
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tier: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to create pricing tier' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const body = await request.json();
    const { id, ...updates } = body as { id: string; [key: string]: unknown };

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('landing_pricing_tiers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tier: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to update pricing tier' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await admin
      .from('landing_pricing_tiers')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to delete pricing tier' },
      { status: 500 }
    );
  }
}
