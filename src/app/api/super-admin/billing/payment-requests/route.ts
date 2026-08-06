// ============================================================
// /api/super-admin/billing/payment-requests
//
// GET   — the review queue: filter by status, search, paginate
// PATCH — approve or reject one request
//
// Super admin only.
//
// Approving is the moment money becomes access, so the ordering in
// `approvePaymentRequest` matters: it claims the request with a
// conditional UPDATE (…WHERE status = 'pending') BEFORE touching the
// account. Two admins working the same queue, or one impatient
// double-click, therefore cannot grant two subscription windows for one
// payment — the loser gets a 409. See lib/subscription/activate.ts.
// ============================================================

import { after, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
} from '@/lib/email/billing';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import {
  approvePaymentRequest,
  rejectPaymentRequest,
  SubscriptionMutationError,
} from '@/lib/subscription/activate';
import { toAmount } from '@/lib/subscription/plans';
import {
  parseDurationOverride,
  ValidationError,
} from '@/lib/subscription/validation';

const PAGE_SIZES = new Set([10, 20, 50, 100]);

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'all';
    const search = (searchParams.get('search') ?? '').trim();
    const sortBy = searchParams.get('sortBy') ?? 'newest';

    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const requestedSize = Number(searchParams.get('pageSize')) || 20;
    const pageSize = PAGE_SIZES.has(requestedSize) ? requestedSize : 20;

    let query = admin
      .from('payment_requests')
      .select('*', { count: 'exact' });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      // Escape PostgREST's `or` filter metacharacters. An unescaped
      // comma would be read as a filter separator and a parenthesis
      // would break the expression — a search for "Pro, Ltd." must not
      // 400 the endpoint.
      const safe = search.replace(/[,()]/g, ' ').trim();
      if (safe) {
        query = query.or(
          [
            `transaction_ref.ilike.%${safe}%`,
            `payer_name.ilike.%${safe}%`,
            `payer_mobile.ilike.%${safe}%`,
            `plan_name_snapshot.ilike.%${safe}%`,
          ].join(','),
        );
      }
    }

    // Pending first by default so the queue self-prioritises: the rows
    // needing action sit at the top regardless of age.
    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sortBy === 'amount') {
      query = query.order('paid_amount', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];

    // Hydrate account + submitter names in two batched lookups rather
    // than a PostgREST embed. Embeds here would need FK relationships
    // resolved from the schema cache, which this project has already
    // been burned by (issue #294) — and `user_id` has no FK to profiles
    // to embed through anyway.
    const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];

    const [accountsRes, profilesRes] = await Promise.all([
      accountIds.length
        ? admin
            .from('accounts')
            .select('id, name, subscription_status, subscription_ends_at')
            .in('id', accountIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? admin.from('profiles').select('user_id, full_name, email').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const accountsById = new Map(
      (accountsRes.data ?? []).map((a: Record<string, unknown>) => [a.id, a]),
    );
    const profilesById = new Map(
      (profilesRes.data ?? []).map((p: Record<string, unknown>) => [p.user_id, p]),
    );

    const requests = rows.map((r) => {
      const account = accountsById.get(r.account_id) as
        | Record<string, unknown>
        | undefined;
      const profile = profilesById.get(r.user_id) as
        | Record<string, unknown>
        | undefined;

      const expected = toAmount(r.expected_amount);
      const paid = toAmount(r.paid_amount);

      return {
        ...r,
        expected_amount: expected,
        paid_amount: paid,
        // Precomputed so the table can flag discrepancies without every
        // client re-deriving the comparison (and possibly on strings).
        amount_matches: Math.abs(expected - paid) < 0.01,
        amount_difference: Math.round((paid - expected) * 100) / 100,
        account_name: (account?.name as string) ?? null,
        account_subscription_status: (account?.subscription_status as string) ?? null,
        account_subscription_ends_at: (account?.subscription_ends_at as string) ?? null,
        submitted_by_name: (profile?.full_name as string) ?? null,
        submitted_by_email: (profile?.email as string) ?? null,
      };
    });

    // Status tallies for the tab badges. Head-only counts, so this adds
    // no row transfer.
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      admin.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      admin.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);

    return NextResponse.json({
      requests,
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      counts: {
        pending: pendingCount.count ?? 0,
        approved: approvedCount.count ?? 0,
        rejected: rejectedCount.count ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/payment-requests] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load payment requests' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const adminCtx = await requireSuperAdmin(request);

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const note =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

    if (!id) {
      return NextResponse.json({ error: 'Request id is required' }, { status: 400 });
    }

    if (action === 'approve') {
      // Optional override: grant something other than the purchased
      // cycle. Omitted -> the duration snapshotted at submit time.
      const durationOverride = parseDurationOverride(body);

      const { request: updated, activation } = await approvePaymentRequest({
        requestId: id,
        actorUserId: adminCtx.userId,
        durationOverride,
        note,
      });

      // Scheduled after the response, and deliberately NOT awaited
      // inside the mutation.
      //
      // By this line the request is claimed and the subscription window
      // is granted — both committed. If a mail failure could propagate
      // it would surface to the reviewing admin as "approval failed" for
      // work that actually succeeded; they would press Approve again and
      // hit the 409 from the claim guard, with no way to tell whether
      // the customer got access. Email is therefore best-effort and its
      // failures live in the logs, not in this response.
      after(async () => {
        await sendPaymentApprovedEmail({
          accountId: updated.account_id,
          submitterUserId: updated.user_id,
          planName: updated.plan_name_snapshot,
          cycleLabel: updated.cycle_label_snapshot,
          paidAmount: updated.paid_amount,
          currency: updated.currency,
          transactionRef: updated.transaction_ref,
          payerName: updated.payer_name,
          startsAt: activation.startsAt,
          endsAt: activation.endsAt,
          extended: activation.extended,
          reviewNote: updated.review_note,
        });
      });

      return NextResponse.json({
        request: updated,
        activation: {
          startsAt: activation.startsAt.toISOString(),
          endsAt: activation.endsAt.toISOString(),
          extended: activation.extended,
        },
      });
    }

    if (action === 'reject') {
      if (!note) {
        // The note becomes the customer-visible reason. Approving
        // silently is fine; rejecting silently leaves them with no idea
        // what to fix and guarantees a support ticket.
        return NextResponse.json(
          {
            error: 'Add a short reason for the rejection — the customer sees it.',
            field: 'note',
          },
          { status: 400 },
        );
      }

      const updated = await rejectPaymentRequest({
        requestId: id,
        actorUserId: adminCtx.userId,
        note,
      });

      // The rejection reason is mandatory above precisely so this email
      // can explain itself. Sent after the response for the same reason
      // as the approval path: the claim is already committed.
      after(async () => {
        await sendPaymentRejectedEmail({
          accountId: updated.account_id,
          submitterUserId: updated.user_id,
          planName: updated.plan_name_snapshot,
          cycleLabel: updated.cycle_label_snapshot,
          expectedAmount: updated.expected_amount,
          paidAmount: updated.paid_amount,
          currency: updated.currency,
          transactionRef: updated.transaction_ref,
          payerName: updated.payer_name,
          reviewNote: updated.review_note,
        });
      });

      return NextResponse.json({ request: updated });
    }

    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof SubscriptionMutationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/payment-requests] PATCH failed:', err);
    return NextResponse.json(
      { error: 'Failed to review the payment request' },
      { status: 500 },
    );
  }
}
