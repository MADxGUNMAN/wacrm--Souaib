// ============================================================
// /api/super-admin/billing/subscriptions
//
// GET   — subscriber list with live (not stored) status, filterable
// PATCH — manual control: grant/extend, set an exact end date, extend a
//         trial, revoke, or mark an account permanently ungated
//
// Super admin only.
//
// Why the list recomputes status per row instead of filtering on the
// stored `subscription_status` column: nothing flips `trialing` ->
// `expired` when a date passes (there is no cron), so the column goes
// stale by design. Filtering on it in SQL would show lapsed accounts as
// trialing. `resolveSubscriptionState` derives the truth from the
// timestamps, so filtering happens in memory after that.
//
// The list is CUSTOMERS, not accounts. Workspaces owned by a super admin
// are excluded from both the rows and the counts — see the filter in GET
// for why that is a correctness requirement rather than cosmetics.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import {
  activateSubscription,
  expireNow,
  revokeSubscription,
  setSubscriptionState,
  SubscriptionMutationError,
} from '@/lib/subscription/activate';
import { getGateConfig } from '@/lib/subscription/queries';
import { resolveSubscriptionState } from '@/lib/subscription/status';
import {
  parseDurationOverride,
  ValidationError,
} from '@/lib/subscription/validation';
import type { SubscriptionStatus } from '@/lib/subscription/types';

