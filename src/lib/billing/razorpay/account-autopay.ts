// ============================================================
// Razorpay AutoPay when a super admin deletes or bans a workspace
// (plan sections 1.9 F7, 4 row 23, D9) — SERVER ONLY.
//
// Delete: every live AutoPay is cancelled at Razorpay BEFORE the
// account is deleted. If any cancel fails, nothing is deleted, because a
// deleted workspace with a live mandate would keep charging a customer
// we no longer have a record of.
// Ban: the ban happens first (it is a safety action and must never wait
// on Razorpay), then this cancels the AutoPay and the route reports the
// outcome.
//
// Reachability is checked for ALL rows before ANY cancel, so a refusal
// never leaves a half-done state. Cancel is always immediate (same
// reasoning as admin.ts): access lives in accounts.subscription_ends_at,
// which a cancel never touches.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminAudit } from './admin-db';
import { INITIATING_GRACE_MS, LIVE_AUTOPAY_STATUSES } from './admin-status';
import { RazorpayApiError } from './client';
import { getRazorpayConfig } from './config';
import { getBillingDeps } from './runtime';
import { syncSubscription, type BillingDeps } from './service';
import type { RazorpayMode } from './types';

export interface LiveAutopayRow {
  id: string;
  account_id: string;
  mode: RazorpayMode;
  status: string;
  provider_subscription_id: string | null;
  created_at: string;
  plan_name: string | null;
  cycle_label: string | null;
}

export const LIVE_AUTOPAY_COLUMNS =
  'id, account_id, mode, status, provider_subscription_id, created_at, plan_name, cycle_label';

export class AutopayCancelError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AutopayCancelError';
    this.code = code;
    this.status = status;
  }
}

/** Live AutoPay rows plus `initiating` claims (the caller decides on age). */
export async function listLiveAutopay(
  admin: SupabaseClient,
  accountId: string
): Promise<LiveAutopayRow[]> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select(LIVE_AUTOPAY_COLUMNS)
    .eq('account_id', accountId)
    .in('status', [...LIVE_AUTOPAY_STATUSES, 'initiating']);
  if (error) throw new Error(`Could not read AutoPay: ${error.message}`);
  return (data ?? []) as LiveAutopayRow[];
}

/** Rows that need a Razorpay cancel: live and known to Razorpay. */
export function cancellableAutopay(rows: LiveAutopayRow[]): LiveAutopayRow[] {
  return rows.filter(
    (r) => LIVE_AUTOPAY_STATUSES.has(r.status) && !!r.provider_subscription_id
  );
}

/** BillingDeps for this server, or null when Razorpay is not set up here. */
export function getAutopayDeps(): BillingDeps | null {
  return getRazorpayConfig() ? getBillingDeps() : null;
}

export type AutopayContext = 'account_delete' | 'account_ban';

export interface CancelledAutopay {
  id: string;
  providerSubscriptionId: string;
  mode: RazorpayMode;
  alreadyCancelled: boolean;
}

export type AccountAutopayResult =
  { outcome: 'none' } | { outcome: 'cancelled'; cancelled: CancelledAutopay[] };

function trimEnd(message: string): string {
  return message.replace(/[\s.]+$/, '');
}

export async function cancelLiveAutopayForAccount(input: {
  admin: SupabaseClient;
  getDeps: () => BillingDeps | null;
  accountId: string;
  actorUserId: string;
  context: AutopayContext;
  reason: string;
  now?: Date;
}): Promise<AccountAutopayResult> {
  const now = input.now ?? new Date();
  const rows = await listLiveAutopay(input.admin, input.accountId);

  const fresh = rows.find(
    (r) =>
      r.status === 'initiating' &&
      now.getTime() - new Date(r.created_at).getTime() < INITIATING_GRACE_MS
  );
  if (fresh) {
    throw new AutopayCancelError(
      'checkout_in_progress',
      'A Razorpay checkout is being set up for this workspace right now. Wait 15 minutes, then try again.',
      409
    );
  }

  const targets = cancellableAutopay(rows);
  if (targets.length === 0) return { outcome: 'none' };

  // Check every row before cancelling any.
  const deps = input.getDeps();
  const unreachable = targets.find((r) => !deps || r.mode !== deps.config.mode);
  if (unreachable || !deps) {
    const row = unreachable ?? targets[0];
    throw new AutopayCancelError(
      'autopay_unreachable',
      `This workspace has a Razorpay AutoPay in ${row.mode} mode (${row.provider_subscription_id}) that this server cannot reach. Cancel it from Payments on the server where ${row.mode} mode is set up, then try again.`,
      409
    );
  }

  const cancelled: CancelledAutopay[] = [];
  for (const row of targets) {
    const pid = row.provider_subscription_id as string;
    let alreadyCancelled = false;
    try {
      await deps.client.cancelSubscription(pid, false);
    } catch (err) {
      if (
        err instanceof RazorpayApiError &&
        (err.isAlreadyInState || err.isNotFound)
      ) {
        alreadyCancelled = true;
      } else {
        const said = trimEnd(err instanceof Error ? err.message : String(err));
        const consequence =
          input.context === 'account_ban'
            ? 'so AutoPay is still active'
            : 'so nothing was deleted';
        throw new AutopayCancelError(
          'autopay_cancel_failed',
          `Razorpay did not cancel this workspace's AutoPay (${pid}), ${consequence}. Razorpay said: ${said}. Try again in a minute.`,
          502
        );
      }
    }
    await deps.db.markCancelRequested(row.id, 'admin');

    try {
      await syncSubscription(deps, pid, 'admin');
    } catch (err) {
      console.error(
        '[razorpay account autopay] re-read after cancel failed:',
        err instanceof Error ? err.message : err
      );
    }

    // On delete the account's events cascade away, so only a ban audits.
    if (input.context === 'account_ban') {
      try {
        await adminAudit(input.admin, {
          accountId: row.account_id,
          billingSubscriptionId: row.id,
          actorUserId: input.actorUserId,
          note: `Cancelled AutoPay ${pid} because the account was banned. Reason: ${input.reason}`,
        });
      } catch (err) {
        console.error(
          '[razorpay account autopay] audit write failed:',
          err instanceof Error ? err.message : err
        );
      }
    }

    cancelled.push({
      id: row.id,
      providerSubscriptionId: pid,
      mode: row.mode,
      alreadyCancelled,
    });
  }

  return { outcome: 'cancelled', cancelled };
}
