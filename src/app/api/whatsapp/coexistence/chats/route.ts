import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';

/**
 * ─── Why the DATA queries use the service role ────────────────
 *
 * `conversations` RLS is deliberately narrow:
 *
 *   USING (CASE WHEN <caller is owner> THEN true
 *               ELSE assigned_agent_id = auth.uid() END)
 *
 * Imported chats have no assigned agent, so under the caller's own
 * credentials an ADMIN can neither see nor update a single one of them —
 * every approval would report success and change nothing, which is the
 * worst kind of bug to ship.
 *
 * So authentication and the role check run on the caller's client, and only
 * then do the reads and writes go through the service role. Every one of
 * them is filtered by `account_id = resolved.accountId`, which is what
 * replaces the tenancy guarantee RLS would otherwise provide. That filter
 * is not optional — dropping it is a cross-tenant data leak.
 */

/**
 * Reviewing the CHATS coexistence handed over.
 *
 * ─── Why a review step exists at all ──────────────────────────
 *
 * Connecting a coexistence number delivers up to six months of the
 * phone's chat history. It used to land straight in the inbox: on the
 * reference account that was 69 conversations and 7,533 messages
 * appearing unannounced, personal chats included ("Mummy", and a
 * six-week 6,920-message thread), with no indication of what was
 * arriving, how much of it there was, or any way to choose.
 *
 * ─── Why this is not a "fetch in batches" endpoint ────────────
 *
 * Meta PUSHES history, once, inside a 24-hour window after onboarding.
 * It cannot be requested incrementally and it cannot be replayed. So
 * there is no version of this where the client asks Meta for ten chats
 * at a time — refusing a chunk loses it forever.
 *
 * What IS batched is the DECISION. Everything Meta sends is stored
 * immediately and parked as `pending_review`; this endpoint lets an
 * operator approve or reject it in slices, with exact counts of what is
 * left. That is the same shape as the staged-contacts flow next door,
 * for the same reason.
 *
 * GET  — list chats awaiting a decision, paged, with counts
 * POST — approve / reject, by id or in bulk
 */

const PAGE_SIZE = 50;

/** One bulk request's worth. Bounded so the route cannot time out. */
const BULK_BATCH_SIZE = 200;

async function resolveAccount(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized' as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, account_role, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return {
      error: 'Your profile is not linked to an account.' as const,
      status: 403,
    };
  }

  return {
    accountId,
    userId: user.id,
    role: profile?.account_role as string | undefined,
  };
}

/**
 * How many chats sit in each state.
 *
 * Returned with every response, because after any action every number on
 * screen can change and the alternative is the client re-deriving them
 * from a single capped page — which is exactly how the contacts dialog
 * ended up reporting "200" when 1,788 rows were parked.
 */
