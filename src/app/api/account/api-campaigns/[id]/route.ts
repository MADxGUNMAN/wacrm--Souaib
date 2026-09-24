// ============================================================
// /api/account/api-campaigns/[id]
//
//   PATCH  — rename, or flip status between 'active' and 'paused'.
//   DELETE — remove the campaign definition.
//
// Deleting is intentionally cheap: `broadcasts.api_campaign_id` is
// ON DELETE SET NULL (migration 20260912100000), so removing a campaign
// here can never delete the messages or conversations it already
// produced — only the reusable definition future sends would go through.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

const MAX_NAME_LEN = 80;

const SELECT_COLUMNS =
  'id, account_id, created_by, name, template_name, template_language, status, created_at, updated_at';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getCurrentAccount();

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      status?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return NextResponse.json(
          { error: "'name' cannot be empty" },
          { status: 400 }
        );
      }
      if (name.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `Name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400 }
        );
      }
      update.name = name;
    }

    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'paused') {
        return NextResponse.json(
          { error: "'status' must be 'active' or 'paused'" },
          { status: 400 }
        );
      }
      update.status = body.status;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update — send name and/or status' },
        { status: 400 }
      );
    }

    // Scoped by account_id as well as id, even though RLS already
    // enforces this — a query that could not possibly touch another
    // tenant's row even if the RLS policy were ever misconfigured is
    // worth the one extra clause.
    const { data, error } = await ctx.supabase
      .from('api_campaigns')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: `An API campaign named "${update.name}" already exists.`,
          },
          { status: 409 }
        );
      }
      console.error('[PATCH /api/account/api-campaigns/[id]] error:', error);
      return NextResponse.json(
        { error: 'Failed to update the API campaign' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ campaign: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getCurrentAccount();

    const { error, count } = await ctx.supabase
      .from('api_campaigns')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('account_id', ctx.accountId);

    if (error) {
      console.error('[DELETE /api/account/api-campaigns/[id]] error:', error);
      return NextResponse.json(
        { error: 'Failed to delete the API campaign' },
        { status: 500 }
      );
    }
    if (!count) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
