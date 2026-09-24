// ============================================================
// PATCH / DELETE /api/super-admin/sheets-addon/links/[id]
//
// Edit or remove one Get Support / Resources button.
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Expected a JSON body' },
        { status: 400 }
      );
    }

    const patch = buildHelpLinkPatch(body, { isCreate: false });

    const { data, error } = await supabaseAdmin()
      .from(HELP_LINKS_TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[super-admin/sheets-addon/links] update failed:', error);
      return NextResponse.json(
        {
          error: `Could not update the link: ${error.message}`,
          code: 'help_link_update_failed',
        },
        { status: 500 }
      );
    }

    // maybeSingle + a null row is how a bad id surfaces here, since the
    // update itself succeeds against zero rows.
    if (!data) {
      return NextResponse.json(
        { error: 'That link no longer exists.', code: 'help_link_not_found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ link: data });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/links/[id]] PATCH failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'link_patch_failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;

    const { data, error } = await supabaseAdmin()
      .from(HELP_LINKS_TABLE)
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[super-admin/sheets-addon/links] delete failed:', error);
      return NextResponse.json(
        {
          error: `Could not delete the link: ${error.message}`,
          code: 'help_link_delete_failed',
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'That link no longer exists.', code: 'help_link_not_found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/sheets-addon/links/[id]] DELETE failed:', err);
    return NextResponse.json(
      { error: (err as Error).message, code: 'link_delete_failed' },
      { status: 500 }
    );
  }
}
