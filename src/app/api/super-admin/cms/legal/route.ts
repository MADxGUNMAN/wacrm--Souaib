// ============================================================
// /api/super-admin/cms/legal
//
// GET — List all legal pages
// PUT — Update a legal page by slug
//
// Super admin only. Legal pages are pre-seeded; only content
// and visibility are updated via the CMS editor.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('legal_pages')
      .select('*')
      .order('slug', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pages: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to fetch legal pages' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const body = await request.json();
    const { id, slug, ...updates } = body as {
      id?: string;
      slug?: string;
      [key: string]: unknown;
    };

    if (!id && !slug) {
      return NextResponse.json(
        { error: 'Either ID or slug is required' },
        { status: 400 }
      );
    }

    let query = admin
      .from('legal_pages')
      .update({
        ...updates,
        last_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (id) {
      query = query.eq('id', id);
    } else if (slug) {
      query = query.eq('slug', slug);
    }

    const { data, error } = await query.select().single();

    if (error) {
      console.error('[cms/legal] PUT error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ page: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to update legal page' },
      { status: 500 }
    );
  }
}
