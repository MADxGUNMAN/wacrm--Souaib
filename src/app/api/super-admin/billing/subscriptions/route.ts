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
  expireBothWindows,
  expireNow,
  expireWindow,
  revokeSubscription,
  setSubscriptionState,
  setTrialEndDate,
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
          'id, name, owner_user_id, is_banned, created_at, subscription_status, trial_started_at, trial_ends_at, subscription_plan_id, subscription_plan_name, subscription_cycle_label, subscription_started_at, subscription_ends_at, subscription_note'
        )
        .order('created_at', { ascending: false }),
      getGateConfig(),
    ]);

    if (accountsRes.error) {
      return NextResponse.json(
        { error: accountsRes.error.message },
        { status: 500 }
      );
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
      (owners ?? []).map((o: Record<string, unknown>) => [o.user_id, o])
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
        Record<string, unknown> | undefined;
      return owner?.is_super_admin !== true;
    });

    const now = new Date();
    let subscribers = rows.map((row) => {
      const state = resolveSubscriptionState(row, config, now);
      const owner = ownersById.get(row.owner_user_id) as
        Record<string, unknown> | undefined;

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
        pendingWindow: state.pendingWindow
          ? {
              type: state.pendingWindow.type,
              startsAt: state.pendingWindow.startsAt.toISOString(),
              endsAt: state.pendingWindow.endsAt.toISOString(),
              durationDays: state.pendingWindow.durationDays,
            }
          : null,
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
          s.ownerEmail?.toLowerCase().includes(needle)
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
    return NextResponse.json(
      { error: 'Failed to load subscribers' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const adminCtx = await requireSuperAdmin(request);

    const body = (await request.json()) as Record<string, unknown>;
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim()
        : null;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
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
            { status: 400 }
          );
        }

        const result = await activateSubscription({
          accountId,
          planId: typeof body.planId === 'string' ? body.planId : null,
          planName: typeof body.planName === 'string' ? body.planName : null,
          cycleLabel:
            typeof body.cycleLabel === 'string' ? body.cycleLabel : null,
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

      // Set an exact end date, for negotiated or corrected terms. No
      // duration is recorded on purpose — the operator chose a date, not a
      // span, and inventing "+37 days" would misreport the intent.
      case 'set_end_date': {
        const raw = typeof body.endsAt === 'string' ? body.endsAt : '';
        if (!raw) {
          return NextResponse.json(
            { error: 'endsAt is required' },
            { status: 400 }
          );
        }
        const endsAt = new Date(raw);
        if (Number.isNaN(endsAt.getTime())) {
          return NextResponse.json(
            { error: 'endsAt is not a valid date' },
            { status: 400 }
          );
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
            { status: 400 }
          );
        }

        await setSubscriptionState({
          accountId,
          status: 'active',
          endsAt,
          planName:
            typeof body.planName === 'string' ? body.planName : undefined,
          cycleLabel:
            typeof body.cycleLabel === 'string' ? body.cycleLabel : undefined,
          actorUserId: adminCtx.userId,
          note,
        });

        return NextResponse.json({ endsAt: endsAt.toISOString() });
      }

      case 'extend_trial': {
        const days = Number(body.durationDays);
        if (!Number.isInteger(days) || days <= 0 || days > 3650) {
          return NextResponse.json(
            {
              error: 'durationDays must be a whole number between 1 and 3650',
              field: 'durationDays',
            },
            { status: 400 }
          );
        }

        const admin = supabaseAdmin();
        const { data: current } = await admin
          .from('accounts')
          .select('trial_ends_at, subscription_ends_at, subscription_status')
          .eq('id', accountId)
          .maybeSingle();

        const nowMs = Date.now();
        const paidEnd = current?.subscription_ends_at
          ? new Date(current.subscription_ends_at)
          : null;
        const paidIsOpen =
          paidEnd !== null &&
          paidEnd.getTime() > nowMs &&
          current?.subscription_status === 'active';

        // ---- Window-stacking ----
        // If a paid subscription is active, queue the trial AFTER it.
        // Otherwise, extend from the later of now and the existing trial.
        let base: Date;
        if (paidIsOpen) {
          // Queue behind the paid window. If a trial is already queued
          // after the paid end, extend from that instead.
          const existingTrialEnd = current?.trial_ends_at
            ? new Date(current.trial_ends_at)
            : null;
          base =
            existingTrialEnd && existingTrialEnd.getTime() > paidEnd!.getTime()
              ? existingTrialEnd
              : paidEnd!;
        } else {
          // No active paid window — extend from now or existing trial.
          base =
            current?.trial_ends_at &&
            new Date(current.trial_ends_at) > new Date()
              ? new Date(current.trial_ends_at)
              : new Date();
        }

        const trialEndsAt = new Date(
          base.getTime() + days * 24 * 60 * 60 * 1000
        );

        // When a paid window is open, keep the status as 'active' so
        // the resolver shows the user in their paid window, with the
        // trial exposed as a pendingWindow.
        await setSubscriptionState({
          accountId,
          status: paidIsOpen ? 'active' : 'trialing',
          trialEndsAt,
          actorUserId: adminCtx.userId,
          note: paidIsOpen
            ? (note ??
              `${days} trial day(s) queued after subscription (starts ${paidEnd!.toISOString().slice(0, 10)})`)
            : note,
          durationDays: days,
        });

        return NextResponse.json({
          trialEndsAt: trialEndsAt.toISOString(),
          queuedBehindPaid: paidIsOpen,
        });
      }

      // End the current window through the natural date path — the
      // faithful simulation of the day a trial or subscription runs out.
      // Auto-detects which window is primary; see expireNow(). Kept for
      // the common single-window case and for any saved request that
      // still sends it.
      case 'expire_now': {
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

      // Explicit, window-specific expiry. Unlike `expire_now`, the
      // caller names which window to end — needed once an account can
      // have BOTH a trial and a queued/active paid window at the same
      // time, where auto-detection can pick the wrong one.
      case 'expire_trial':
      case 'expire_paid': {
        const result = await expireWindow({
          accountId,
          which: action === 'expire_trial' ? 'trial' : 'paid',
          actorUserId: adminCtx.userId,
          note,
        });
        return NextResponse.json({
          which: result.which,
          endsAt: result.endsAt.toISOString(),
        });
      }

      // End trial AND paid access at once — e.g. shutting a workspace
      // down entirely rather than just letting one window lapse.
      case 'expire_both': {
        const result = await expireBothWindows({
          accountId,
          actorUserId: adminCtx.userId,
          note,
        });
        return NextResponse.json({ endsAt: result.endsAt.toISOString() });
      }

      // Correct the trial's end date directly — the trial-side
      // counterpart of `set_end_date`, which only ever touched the paid
      // window's date.
      case 'set_trial_end_date': {
        const raw =
          typeof body.trialEndsAt === 'string' ? body.trialEndsAt : '';
        if (!raw) {
          return NextResponse.json(
            { error: 'trialEndsAt is required' },
            { status: 400 }
          );
        }
        const trialEndsAt = new Date(raw);
        if (Number.isNaN(trialEndsAt.getTime())) {
          return NextResponse.json(
            { error: 'trialEndsAt is not a valid date' },
            { status: 400 }
          );
        }
        if (trialEndsAt.getTime() <= Date.now()) {
          return NextResponse.json(
            {
              error:
                'That date is in the past, which would end the trial immediately. Use Expire trial if that is what you intend.',
              field: 'trialEndsAt',
            },
            { status: 400 }
          );
        }

        await setTrialEndDate({
          accountId,
          trialEndsAt,
          actorUserId: adminCtx.userId,
          note,
        });

        return NextResponse.json({ trialEndsAt: trialEndsAt.toISOString() });
      }

      case 'revoke': {
        await revokeSubscription({
          accountId,
          actorUserId: adminCtx.userId,
          note,
        });
        return NextResponse.json({ success: true });
      }

      // Mark an account permanently ungated (internal, demo,
      // grandfathered). `none` short-circuits the gate entirely.
      case 'set_status': {
        const status = typeof body.status === 'string' ? body.status : '';
        if (!VALID_STATUSES.includes(status as SubscriptionStatus)) {
          return NextResponse.json(
            { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
            { status: 400 }
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
              'action must be one of: grant, set_end_date, set_trial_end_date, extend_trial, expire_now, expire_trial, expire_paid, expire_both, revoke, set_status',
          },
          { status: 400 }
        );
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof SubscriptionMutationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    console.error('[super-admin/billing/subscriptions] PATCH failed:', err);
    return NextResponse.json(
      { error: 'Failed to update the subscription' },
      { status: 500 }
    );
  }
}
