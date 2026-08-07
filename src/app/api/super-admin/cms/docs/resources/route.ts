// ============================================================
// /api/super-admin/cms/docs/resources
//
// POST   — create a link inside a category
// PUT    — update one
// DELETE — remove one (?id=)
//
// Super admin only.
//
// The `href` check is the interesting part: these links are rendered on
// a public page, so an admin typo of `javascript:` would become a live
// XSS vector for every visitor. Only http/https and site-relative paths
// are accepted. See ALLOWED_HREF below.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

const FIELDS = [
  'category_id',
  'title',
  'description',
  'href',
  'icon_name',
  'badge_label',
  'is_external',
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

/**
 * Validate a link destination.
 *
 * Accepts an absolute http(s) URL, or a site-relative path starting with
 * `/` or `#`. Everything else is refused — most importantly
 * `javascript:` and `data:`, which would execute in a visitor's browser
 * when they clicked a card on the public docs page.
 */
function hrefError(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return 'Add the link this card should open';

  if (value.startsWith('/') || value.startsWith('#')) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Use a full URL starting with https:// or a path starting with /';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Links must use http:// or https://';
  }
  return null;
}

/** Keep `is_external` consistent with the href rather than trusting it. */
function deriveIsExternal(updates: Record<string, unknown>): void {
  if (!('href' in updates)) return;
  const value = String(updates.href ?? '').trim();
  updates.is_external = /^https?:\/\//i.test(value);
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const updates = pick(body);

    if (typeof updates.category_id !== 'string' || !updates.category_id) {
      return NextResponse.json(
        { error: 'category_id is required', field: 'category_id' },
        { status: 400 },
      );
    }
    if (!String(updates.title ?? '').trim()) {
      return NextResponse.json(
        { error: 'A link needs a title', field: 'title' },
        { status: 400 },
      );
    }
    const linkError = hrefError(updates.href);
    if (linkError) {
      return NextResponse.json(
        { error: linkError, field: 'href' },
        { status: 400 },
      );
    }
    deriveIsExternal(updates);

    // Append within the category so a new link lands at the bottom.
    if (updates.position === undefined) {
      const { data: last } = await admin
        .from('docs_resources')
        .select('position')
        .eq('category_id', updates.category_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      updates.position = ((last?.position as number) ?? 0) + 1;
    }

    const { data, error } = await admin
      .from('docs_resources')
      .insert(updates)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ resource: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs/resources] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to create the link' },
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
        { error: 'A link needs a title', field: 'title' },
        { status: 400 },
      );
    }
    if ('href' in updates) {
      const linkError = hrefError(updates.href);
      if (linkError) {
        return NextResponse.json(
          { error: linkError, field: 'href' },
          { status: 400 },
        );
      }
      deriveIsExternal(updates);
    }

    const { data, error } = await admin
      .from('docs_resources')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ resource: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs/resources] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to update the link' },
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

    const { error } = await admin.from('docs_resources').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs/resources] DELETE failed:', err);
    return NextResponse.json(
      { error: 'Failed to delete the link' },
      { status: 500 },
    );
  }
}
