// ============================================================
// /api/super-admin/cms/docs/categories
//
// POST   — create a category (appended to the end of the order)
// PUT    — update one
// DELETE — remove one (?id=). Its resources go too, via the FK's
//          ON DELETE CASCADE — deliberate, because an orphaned resource
//          would be unreachable from every editor screen.
//
// Super admin only.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

const FIELDS = [
  'title',
  'description',
  'icon_name',
  'position',
  'is_visible',
] as const;

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (field in body) out[field] = body[field];
  }
  return out;
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const updates = pick(body);

    if (!String(updates.title ?? '').trim()) {
      return NextResponse.json(
        { error: 'A category needs a title', field: 'title' },
        { status: 400 },
      );
    }

    // Append rather than inserting at 0, so adding a category never
    // reshuffles the existing page.
    if (updates.position === undefined) {
      const { data: last } = await admin
        .from('docs_categories')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      updates.position = ((last?.position as number) ?? 0) + 1;
    }

    const { data, error } = await admin
      .from('docs_categories')
      .insert(updates)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ category: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs/categories] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to create the category' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates = pick(body);
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields were supplied' },
        { status: 400 },
      );
    }
    if ('title' in updates && !String(updates.title ?? '').trim()) {
      return NextResponse.json(
        { error: 'A category needs a title', field: 'title' },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from('docs_categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ category: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs/categories] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to update the category' },
      { status: 500 },
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
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await admin.from('docs_categories').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs/categories] DELETE failed:', err);
    return NextResponse.json(
      { error: 'Failed to delete the category' },
      { status: 500 },
    );
  }
}
