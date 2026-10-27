// ============================================================
// GET /api/super-admin/support-chat/conversations
//
// The operator's inbox list. Super-admin only, and unlike the shared
// message routes this one is operator-exclusive, so it uses the standard
// `requireSuperAdmin` guard rather than the dual-audience resolver.
//
// Accounts with no support thread yet are NOT listed. A conversation row
// is created lazily when someone first opens the pane, so an empty inbox
// genuinely means nobody has asked for help — rather than listing every
// workspace on the platform as a blank thread.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  SUPPORT_CONVERSATIONS_TABLE,
  type SupportAuthor,
  type SupportConversationWithAccount,
} from '@/lib/support-chat/types';
import {
  getSupportAccessForAccounts,
  loadSupportSettings,
} from '@/lib/support-chat/availability';

export const dynamic = 'force-dynamic';

/**
 * PATCH — open or close a thread.
 *
 * Closing is a triage marker, not an archive: the row, its messages and
 * its unread counters are untouched, and a customer writing again reopens
 * it automatically (see the note in the handler). Operator-only, because
 * the tenant has no concept of a "closed" support thread — from their side
 * the pane always works, which is the point.
 */
export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin(request);

    const raw = await request.json().catch(() => null);
    const body = (raw ?? {}) as Record<string, unknown>;

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const status = body.status;

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    }
    if (status !== 'open' && status !== 'closed') {
      return NextResponse.json(
        { error: "status must be 'open' or 'closed'." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from(SUPPORT_CONVERSATIONS_TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[super-admin/support-chat] status update failed:', error);
      return NextResponse.json(
        { error: 'Could not update the conversation.' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'That conversation does not exist.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ conversation: data });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/support-chat] PATCH failed:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') ?? '').trim().toLowerCase();
    const unreadOnly = searchParams.get('unread') === '1';
    // `all` rather than defaulting to open: an operator arriving at the
    // inbox should see everything until they choose to narrow it.
    const statusFilter = searchParams.get('status') ?? 'all';

    const admin = supabaseAdmin();

    // The account name is JOINED rather than denormalised onto the
    // conversation: a renamed workspace must not leave a stale name
    // sitting in the operator's inbox.
    let query = admin
      .from(SUPPORT_CONVERSATIONS_TABLE)
      .select('*, account:accounts!inner(id, name)')
      // NULLS LAST so a thread created but never used sorts to the
      // bottom instead of the top.
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (unreadOnly) query = query.gt('unread_for_admin', 0);

    const { data, error } = await query;

    if (error) {
      console.error('[super-admin/support-chat] list failed:', error);
      return NextResponse.json(
        { error: `Could not load conversations: ${error.message}` },
        { status: 500 }
      );
    }

    type Row = Record<string, unknown> & {
      account?: { id: string; name: string | null } | null;
    };

    const rows = (data ?? []) as Row[];

    // Member rosters for every listed workspace, in one query rather than
    // one per thread. Feeds the presence dots on the operator's side —
    // presence is keyed by user_id, and the operator cannot read another
    // account's profiles through RLS.
    const membersByAccount = new Map<string, SupportAuthor[]>();
    const ownerByAccount = new Map<string, SupportAuthor>();
    const accountIds = [
      ...new Set(rows.map((r) => r.account?.id).filter(Boolean) as string[]),
    ];
    if (accountIds.length > 0) {
      const { data: profiles, error: membersErr } = await admin
        .from('profiles')
        .select(
          'user_id, account_id, full_name, email, avatar_url, account_role'
        )
        .in('account_id', accountIds);
      if (membersErr) {
        // The list is still useful without presence, so this degrades
        // rather than failing the request.
        console.error(
          '[super-admin/support-chat] member read failed:',
          membersErr
        );
      } else {
        for (const p of profiles ?? []) {
          const accountId = p.account_id as string;
          const author: SupportAuthor = {
            user_id: p.user_id as string,
            full_name: (p.full_name as string | null) ?? null,
            email: (p.email as string | null) ?? null,
            avatar_url: (p.avatar_url as string | null) ?? null,
          };
          const bucket = membersByAccount.get(accountId) ?? [];
          bucket.push(author);
          membersByAccount.set(accountId, bucket);

          if (p.account_role === 'owner' && !ownerByAccount.has(accountId)) {
            ownerByAccount.set(accountId, author);
          }
        }
      }
    }

    // Whether each workspace can currently SEE its thread, so the operator
    // knows when a reply would land somewhere the customer cannot open.
    // Same rule function the CRM uses.
    const settings = await loadSupportSettings(admin);
    const accessByAccount = await getSupportAccessForAccounts(
      admin,
      accountIds,
      settings
    );

    let conversations: SupportConversationWithAccount[] = rows.map((row) => {
      const { account, ...rest } = row;
      const access = account?.id ? accessByAccount.get(account.id) : undefined;
      return {
        ...(rest as unknown as SupportConversationWithAccount),
        account_name: account?.name ?? null,
        members: account?.id ? (membersByAccount.get(account.id) ?? []) : [],
        owner: account?.id ? (ownerByAccount.get(account.id) ?? null) : null,
        access: access
          ? { available: access.available, reason: access.reason }
          : null,
      };
    });

    // Filtered in memory rather than in the query: the searchable text is
    // the joined account name plus the preview, and an `.or()` across an
    // embedded relation is not expressible in PostgREST. The row count
    // here is one per paying workspace, so this stays cheap.
    if (search) {
      conversations = conversations.filter(
        (c) =>
          (c.account_name ?? '').toLowerCase().includes(search) ||
          (c.last_message_preview ?? '').toLowerCase().includes(search)
      );
    }

    // Counts are computed BEFORE the status filter is applied, so the
    // tiles keep showing both totals while one of them is selected. Tiles
    // that changed to reflect their own filter would make it impossible to
    // switch back by reading the screen.
    const counts = {
      open: conversations.filter((c) => c.status === 'open').length,
      closed: conversations.filter((c) => c.status === 'closed').length,
      total: conversations.length,
    };

    if (statusFilter === 'open' || statusFilter === 'closed') {
      conversations = conversations.filter((c) => c.status === statusFilter);
    }

    const totalUnread = conversations.reduce(
      (sum, c) => sum + (c.unread_for_admin || 0),
      0
    );

    return NextResponse.json({
      conversations,
      counts,
      total_unread: totalUnread,
      chat_enabled: settings.enabled,
    });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/support-chat] GET failed:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
