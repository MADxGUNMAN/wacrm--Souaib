// ============================================================
// GET /api/super-admin/cms/sections  — Read all landing sections
// PUT /api/super-admin/cms/sections  — Update a single section
//
// Super admin only. Manages the landing_sections table.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('landing_sections')
      .select('*')
      .order('position', { ascending: true });

    if (error) {
      console.error('[cms/sections] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sections' },
        { status: 500 }
      );
    }

    return NextResponse.json({ sections: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to fetch sections' },
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
      return NextResponse.json(
        { error: 'Section ID is required' },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('landing_sections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[cms/sections] PUT error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ section: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to update section' },
      { status: 500 }
    );
  }
}
