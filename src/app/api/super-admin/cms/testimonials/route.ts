// ============================================================
// /api/super-admin/cms/testimonials
//
// GET    — List all testimonials (ordered by position)
// POST   — Create a new testimonial
// PUT    — Update an existing testimonial
// DELETE — Delete a testimonial
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
      .from('landing_testimonials')
      .select('*')
      .order('position', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ testimonials: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to fetch testimonials' },
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
      .from('landing_testimonials')
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ testimonial: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to create testimonial' },
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
      .from('landing_testimonials')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ testimonial: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to update testimonial' },
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
      .from('landing_testimonials')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to delete testimonial' },
      { status: 500 }
    );
  }
}
