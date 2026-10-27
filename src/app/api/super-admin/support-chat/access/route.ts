// ============================================================
// GET /api/super-admin/support-chat/access — every workspace + access
// PUT /api/super-admin/support-chat/access — set one workspace's override
//
// Serves two screens with one list: the access table on the Live chat
// settings page, and the "New message" picker in the Live chat inbox.
//
// GET query:
//   search   — workspace name, owner name or owner email
//   filter   — all | access | no_access | overridden
//   page, pageSize
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import {
  SUPPORT_ACCESS_TABLE,
  listSupportAccessRows,
  loadSupportSettings,
} from '@/lib/support-chat/availability';

export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);

    const search = (searchParams.get('search') ?? '').trim().toLowerCase();
    const filter = searchParams.get('filter') ?? 'all';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get('pageSize')) || 25)
    );

    const admin = supabaseAdmin();
    const settings = await loadSupportSettings(admin);
    let rows = await listSupportAccessRows(admin, settings);

    // Filtered in memory: the searchable text spans the account and its
    // owner's profile, which PostgREST cannot OR across in one filter, and
    // the directory is one row per workspace.
    if (search) {
      rows = rows.filter((r) =>
        [r.accountName, r.owner?.full_name, r.owner?.email]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(search))
      );
    }
    if (filter === 'access') rows = rows.filter((r) => r.access.available);
    else if (filter === 'no_access')
      rows = rows.filter((r) => !r.access.available);
    else if (filter === 'overridden') rows = rows.filter((r) => r.override);

    const total = rows.length;
    const start = (page - 1) * pageSize;

    return NextResponse.json({
      rows: rows.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      settings,
    });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/support-chat/access] GET failed:', err);
    return NextResponse.json(
      { error: 'Could not load workspaces.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireSuperAdmin(request);

    const raw = await request.json().catch(() => null);
    const body = (raw ?? {}) as Record<string, unknown>;
    const accountId =
      typeof body.accountId === 'string' ? body.accountId.trim() : '';
    const choice = body.choice;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required.' },
        { status: 400 }
      );
    }
    if (choice !== 'default' && choice !== 'allow' && choice !== 'deny') {
      return NextResponse.json(
        { error: "choice must be 'default', 'allow' or 'deny'." },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    // "Follow the rule" is the ABSENCE of an override, not a third stored
    // value — so the rule stays the single source of truth for everyone
    // who has not been singled out.
    const { error } =
      choice === 'default'
        ? await admin
            .from(SUPPORT_ACCESS_TABLE)
            .delete()
            .eq('account_id', accountId)
        : await admin.from(SUPPORT_ACCESS_TABLE).upsert(
            {
              account_id: accountId,
              mode: choice,
              // A manual choice replaces an automatic grant's provenance:
              // the operator has now decided explicitly.
              source: 'manual',
              granted_by: userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'account_id' }
          );

    if (error) {
      // 23503 = the account id does not exist.
      const status = error.code === '23503' ? 404 : 500;
      console.error('[super-admin/support-chat/access] PUT failed:', error);
      return NextResponse.json(
        {
          error:
            status === 404
              ? 'That workspace does not exist.'
              : 'Could not save access.',
        },
        { status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/support-chat/access] PUT failed:', err);
    return NextResponse.json(
      { error: 'Could not save access.' },
      { status: 500 }
    );
  }
}
