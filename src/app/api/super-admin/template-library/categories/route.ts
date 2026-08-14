import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';

/**
 * Industry categories for the starter template library. Super admin only.
 *
 * GET    — every category, active or not, with a template count
 * POST   — create
 * PATCH  — update by id
 * DELETE — remove by id (templates cascade, see below)
 */

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

function readSlug(raw: unknown): string | null {
  const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return SLUG_RE.test(slug) ? slug : null;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const [cats, templates] = await Promise.all([
      admin.from('template_library_categories').select('*').order('position'),
      admin.from('template_library_templates').select('id, category_id'),
    ]);

    if (cats.error) {
      return NextResponse.json({ error: cats.error.message }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const t of templates.data ?? []) {
      counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    }

    return NextResponse.json({
      categories: (cats.data ?? []).map((c) => ({
        ...c,
        template_count: counts.get(c.id) ?? 0,
      })),
    });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();

    const slug = readSlug(body?.slug);
    if (!slug) {
      return NextResponse.json(
        {
          error:
            'The slug is required and may use lowercase letters, numbers and hyphens only.',
        },
        { status: 400 },
      );
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin()
      .from('template_library_categories')
      .insert({
        slug,
        name,
        emoji: typeof body?.emoji === 'string' && body.emoji.trim() ? body.emoji.trim() : '📄',
        description:
          typeof body?.description === 'string' && body.description.trim()
            ? body.description.trim()
            : null,
        position: Number.isFinite(Number(body?.position)) ? Number(body.position) : 0,
        is_active: body?.is_active !== false,
      })
      .select()
      .single();

    if (error) {
      // 23505 is a unique violation — the slug is the only unique column,
      // so saying which one collided is more useful than the raw message.
      const conflict = error.code === '23505';
      return NextResponse.json(
        {
          error: conflict
            ? `A category with the slug "${slug}" already exists.`
            : error.message,
        },
        { status: conflict ? 409 : 500 },
      );
    }

    return NextResponse.json({ category: data });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if ('name' in body) update.name = String(body.name ?? '').trim();
    if ('emoji' in body) update.emoji = String(body.emoji ?? '📄').trim() || '📄';
    if ('description' in body) {
      const d = String(body.description ?? '').trim();
      update.description = d || null;
    }
    if ('position' in body) update.position = Number(body.position) || 0;
    if ('is_active' in body) update.is_active = body.is_active !== false;
    if ('slug' in body) {
      const slug = readSlug(body.slug);
      if (!slug) {
        return NextResponse.json(
          { error: 'The slug may use lowercase letters, numbers and hyphens only.' },
          { status: 400 },
        );
      }
      update.slug = slug;
    }

    const { data, error } = await supabaseAdmin()
      .from('template_library_categories')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ category: data });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
    }

    // Deleting a category CASCADES to its templates (migration 065). That is
    // destructive and not obvious from the button, so the count is returned
    // and the UI states it in the confirmation.
    const { count } = await supabaseAdmin()
      .from('template_library_templates')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    const { error } = await supabaseAdmin()
      .from('template_library_categories')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, deleted_templates: count ?? 0 });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
