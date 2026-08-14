import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { validateTemplatePayload } from '@/lib/whatsapp/template-validators';
import { toAppCategory } from '@/lib/templates/starter-library';

/**
 * Starter-library templates. Super admin only.
 *
 * ─── Why these are validated on save ──────────────────────────────
 *
 * A library template exists to be submitted to Meta by someone else, later,
 * often by an operator who will not read it closely. If it ships with a
 * variable that has no example value or a footer containing `{{1}}`, THEY
 * get the rejection and have no idea the library gave them a broken start.
 *
 * So every save runs the same `validateTemplatePayload` the submit route
 * runs. The failure lands on the person who can actually fix it.
 */

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

interface Body {
  id?: string;
  category_id?: string;
  slug?: string;
  title?: string;
  description?: string | null;
  emoji?: string | null;
  meta_category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  template_type?: string;
  language?: string;
  header_type?: string | null;
  header_content?: string | null;
  body_text?: string;
  footer_text?: string | null;
  buttons?: unknown;
  sample_values?: unknown;
  tags?: unknown;
  position?: number;
  is_active?: boolean;
}

/** Build the row to write, and validate it as a real Meta payload first. */
function buildRow(body: Body): Record<string, unknown> {
  const metaCategory = body.meta_category ?? 'UTILITY';
  const headerType =
    body.header_type && body.header_type !== 'none' ? body.header_type : null;

  const row: Record<string, unknown> = {
    title: (body.title ?? '').trim(),
    description: body.description?.trim() || null,
    emoji: body.emoji?.trim() || null,
    meta_category: metaCategory,
    template_type: body.template_type || 'default',
    language: (body.language || 'en_US').trim(),
    header_type: headerType,
    header_content: body.header_content?.trim() || null,
    body_text: (body.body_text ?? '').trim(),
    footer_text: body.footer_text?.trim() || null,
    buttons: Array.isArray(body.buttons) && body.buttons.length > 0 ? body.buttons : null,
    sample_values:
      body.sample_values && typeof body.sample_values === 'object'
        ? body.sample_values
        : null,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string')
      : [],
    position: Number.isFinite(Number(body.position)) ? Number(body.position) : 0,
    is_active: body.is_active !== false,
  };

  // Authentication templates have no body of their own — Meta writes it —
  // so the validator is only meaningful for the rest.
  if (metaCategory !== 'AUTHENTICATION') {
    validateTemplatePayload({
      name: 'library_preview', // never submitted; the validator needs a legal name
      category: toAppCategory(metaCategory),
      language: String(row.language),
      header_type: (headerType ?? undefined) as never,
      header_content: (row.header_content ?? undefined) as string | undefined,
      // A library row stores the sample URL, not an uploaded handle, so a
      // media header validates on the URL branch.
      header_media_url: headerType && headerType !== 'text' ? 'https://example.com/sample' : undefined,
      body_text: String(row.body_text),
      footer_text: (row.footer_text ?? undefined) as string | undefined,
      buttons: (row.buttons ?? undefined) as never,
      sample_values: (row.sample_values ?? undefined) as never,
    });
  }

  return row;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const { data, error } = await supabaseAdmin()
      .from('template_library_templates')
      .select('*')
      .order('position');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
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
    const body = (await request.json()) as Body;

    const slug = (body.slug ?? '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json(
        {
          error:
            'The slug is required and may use lowercase letters, numbers and hyphens only.',
        },
        { status: 400 },
      );
    }
    if (!body.category_id) {
      return NextResponse.json({ error: 'Pick a category.' }, { status: 400 });
    }
    if (!(body.title ?? '').trim()) {
      return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
    }

    let row: Record<string, unknown>;
    try {
      row = buildRow(body);
    } catch (e) {
      // The validator's message names the exact rule, so it is passed
      // through rather than replaced with something vaguer.
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid template.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin()
      .from('template_library_templates')
      .insert({ ...row, slug, category_id: body.category_id })
      .select()
      .single();

    if (error) {
      const conflict = error.code === '23505';
      return NextResponse.json(
        {
          error: conflict
            ? `A template with the slug "${slug}" already exists.`
            : error.message,
        },
        { status: conflict ? 409 : 500 },
      );
    }
    return NextResponse.json({ template: data });
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
    const body = (await request.json()) as Body;
    if (!body.id) {
      return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
    }

    let row: Record<string, unknown>;
    try {
      row = buildRow(body);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid template.' },
        { status: 400 },
      );
    }
    if (body.category_id) row.category_id = body.category_id;
    if (body.slug) {
      const slug = body.slug.trim().toLowerCase();
      if (!SLUG_RE.test(slug)) {
        return NextResponse.json(
          { error: 'The slug may use lowercase letters, numbers and hyphens only.' },
          { status: 400 },
        );
      }
      row.slug = slug;
    }

    const { data, error } = await supabaseAdmin()
      .from('template_library_templates')
      .update(row)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data });
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
    const { error } = await supabaseAdmin()
      .from('template_library_templates')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
