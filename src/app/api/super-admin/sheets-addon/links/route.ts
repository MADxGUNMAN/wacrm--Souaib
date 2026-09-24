// ============================================================
// GET / POST /api/super-admin/sheets-addon/links
//
// The Get Support and Resources buttons in the add-on dialog.
//
// Rows rather than columns so an operator can add a demo-booking link,
// drop one, or reorder them without a migration or a deploy.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { ValidationError } from '@/lib/subscription/validation';
import { buildHelpLinkPatch, HELP_LINKS_TABLE } from '@/lib/sheets-addon/help';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { data, error } = await supabaseAdmin()
      .from(HELP_LINKS_TABLE)
      .select('*')
      .order('section', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: `Could not read help links: ${error.message}`,
          code: 'help_links_read_failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ links: data ?? [] });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/links] GET failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'links_get_failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Expected a JSON body' },
        { status: 400 }
      );
    }

    const patch = buildHelpLinkPatch(body, { isCreate: true });
    const admin = supabaseAdmin();

    // Append to the end of its section by default, so a new row does not
    // land in the middle of a deliberate order.
    if (patch.sort_order === undefined) {
      const { data: last } = await admin
        .from(HELP_LINKS_TABLE)
        .select('sort_order')
        .eq('section', patch.section!)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.sort_order = (last?.sort_order ?? 0) + 10;
    }

    const { data, error } = await admin
      .from(HELP_LINKS_TABLE)
      .insert(patch)
      .select('*')
      .single();

    if (error) {
      console.error('[super-admin/sheets-addon/links] insert failed:', error);
      return NextResponse.json(
        {
          error: `Could not create the link: ${error.message}`,
          code: 'help_link_create_failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ link: data }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/links] POST failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'links_post_failed' },
      { status: 500 }
    );
  }
}
