// ============================================================
// Customer lifecycle actions on an existing AutoPay (plan sections 7.2
// and 8.3): cancel, and changing the payment method.
//
// Cancel always stops the mandate at Razorpay IMMEDIATELY. Access is not
// Razorpay's to end: it is `accounts.subscription_ends_at`, which a
// cancel never touches, so the customer keeps every day already paid for
// (D3) and no further charge can happen. That gives the same outcome as
// "cancel at cycle end" for the customer, while the cancellation (and its
// confirmation email) happens now rather than weeks later, and there is
// no window in which Razorpay could still collect a retry the customer
// has asked us to stop.
//
// As everywhere else, the status written to our database comes from a
// fresh Razorpay fetch, never from what we asked for.
// ============================================================

import { RazorpayApiError } from './client';
import {
  BillingServiceError,
  loadAutopayView,
  syncSubscription,
  type BillingDeps,
} from './service';
import type { BillingSubscriptionRow } from './types';
import type { AutopayView } from './view';

/** Statuses a customer may cancel: anything that has or could charge. */
const CANCELLABLE: ReadonlySet<string> = new Set([
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
]);

/** Card changes are possible on these (Razorpay: subscription_card_change). */
const CARD_CHANGEABLE: ReadonlySet<string> = new Set([
  'authenticated',
  'active',
  'pending',
]);

async function liveRow(
  deps: BillingDeps,
  accountId: string
): Promise<BillingSubscriptionRow> {
  const row = await deps.db.getLatestSubscription(accountId, deps.config.mode);
  if (!row || !row.provider_subscription_id || !CANCELLABLE.has(row.status)) {
    throw new BillingServiceError(
      'no_autopay',
      'There is no active AutoPay for this workspace.',
      409
    );
  }
  return row;
}

export interface CancelResult {
  autopay: AutopayView | null;
  /** False when Razorpay accepted the cancel but the re-read failed; a webhook or the cron finishes it. */
  synced: boolean;
}

export async function cancelAutopay(
  deps: BillingDeps,
  input: { accountId: string; confirm: unknown }
): Promise<CancelResult> {
  if (input.confirm !== true) {
    throw new BillingServiceError(
      'confirmation_required',
      'Please confirm that you want to cancel AutoPay.',
      400
    );
  }
  const row = await liveRow(deps, input.accountId);
  const pid = row.provider_subscription_id as string;

  try {
    await deps.client.cancelSubscription(pid, false);
  } catch (err) {
    // Already cancelled at Razorpay (another tab, the UPI app): carry on
    // and record what Razorpay says.
    if (!(
      err instanceof RazorpayApiError &&
      (err.isAlreadyInState || err.isNotFound)
    ))
      throw err;
  }
  await deps.db.markCancelRequested(row.id, 'customer');

  let synced = true;
  try {
    await syncSubscription(deps, pid, 'customer');
  } catch (err) {
    synced = false;
    console.error(
      '[razorpay] cancel re-read failed:',
      err instanceof Error ? err.message : err
    );
  }

  const now = deps.now?.() ?? new Date();
  const fresh = await deps.db.getSubscription(row.id);
  return { autopay: await loadAutopayView(deps.db, fresh, now), synced };
}

export type PaymentMethodAction =
  | {
      action: 'card_change';
      keyId: string;
      subscriptionId: string;
      /** For the Checkout payment notes. */
      planName: string;
      cycleLabel: string;
    }
  | {
      /** Stopped or paused: set up AutoPay again (replaces the old one). */
      action: 'renew';
      planId: string | null;
      cycleId: string | null;
    }
  | {
      /** UPI mandates are changed in the UPI app, not here. */
      action: 'unsupported';
      message: string;
    };

export async function paymentMethodAction(
  deps: BillingDeps,
  input: { accountId: string }
): Promise<PaymentMethodAction> {
  const row = await liveRow(deps, input.accountId);

  if (row.status === 'halted' || row.status === 'paused') {
    return { action: 'renew', planId: row.plan_id, cycleId: row.cycle_id };
  }
  if (CARD_CHANGEABLE.has(row.status) && row.payment_method === 'card') {
    return {
      action: 'card_change',
      keyId: deps.config.keyId,
      subscriptionId: row.provider_subscription_id as string,
      planName: row.plan_name,
      cycleLabel: row.cycle_label,
    };
  }
  return {
    action: 'unsupported',
    message:
      row.payment_method === 'upi'
        ? 'UPI AutoPay is managed in your UPI app. To use a different UPI ID or a card, cancel this AutoPay and set it up again.'
        : 'This payment method cannot be changed here. Cancel AutoPay and set it up again with the new method.',
  };
}