const VALID_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'expired',
  'none',
];

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const stateFilter = searchParams.get('state') ?? 'all';
    const search = (searchParams.get('search') ?? '').trim();

    const [accountsRes, config] = await Promise.all([
      admin
        .from('accounts')
        .select(
          'id, name, owner_user_id, is_banned, created_at, subscription_status, trial_started_at, trial_ends_at, subscription_plan_id, subscription_plan_name, subscription_cycle_label, subscription_started_at, subscription_ends_at, subscription_note',
        )
        .order('created_at', { ascending: false }),
      getGateConfig(),
    ]);

    if (accountsRes.error) {
      return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });
    }

    const allRows = accountsRes.data ?? [];

    const ownerIds = [
      ...new Set(allRows.map((r) => r.owner_user_id).filter(Boolean)),
    ];
    const { data: owners } = ownerIds.length
      ? await admin
          .from('profiles')
          .select('user_id, full_name, email, is_super_admin')
          .in('user_id', ownerIds)
      : { data: [] };

    const ownersById = new Map(
      (owners ?? []).map((o: Record<string, unknown>) => [o.user_id, o]),
    );

    // ---- Drop the platform's own workspaces ----
    //
    // Every signup gets an `accounts` row and a trial, including the
    // super admin who installed the product. But `proxy.ts` redirects
    // super admins away from every CRM path and skips the subscription
    // gate entirely for them, so those workspaces can never be blocked,
    // never pay, and never churn.
    //
    // Leaving them in was not merely untidy, it corrupted the numbers an
    // operator reads: the platform's own workspace inflated Total and
    // Trialing, and once its unused trial date passed it would have
    // appeared under Expired — reporting a lapsed customer where none
    // existed. Filtered here, before BOTH the row mapping and the
    // tallies, so the list and the counters cannot disagree.
    //
    // Only an explicit `true` excludes a row: an account whose owner has
    // no profile, or no owner at all, is a real workspace with a data
    // problem and must stay visible rather than being silently hidden.
    const rows = allRows.filter((row) => {
      const owner = ownersById.get(row.owner_user_id) as
        | Record<string, unknown>
        | undefined;
      return owner?.is_super_admin !== true;
    });

    const now = new Date();
    let subscribers = rows.map((row) => {
      const state = resolveSubscriptionState(row, config, now);
      const owner = ownersById.get(row.owner_user_id) as
        | Record<string, unknown>
        | undefined;

      return {
        accountId: row.id,
        accountName: row.name,
        isBanned: row.is_banned ?? false,
        createdAt: row.created_at,
        ownerName: (owner?.full_name as string) ?? null,
        ownerEmail: (owner?.email as string) ?? null,

        storedStatus: row.subscription_status,
        // The value the UI should display — derived, so it can differ
        // from storedStatus for a lapsed-but-unflipped account.
        liveStatus: state.status,
        isBlocked: state.isBlocked,
        inGracePeriod: state.inGracePeriod,
        daysLeft: state.daysLeft,
        endsAt: state.endsAt ? state.endsAt.toISOString() : null,

        planName: row.subscription_plan_name,
        cycleLabel: row.subscription_cycle_label,
        trialEndsAt: row.trial_ends_at,
        subscriptionStartedAt: row.subscription_started_at,
        subscriptionEndsAt: row.subscription_ends_at,
        note: row.subscription_note,
      };
    });

    if (stateFilter !== 'all') {
      subscribers =
        stateFilter === 'blocked'
          ? subscribers.filter((s) => s.isBlocked)
          : subscribers.filter((s) => s.liveStatus === stateFilter);
    }

    if (search) {
      const needle = search.toLowerCase();
      subscribers = subscribers.filter(
        (s) =>
          s.accountName?.toLowerCase().includes(needle) ||
          s.ownerName?.toLowerCase().includes(needle) ||
          s.ownerEmail?.toLowerCase().includes(needle),
      );
    }

    // Tallies computed off the derived status, so they agree with what
    // the rows actually show.
    const counts = {
      total: rows.length,
      trialing: 0,
      active: 0,
      expired: 0,
      none: 0,
      blocked: 0,
    };
    for (const row of rows) {
      const state = resolveSubscriptionState(row, config, now);
      counts[state.status] += 1;
      if (state.isBlocked) counts.blocked += 1;
    }

    return NextResponse.json({ subscribers, counts, gate: config });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/subscriptions] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load subscribers' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminCtx = await requireSuperAdmin(request);

    const body = (await request.json()) as Record<string, unknown>;
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const note =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    switch (action) {
      // Grant or extend by a duration. Renewal-aware: if the account
      // still has time, this adds to the end date rather than resetting
      // from today.
      case 'grant': {
        const duration = parseDurationOverride(body);
        if (!duration) {
          return NextResponse.json(
            { error: 'Specify durationMonths or durationDays' },
            { status: 400 },
          );
        }

        const result = await activateSubscription({
          accountId,
          planId: typeof body.planId === 'string' ? body.planId : null,
          planName: typeof body.planName === 'string' ? body.planName : null,
          cycleLabel: typeof body.cycleLabel === 'string' ? body.cycleLabel : null,
          duration,
          actorUserId: adminCtx.userId,
          note,
        });

        return NextResponse.json({
          startsAt: result.startsAt.toISOString(),
          endsAt: result.endsAt.toISOString(),
          extended: result.extended,
        });
      }

      // Set an exact end date, for negotiated or corrected terms.
      case 'set_end_date': {
        const raw = typeof body.endsAt === 'string' ? body.endsAt : '';
        if (!raw) {
          return NextResponse.json({ error: 'endsAt is required' }, { status: 400 });
        }
        const endsAt = new Date(raw);
        if (Number.isNaN(endsAt.getTime())) {
          return NextResponse.json({ error: 'endsAt is not a valid date' }, { status: 400 });
        }
        if (endsAt.getTime() <= Date.now()) {
          // A past end date would block the customer instantly — if
          // that's the intent, `revoke` says so explicitly.
          return NextResponse.json(
            {
              error:
                'That end date is in the past, which would block the account immediately. Use Revoke if that is what you intend.',
              field: 'endsAt',
            },
            { status: 400 },
          );
        }

        await setSubscriptionState({
          accountId,
          status: 'active',
          endsAt,
          planName: typeof body.planName === 'string' ? body.planName : undefined,
          cycleLabel: typeof body.cycleLabel === 'string' ? body.cycleLabel : undefined,
          actorUserId: adminCtx.userId,
          note,
        });

        return NextResponse.json({ endsAt: endsAt.toISOString() });
      }

      case 'extend_trial': {
        const days = Number(body.durationDays);
        if (!Number.isInteger(days) || days <= 0 || days > 3650) {
          return NextResponse.json(
            { error: 'durationDays must be a whole number between 1 and 3650', field: 'durationDays' },
            { status: 400 },
          );
        }
        // Extend from the later of now and the existing trial end, so a
        // top-up on a live trial adds days instead of shortening it.
        const admin = supabaseAdmin();
        const { data: current } = await admin
          .from('accounts')
          .select('trial_ends_at')
          .eq('id', accountId)
          .maybeSingle();

        const base =
          current?.trial_ends_at && new Date(current.trial_ends_at) > new Date()
            ? new Date(current.trial_ends_at)
            : new Date();
        const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

        await setSubscriptionState({
          accountId,
          status: 'trialing',
          trialEndsAt,
          actorUserId: adminCtx.userId,
          note,
        });

        return NextResponse.json({ trialEndsAt: trialEndsAt.toISOString() });
      }

      // End the current window through the natural date path — the
      // faithful simulation of the day a trial or subscription runs out.
      // Handles both; see expireNow(). `expire_trial` is accepted as an
      // alias so any saved request or bookmark keeps working.
      case 'expire_now':
      case 'expire_trial': {
        const result = await expireNow({
          accountId,
          actorUserId: adminCtx.userId,
          note,
        });
        return NextResponse.json({
          mode: result.mode,
          endsAt: result.endsAt.toISOString(),
        });
      }

      case 'revoke': {
        await revokeSubscription({ accountId, actorUserId: adminCtx.userId, note });
        return NextResponse.json({ success: true });
      }

      // Mark an account permanently ungated (internal, demo,
      // grandfathered). `none` short-circuits the gate entirely.
      case 'set_status': {
        const status = typeof body.status === 'string' ? body.status : '';
        if (!VALID_STATUSES.includes(status as SubscriptionStatus)) {
          return NextResponse.json(
            { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
            { status: 400 },
          );
        }
        await setSubscriptionState({
          accountId,
          status: status as SubscriptionStatus,
          actorUserId: adminCtx.userId,
          note,
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          {
            error:
              "action must be one of: grant, set_end_date, extend_trial, expire_now, revoke, set_status",
          },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof SubscriptionMutationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/subscriptions] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to update the subscription' }, { status: 500 });
  }
}
