// ============================================================
// /api/account/api-campaigns
//
//   GET  — list this account's API campaigns.
//   POST — create one (name + template).
//
// Dashboard endpoints: cookie session, RLS-scoped client via
// `getCurrentAccount()`. Any account member can list and create — same
// tier as launching an ordinary broadcast (`canSendMessages` returns
// true for both roles; RLS mirrors it with `is_account_member(...,
// 'agent')`, which owner and member both satisfy under the simplified
// role system). There is no owner-only gate here because a campaign is
// operational, not settings-class — unlike minting an API key, it grants
// no new capability, it just names a template so an existing key can
// send through it.
//
// Deliberately tiny, matching plan §2.7 / §5.1: a campaign IS a name
// bound to a template. Nothing else is configurable from this route.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

const MAX_NAME_LEN = 80;

// Columns the dashboard needs. Nothing sensitive lives on this row, so
// there is no SAFE_COLUMNS narrowing the way api_keys has for key_hash.
const SELECT_COLUMNS =
  'id, account_id, created_by, name, template_name, template_language, status, created_at, updated_at';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from('api_campaigns')
      .select(SELECT_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/account/api-campaigns] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load API campaigns' },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaigns: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      template_name?: unknown;
      template_language?: unknown;
    } | null;

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { error: "'name' is required" },
        { status: 400 }
      );
    }
    if (name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME_LEN} characters or fewer` },
        { status: 400 }
      );
    }

    const templateName =
      typeof body?.template_name === 'string' ? body.template_name.trim() : '';
    if (!templateName) {
      return NextResponse.json(
        { error: "'template_name' is required" },
        { status: 400 }
      );
    }

    const templateLanguage =
      typeof body?.template_language === 'string' &&
      body.template_language.trim()
        ? body.template_language.trim()
        : 'en_US';

    // Confirm the template exists, belongs to this account, and is
    // actually approved — the same guard the broadcast wizard applies.
    // Without this a campaign could point at a draft or a typo'd name,
    // and every future send through it would fail at Meta with no
    // indication the campaign itself was ever set up wrong.
    const { data: templateRow, error: templateError } = await ctx.supabase
      .from('message_templates')
      .select('id, status')
      .eq('account_id', ctx.accountId)
      .eq('name', templateName)
      .eq('language', templateLanguage)
      .maybeSingle();

    if (templateError) {
      console.error(
        '[POST /api/account/api-campaigns] template lookup error:',
        templateError
      );
      return NextResponse.json(
        { error: 'Failed to verify the template' },
        { status: 500 }
      );
    }
    if (!templateRow) {
      return NextResponse.json(
        {
          error: `No template named "${templateName}" (${templateLanguage}) was found on this account.`,
        },
        { status: 400 }
      );
    }
    if (templateRow.status !== 'APPROVED') {
      return NextResponse.json(
        {
          error: `"${templateName}" is not yet approved by Meta (status: ${templateRow.status ?? 'unknown'}). A campaign can only be built on an approved template.`,
        },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('api_campaigns')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        name,
        template_name: templateName,
        template_language: templateLanguage,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      // UNIQUE (account_id, name) — the add-on's rule wizard picks a
      // campaign BY NAME, so two campaigns sharing a name inside one
      // account would make a stored rule permanently ambiguous. Named
      // explicitly rather than left as a generic 500, since it is the
      // one failure here an operator can actually act on.
      if (error?.code === '23505') {
        return NextResponse.json(
          { error: `An API campaign named "${name}" already exists.` },
          { status: 409 }
        );
      }
      console.error('[POST /api/account/api-campaigns] insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create the API campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
