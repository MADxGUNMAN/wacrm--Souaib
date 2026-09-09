// ============================================================
// GET /api/super-admin/billing/events
//
// The platform-wide subscription audit trail: every payment AND every
// manual admin action, newest first, in one list.
//
// Super admin only.
//
// ─── Why this route exists ───────────────────────────────────────
//
// `subscription_events` has been written faithfully since the billing
// system shipped — `logSubscriptionEvent` fires on all nine event kinds,
// including manual grants, revokes and expiries. `listSubscriptionEvents`
// was even written to read it back. But nothing ever called that reader,
// so the entire trail was invisible: approving a payment left a visible
// row in the requests queue, while granting a year of access by hand left
// no trace anywhere in the UI. The data was never missing, only unread.
//
// ─── The distinction the UI actually needs ───────────────────────
//
// `subscription_activated` means two very different things depending on
// whether `payment_request_id` is set:
//
//   set   → a customer paid and an admin approved it
//   null  → an admin granted access by hand, no money involved
//
// That is the difference between revenue and a comp, and it is invisible
// in `event_type` alone. So `source` is derived here rather than left for
// the client to infer, keeping one definition of "was this paid for".
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

/** Event kinds that only ever come from the payment flow. */
const PAYMENT_EVENTS = new Set([
  'payment_submitted',
  'payment_approved',
  'payment_rejected',
]);

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') ?? 'all';
    const sourceFilter = searchParams.get('source') ?? 'all';
    const accountId = searchParams.get('accountId');
    const search = (searchParams.get('search') ?? '').trim();
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(5, Number(searchParams.get('pageSize')) || 25)
    );

    // ---- Resolve the account/actor directories once ----
    //
    // Two small lookups beat a join here: `subscription_events` has no FK
    // to `profiles` (the actor may be a super admin outside the account),
    // and the row count is low enough that fetching both maps once is
    // cheaper than a per-row embed.
    const [accountsRes, profilesRes] = await Promise.all([
      admin.from('accounts').select('id, name, owner_user_id'),
      admin
        .from('profiles')
        .select('user_id, full_name, email, is_super_admin'),
    ]);

    if (accountsRes.error) {
      return NextResponse.json(
        { error: accountsRes.error.message },
        { status: 500 }
      );
    }

    const accountsById = new Map(
      (accountsRes.data ?? []).map((a) => [a.id as string, a])
    );
    const profilesById = new Map(
      (profilesRes.data ?? []).map((p) => [p.user_id as string, p])
    );

    // Exclude the platform's own workspaces, for the same reason the
    // subscribers list does: a super admin's workspace can never be gated
    // or billed, so its events are noise in a revenue audit trail.
    const superAdminOwned = new Set(
      (accountsRes.data ?? [])
        .filter((a) => {
          const owner = profilesById.get(a.owner_user_id as string);
          return owner?.is_super_admin === true;
        })
        .map((a) => a.id as string)
    );

    let query = admin
      .from('subscription_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (accountId) query = query.eq('account_id', accountId);
    if (typeFilter !== 'all') query = query.eq('event_type', typeFilter);

    // Over-fetch, because `source` and the text search are both derived
    // in memory and cannot be expressed in this query. Capped so a large
    // trail can never pull the whole table.
    const { data, error } = await query.limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const term = search.toLowerCase();

    const mapped = (data ?? [])
      .filter((row) => !superAdminOwned.has(row.account_id as string))
      .map((row) => {
        const account = accountsById.get(row.account_id as string);
        const actor = row.actor_user_id
          ? profilesById.get(row.actor_user_id as string)
          : null;
        const owner = account
          ? profilesById.get(account.owner_user_id as string)
          : null;

        const isPaymentEvent = PAYMENT_EVENTS.has(row.event_type as string);
        const source: 'payment' | 'manual' =
          isPaymentEvent || row.payment_request_id ? 'payment' : 'manual';

        return {
          id: row.id as string,
          accountId: row.account_id as string,
          accountName: (account?.name as string) ?? 'Deleted workspace',
          ownerEmail: (owner?.email as string) ?? null,
          eventType: row.event_type as string,
          source,
          fromStatus: (row.from_status as string) ?? null,
          toStatus: (row.to_status as string) ?? null,
          endsAt: (row.ends_at as string) ?? null,
          planName: (row.plan_name as string) ?? null,
          cycleLabel: (row.cycle_label as string) ?? null,
          amount: row.amount == null ? null : Number(row.amount),
          paymentRequestId: (row.payment_request_id as string) ?? null,
          // Migration 081 — how much time, on which window, replacing what.
          durationMonths:
            row.duration_months == null ? null : Number(row.duration_months),
          durationDays:
            row.duration_days == null ? null : Number(row.duration_days),
          previousEndsAt: (row.previous_ends_at as string) ?? null,
          windowKind: (row.window_kind as 'paid' | 'trial' | null) ?? null,
          // Naming the actor is the whole point of an audit trail. A null
          // actor is a system event (nothing did it on a person's behalf),
          // which is different from "we don't know who".
          actorName:
            (actor?.full_name as string) ||
            (actor?.email as string) ||
            (row.actor_user_id ? 'Unknown user' : null),
          actorIsSuperAdmin: actor?.is_super_admin === true,
          note: (row.note as string) ?? null,
          createdAt: row.created_at as string,
        };
      })
      .filter((e) =>
        sourceFilter === 'all' ? true : e.source === sourceFilter
      )
      .filter((e) =>
        term
          ? e.accountName.toLowerCase().includes(term) ||
            (e.ownerEmail ?? '').toLowerCase().includes(term) ||
            (e.actorName ?? '').toLowerCase().includes(term) ||
            (e.planName ?? '').toLowerCase().includes(term) ||
            (e.note ?? '').toLowerCase().includes(term)
          : true
      );

    // Counts describe the FILTERED set minus paging, so the tiles agree
    // with what the table is showing rather than with the whole table.
    const counts = {
      total: mapped.length,
      payment: mapped.filter((e) => e.source === 'payment').length,
      manual: mapped.filter((e) => e.source === 'manual').length,
    };

    const start = (page - 1) * pageSize;
    const events = mapped.slice(start, start + pageSize);

    return NextResponse.json({
      events,
      counts,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(mapped.length / pageSize)),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/events] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load the subscription history' },
      { status: 500 }
    );
  }
}
