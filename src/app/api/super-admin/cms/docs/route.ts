// ============================================================
// /api/super-admin/cms/docs
//
// GET — everything the editor needs in one round trip: the singleton
//       page copy, all categories, and all resources (including hidden
//       ones, which the public queries filter out).
// PUT — update the singleton page copy.
//
// Super admin only.
//
// Column allowlist: unlike the older CMS routes, which spread the
// request body straight into the update, these routes pick the columns
// they accept. A stray `id`, `created_at` or an unexpected key from a
// future client would otherwise reach Postgres and either error or
// silently corrupt a row — and with `position` in play, a corrupted
// value quietly reorders the customer-facing page.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

/** Fields on `docs_page_settings` an editor may change. */
const SETTINGS_FIELDS = [
  'eyebrow',
  'heading',
  'subheading',
  'show_search',
  'search_placeholder',
  'show_legal_section',
  'legal_heading',
  'legal_subheading',
  'show_support_section',
  'support_heading',
  'support_body',
  'support_cta_text',
  'support_cta_link',
] as const;

function pick(
  body: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in body) out[field] = body[field];
  }
  return out;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const [settingsRes, categoriesRes, resourcesRes] = await Promise.all([
      admin.from('docs_page_settings').select('*').limit(1).maybeSingle(),
      admin
        .from('docs_categories')
        .select('*')
        .order('position', { ascending: true }),
      admin
        .from('docs_resources')
        .select('*')
        .order('position', { ascending: true }),
    ]);

    if (categoriesRes.error) {
      return NextResponse.json(
        { error: categoriesRes.error.message },
        { status: 500 },
      );
    }
    if (resourcesRes.error) {
      return NextResponse.json(
        { error: resourcesRes.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      settings: settingsRes.data ?? null,
      categories: categoriesRes.data ?? [],
      resources: resourcesRes.data ?? [],
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load docs content' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const updates = pick(body, SETTINGS_FIELDS);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields were supplied' },
        { status: 400 },
      );
    }
    if ('heading' in updates && !String(updates.heading ?? '').trim()) {
      // The page heading is the only genuinely required string — an empty
      // one leaves the public page with no title at all.
      return NextResponse.json(
        { error: 'The page heading cannot be empty', field: 'heading' },
        { status: 400 },
      );
    }

    // Singleton: find the existing row, or create it. The row can be
    // absent on a fresh install where the seed never ran.
    const { data: existing } = await admin
      .from('docs_page_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data, error } = await admin
        .from('docs_page_settings')
        .insert(updates)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ settings: data });
    }

    const { data, error } = await admin
      .from('docs_page_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/cms/docs] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to save docs settings' },
      { status: 500 },
    );
  }
}
