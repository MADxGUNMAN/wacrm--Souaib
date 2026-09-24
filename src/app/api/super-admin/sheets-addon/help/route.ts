// ============================================================
// GET / PUT /api/super-admin/sheets-addon/help
//
// Read and edit the singleton that supplies every string in the Google
// Sheets add-on's Help & Support dialog.
//
// PUT WHITELISTS FIELDS INSTEAD OF SPREADING THE BODY
// The sibling cms/settings route does `{ ...body }` straight into the
// row. That is convenient and wrong: it lets a caller write any column
// that exists, including ones a later migration adds, and it silently
// accepts typo'd keys instead of reporting them. `buildHelpSettingsPatch`
// accepts only known fields and validates each one.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { ValidationError } from '@/lib/subscription/validation';
import {
  buildHelpSettingsPatch,
  HELP_LINKS_TABLE,
  HELP_SETTINGS_TABLE,
} from '@/lib/sheets-addon/help';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    // The editor needs every link, including disabled ones and ones with
    // a blank URL — unlike the public endpoint, which hides both.
    const [settingsResult, linksResult] = await Promise.all([
      admin.from(HELP_SETTINGS_TABLE).select('*').limit(1).maybeSingle(),
      admin
        .from(HELP_LINKS_TABLE)
        .select('*')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    if (settingsResult.error) {
      return NextResponse.json(
        {
          error: `Could not read help settings: ${settingsResult.error.message}`,
          code: 'help_settings_read_failed',
        },
        { status: 500 }
      );
    }
    if (linksResult.error) {
      return NextResponse.json(
        {
          error: `Could not read help links: ${linksResult.error.message}`,
          code: 'help_links_read_failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: settingsResult.data,
      links: linksResult.data ?? [],
    });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/help] GET failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'help_get_failed' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
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

    const patch = buildHelpSettingsPatch(body);
    const admin = supabaseAdmin();

    const { data: existing, error: readError } = await admin
      .from(HELP_SETTINGS_TABLE)
      .select('id')
      .limit(1)
      .maybeSingle();

    if (readError) {
      return NextResponse.json(
        {
          error: `Could not read help settings: ${readError.message}`,
          code: 'help_settings_read_failed',
        },
        { status: 500 }
      );
    }

    // A missing row means the migration did not run. Insert rather than
    // fail, so the page is usable, but the unique index still guarantees
    // we cannot end up with two.
    const { data, error } = existing
      ? await admin
          .from(HELP_SETTINGS_TABLE)
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .single()
      : await admin
          .from(HELP_SETTINGS_TABLE)
          .insert(patch)
          .select('*')
          .single();

    if (error) {
      console.error('[super-admin/sheets-addon/help] write failed:', error);
      return NextResponse.json(
        {
          error: `Could not save help settings: ${error.message}`,
          code: 'help_settings_write_failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/help] PUT failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'help_put_failed' },
      { status: 500 }
    );
  }
}
