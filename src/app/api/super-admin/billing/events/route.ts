// ============================================================
// GET /api/super-admin/billing/events
//
// The platform-wide billing audit trail (subscription_events), newest
// first, with HOW each entry happened. Super admin only. Read-only.
//
// ─── Why the channel is derived here ─────────────────────────────
//
// This route used to derive a binary `source: 'payment' | 'manual'`
// from the event type alone, so every Razorpay AutoPay event read
// "Manual" and a manual UPI payment looked like an admin grant. Each row
// is now classified by classifyBillingEvent (src/lib/billing/event-
// channel.ts) from its stored `source`, its Razorpay / payment-request
// links and its actor, so the Activity log, the Manage dialog and the
// AutoPay drawer share one definition.
//
// Query:
//   channel   all | razorpay | manual_upi | admin | customer | system
//   type      all | one SubscriptionEventType
//   mode      all | live | test   (Razorpay mode; other rows have none)
//   since     all | 7d | 30d | 90d
//   search    workspace, owner email, initiator, plan, note, sub_/pay_ id, UTR
//   accountId one workspace (UUID)
//   page, pageSize (5..100, default 20)
// Invalid values answer 400 rather than silently showing everything.
//
// Response: { events, counts: { total, byChannel }, page, pageSize,
// totalPages, truncated }. `byChannel` counts rows matching every filter
// except channel, so the tiles agree with the table. Rows are read in
// chunks (fetchAllRows) instead of one `.limit(1000)`, which used to cap
// counts and pagination silently; `truncated` says when the cap is hit.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  isUuid,
  loadBillingDirectory,
  rowsByIds,
} from '@/lib/billing/admin-lookups';
import {
  classifyBillingEvent,
  isBillingChannel,
  isEventType,
} from '@/lib/billing/event-channel';
import { selectEventsPage, type ModeFilter } from '@/lib/billing/event-query';
import { fetchAllRows } from '@/lib/billing/fetch-all';
import { PLATFORM_BILLING_CURRENCY } from '@/lib/billing/money-format';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import type { BillingEventView } from '@/types/super-admin';

export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 100;
/** Newest N events read per request; `truncated` reports the cut. */
const EVENTS_CAP = 10000;

const EVENT_COLUMNS =
  'id, account_id, event_type, source, from_status, to_status, ends_at, previous_ends_at, plan_name, cycle_label, amount, payment_request_id, billing_subscription_id, billing_payment_id, actor_user_id, note, created_at, duration_months, duration_days, window_kind';

