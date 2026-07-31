// ============================================================
// GET /api/super-admin/cms/settings  — Read site settings
// PUT /api/super-admin/cms/settings  — Update site settings
//
// Super admin only. Manages the singleton site_settings row.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('site_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[cms/settings] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const body = await request.json();

    // Get existing settings id (singleton)
    const { data: existing } = await admin
      .from('site_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      // Create if doesn't exist
      const { data, error } = await admin
        .from('site_settings')
        .insert({ ...body, updated_at: new Date().toISOString() })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ settings: data });
    }

    // Update existing
    const { data, error } = await admin
      .from('site_settings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[cms/settings] PUT error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