async function stateCounts(
  accountId: string
): Promise<{ pending: number; live: number; rejected: number }> {
  const forState = async (state: string) => {
    const { count } = await supabaseAdmin()
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('import_state', state);
    return count ?? 0;
  };

  const [pending, live, rejected] = await Promise.all([
    forState('pending_review'),
    forState('live'),
    forState('rejected'),
  ]);

  return { pending, live, rejected };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveAccount(supabase);
  if ('error' in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state') ?? 'pending_review';
  const allowed = ['pending_review', 'rejected', 'live'];
  if (!allowed.includes(state)) {
    return NextResponse.json(
      { error: `state must be one of: ${allowed.join(', ')}` },
      { status: 400 }
    );
  }

  const offsetRaw = Number.parseInt(searchParams.get('offset') ?? '0', 10);
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  // The message count per chat is the single most useful thing on this
  // screen — it is how an operator tells a real customer thread from a
  // one-message wrong number without opening either.
  const { data, count, error } = await supabaseAdmin()
    .from('conversations')
    // `messages!messages_conversation_id_fkey` — the FK MUST be named.
    //
    // There are two relationships between these tables: messages.
    // conversation_id -> conversations.id (the one we want) and
    // conversations.pinned_message_id -> messages.id. A bare `messages(count)`
    // is ambiguous and PostgREST rejects the whole request with PGRST201,
    // so the list would have come back empty with a 300.
    .select(
      'id, last_message_text, last_message_at, created_at, contact:contacts(id, name, phone), messages!messages_conversation_id_fkey(count)',
      { count: 'exact' }
    )
    .eq('account_id', resolved.accountId)
    .eq('import_state', state)
    // Busiest first. Reviewing 69 chats, the ones worth keeping are almost
    // always the ones with the most traffic, so putting them first means the
    // decisions that matter get made while attention is still fresh.
    .order('last_message_at', { ascending: false, nullsFirst: false })
    // Total order for stable paging: last_message_at ties are common (a
    // whole import can share a timestamp) and offset paging over an
    // unstable sort silently skips and repeats rows.
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json(
      { error: `Could not load imported chats: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    chats: (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const messages = r.messages as { count: number }[] | undefined;
      return {
        id: r.id,
        last_message_text: r.last_message_text,
        last_message_at: r.last_message_at,
        contact: r.contact,
        // Flattened out of PostgREST's aggregate shape so the client does
        // not have to know it arrives as `[{count: n}]`.
        message_count: messages?.[0]?.count ?? 0,
      };
    }),
    total: count ?? 0,
    page_size: PAGE_SIZE,
    offset,
    has_more: offset + (data?.length ?? 0) < (count ?? 0),
    counts: await stateCounts(resolved.accountId),
  });
}

type ChatAction = 'approve' | 'reject' | 'approve_all';

interface ChatReviewBody {
  ids?: string[];
  action?: ChatAction;
}

/**
 * Which states an action may act on.
 *
 * `approve` accepts 'rejected' as well as 'pending_review' so changing
 * your mind never requires an un-reject step first. `reject` only accepts
 * 'pending_review': "rejecting" a chat that is already live would hide a
 * conversation someone may be mid-way through, which is a different and
 * more disruptive operation than declining an import.
 *
 * ── Why there is no `reject_all` ──
 *
 * Same reason the contacts route has no `skip_all`. One click would park
 * every imported chat, the review list only shows what is pending, and the
 * screen would read as empty — making an entire chat history look
 * permanently gone when Meta cannot resend it. Bulk APPROVE is safe
 * because it is additive and reversible; bulk reject is neither.
 */
const ALLOWED_SOURCE_STATE: Record<ChatAction, string[]> = {
  approve: ['pending_review', 'rejected'],
  reject: ['pending_review'],
  approve_all: ['pending_review'],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveAccount(supabase);
  if ('error' in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }

  // Admin-only, matching the contacts review. Deciding which chats exist in
  // the shared inbox is a settings-class call, not day-to-day agent work.
  if (resolved.role !== 'owner' && resolved.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an owner or admin can review imported chats.' },
      { status: 403 }
    );
  }

  let body: ChatReviewBody;
  try {
    body = (await request.json()) as ChatReviewBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (!action || !(action in ALLOWED_SOURCE_STATE)) {
    return NextResponse.json(
      {
        error:
          "action must be 'approve', 'reject' or 'approve_all'" +
          " ('reject_all' is deliberately not offered — see the note in this route)",
      },
      { status: 400 }
    );
  }

  const isBulk = action === 'approve_all';
  if (!isBulk && (!Array.isArray(body.ids) || body.ids.length === 0)) {
    return NextResponse.json(
      { error: 'ids is required for a single-row action' },
      { status: 400 }
    );
  }

  // Always scoped to the caller's account AND to the states this action may
  // touch, so a stale tab replaying an old id list cannot re-decide a chat
  // or hide one that has since gone live.
  let rowQuery = supabaseAdmin()
    .from('conversations')
    .select('id')
    .eq('account_id', resolved.accountId)
    .in('import_state', ALLOWED_SOURCE_STATE[action]);

  if (isBulk) {
    rowQuery = rowQuery
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(BULK_BATCH_SIZE);
  } else {
    rowQuery = rowQuery.in('id', body.ids!);
  }

  const { data: rows, error: rowError } = await rowQuery;
  if (rowError) {
    return NextResponse.json(
      { error: `Could not read imported chats: ${rowError.message}` },
      { status: 500 }
    );
  }

  if (!rows || rows.length === 0) {
    // `remaining: 0` is what stops the client's batch loop; without it a
    // double-click could spin forever on an empty queue.
    return NextResponse.json({
      approved: 0,
      rejected: 0,
      remaining: 0,
      counts: await stateCounts(resolved.accountId),
      unchanged: true,
    });
  }

  const nextState = action === 'reject' ? 'rejected' : 'live';
  const ids = rows.map((r) => (r as { id: string }).id);

  const { error: updateError } = await supabaseAdmin()
    .from('conversations')
    .update({ import_state: nextState, updated_at: new Date().toISOString() })
    // Account filter is load-bearing, not defensive: the service role has no
    // RLS, so this is the only thing scoping the write to one tenant.
    .eq('account_id', resolved.accountId)
    .in('id', ids);

  if (updateError) {
    return NextResponse.json(
      { error: `Could not ${action}: ${updateError.message}` },
      { status: 500 }
    );
  }

  const counts = await stateCounts(resolved.accountId);

  return NextResponse.json({
    approved: nextState === 'live' ? ids.length : 0,
    rejected: nextState === 'rejected' ? ids.length : 0,
    remaining: counts.pending,
    counts,
  });
}