const SINCE_DAYS: Record<string, number | null> = {
  all: null,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const MODES = new Set(['all', 'live', 'test']);

type Row = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel') ?? 'all';
    const type = searchParams.get('type') ?? 'all';
    const mode = searchParams.get('mode') ?? 'all';
    const since = searchParams.get('since') ?? 'all';
    const accountId = searchParams.get('accountId');
    const search = (searchParams.get('search') ?? '').trim();
    const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(5, Math.floor(Number(searchParams.get('pageSize')) || 20))
    );

    if (channel !== 'all' && !isBillingChannel(channel)) {
      return badRequest(`Unknown channel: ${channel}`);
    }
    if (type !== 'all' && !isEventType(type)) {
      return badRequest(`Unknown event type: ${type}`);
    }
    if (!MODES.has(mode)) return badRequest(`Unknown mode: ${mode}`);
    if (!(since in SINCE_DAYS)) return badRequest(`Unknown period: ${since}`);
    if (accountId && !isUuid(accountId)) {
      return badRequest('accountId must be a workspace id (UUID).');
    }

    const admin = supabaseAdmin();
    const dir = await loadBillingDirectory(admin);

    const days = SINCE_DAYS[since];
    const sinceIso =
      days === null
        ? null
        : new Date(Date.now() - days * 86400000).toISOString();

    const { rows, truncated } = await fetchAllRows<Row>(
      (from, to) => {
        let q = admin
          .from('subscription_events')
          .select(EVENT_COLUMNS)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
        if (accountId) q = q.eq('account_id', accountId);
        if (type !== 'all') q = q.eq('event_type', type);
        if (sinceIso) q = q.gte('created_at', sinceIso);
        return q.range(from, to) as unknown as PromiseLike<{
          data: Row[] | null;
          error: { message: string } | null;
        }>;
      },
      { cap: EVENTS_CAP }
    );

    const kept = rows.filter(
      (r) => !dir.superAdminOwned.has(String(r.account_id))
    );

    const [subs, pays, requests] = await Promise.all([
      rowsByIds(
        admin,
        'billing_subscriptions',
        'id, mode, currency, provider_subscription_id',
        kept.map((r) => str(r.billing_subscription_id))
      ),
      rowsByIds(
        admin,
        'billing_payments',
        'id, mode, currency, provider_payment_id',
        kept.map((r) => str(r.billing_payment_id))
      ),
      rowsByIds(
        admin,
        'payment_requests',
        'id, currency, transaction_ref',
        kept.map((r) => str(r.payment_request_id))
      ),
    ]);

    const views: BillingEventView[] = kept.map((r) => {
      const accountIdOf = String(r.account_id);
      const account = dir.accounts.get(accountIdOf);
      const actorId = str(r.actor_user_id);
      const actor = actorId ? dir.profiles.get(actorId) : undefined;
      const subId = str(r.billing_subscription_id);
      const payId = str(r.billing_payment_id);
      const prId = str(r.payment_request_id);
      const sub = subId ? subs.get(subId) : undefined;
      const pay = payId ? pays.get(payId) : undefined;
      const pr = prId ? requests.get(prId) : undefined;
      const ownerEmail = dir.ownerEmail(accountIdOf);
      const amount = num(r.amount);

      const c = classifyBillingEvent({
        eventType: String(r.event_type),
        source: str(r.source),
        paymentRequestId: prId,
        billingSubscriptionId: subId,
        billingPaymentId: payId,
        actorUserId: actorId,
        actorIsSuperAdmin: actor?.isSuperAdmin === true,
        actorName: actor?.fullName ?? null,
        actorEmail: actor?.email ?? null,
        ownerEmail,
        subMode: str(sub?.mode),
        payMode: str(pay?.mode),
        amount,
      });

      return {
        id: String(r.id),
        accountId: accountIdOf,
        accountName: account?.name ?? 'Deleted workspace',
        ownerEmail,
        eventType: String(r.event_type),
        channel: c.channel,
        context: c.context,
        initiatedBy: c.initiatedBy,
        moneyInvolved: c.moneyInvolved,
        amountKind: c.amountKind,
        amount,
        currency: (
          str(pay?.currency) ??
          str(sub?.currency) ??
          str(pr?.currency) ??
          PLATFORM_BILLING_CURRENCY
        ).toUpperCase(),
        mode: c.mode,
        fromStatus: str(r.from_status),
        toStatus: str(r.to_status),
        endsAt: str(r.ends_at),
        previousEndsAt: str(r.previous_ends_at),
        durationMonths: num(r.duration_months),
        durationDays: num(r.duration_days),
        windowKind:
          r.window_kind === 'paid' || r.window_kind === 'trial'
            ? r.window_kind
            : null,
        planName: str(r.plan_name),
        cycleLabel: str(r.cycle_label),
        note: str(r.note),
        paymentRequestId: prId,
        billingSubscriptionId: subId,
        billingPaymentId: payId,
        providerSubscriptionId: str(sub?.provider_subscription_id),
        providerPaymentId: str(pay?.provider_payment_id),
        utr: str(pr?.transaction_ref),
        createdAt: String(r.created_at),
      };
    });

    const result = selectEventsPage(views, {
      channel: channel as BillingEventView['channel'] | 'all',
      mode: mode as ModeFilter,
      search,
      page,
      pageSize,
    });

    return NextResponse.json(
      { ...result, truncated },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/events] GET failed:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Failed to load the billing activity: ${err.message}`
            : 'Failed to load the billing activity',
      },
      { status: 500 }
    );
  }
}
