// ============================================================
// Super-admin actions on one Razorpay subscription (plan sections 7.4
// and 15, Phase 5): sync from Razorpay, and cancel.
//
// Rules shared with the customer side (lifecycle.ts):
//   - cancel is always IMMEDIATE at Razorpay. Access lives in
//     accounts.subscription_ends_at, which a cancel never touches, so the
//     customer keeps paid time, and "at cycle end" on a pending or halted
//     mandate could still collect.
//   - the status we store comes from a fresh Razorpay fetch, never from
//     what we asked for.
// Admin-only rules:
//   - a row can only be acted on by the server whose Razorpay keys own
//     it (`row.mode === config.mode`); the database is shared by test and
//     live, the keys are not.
//   - every action writes a `billing_admin_action` audit row with the
//     operator and, for cancel, their reason.
// ============================================================

import { ADMIN_CANCELLABLE } from './admin-status';
import { RazorpayApiError } from './client';
import { backfillPaymentNotes } from './payment-notes';
import {
  BillingServiceError,
  refreshSubscription,
  syncSubscription,
  type BillingDeps,
} from './service';
import type { BillingSubscriptionRow } from './types';

export type AdminAudit = (
  accountId: string,
  billingSubscriptionId: string | null,
  actorUserId: string,
  note: string
) => Promise<unknown>;

function assertSameMode(deps: BillingDeps, row: BillingSubscriptionRow): void {
  if (row.mode !== deps.config.mode) {
    throw new BillingServiceError(
      'mode_unavailable',
      `This AutoPay is in ${row.mode} mode, and this server is set up for ${deps.config.mode} mode. Open it on the server where ${row.mode} mode is set up.`,
      409
    );
  }
}

/** Never let a failed audit write turn a done action into an error. */
async function writeAudit(
  audit: AdminAudit,
  ...args: Parameters<AdminAudit>
): Promise<boolean> {
  try {
    await audit(...args);
    return true;
  } catch (err) {
    console.error(
      '[razorpay admin] audit write failed:',
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

export interface AdminCancelResult {
  /** Razorpay said it was already cancelled (or no longer exists). */
  alreadyCancelled: boolean;
  /** False when Razorpay accepted the cancel but the re-read failed. */
  synced: boolean;
  audited: boolean;
}

export async function adminCancelSubscription(
  deps: BillingDeps,
  row: BillingSubscriptionRow,
  input: { actorUserId: string; reason: string; audit: AdminAudit }
): Promise<AdminCancelResult> {
  assertSameMode(deps, row);
  const pid = row.provider_subscription_id;
  if (!pid || !ADMIN_CANCELLABLE.has(row.status)) {
    throw new BillingServiceError(
      'not_cancellable',
      `This AutoPay is ${row.status.replace(/_/g, ' ')}, so there is nothing to cancel.`,
      409
    );
  }

  let alreadyCancelled = false;
  try {
    await deps.client.cancelSubscription(pid, false);
  } catch (err) {
    if (!(
      err instanceof RazorpayApiError &&
      (err.isAlreadyInState || err.isNotFound)
    ))
      throw err;
    alreadyCancelled = true;
  }
  await deps.db.markCancelRequested(row.id, 'admin');

  let synced = true;
  try {
    await syncSubscription(deps, pid, 'admin');
  } catch (err) {
    synced = false;
    console.error(
      '[razorpay admin] cancel re-read failed:',
      err instanceof Error ? err.message : err
    );
  }

  const audited = await writeAudit(
    input.audit,
    row.account_id,
    row.id,
    input.actorUserId,
    `Cancelled AutoPay ${pid} (${row.mode}).${
      alreadyCancelled ? ' Razorpay reported it was already cancelled.' : ''
    } Reason: ${input.reason}`
  );

  return { alreadyCancelled, synced, audited };
}

export interface AdminSyncResult {
  /** Payments newly applied (access granted) by this sync. */
  applied: number;
  /** Payments whose Razorpay notes this sync filled in or corrected. */
  notesUpdated: number;
  previousStatus: string;
  status: string | null;
  audited: boolean;
}

export async function adminSyncSubscription(
  deps: BillingDeps,
  row: BillingSubscriptionRow,
  input: { actorUserId: string; audit: AdminAudit }
): Promise<AdminSyncResult> {
  assertSameMode(deps, row);
  if (!row.provider_subscription_id) {
    throw new BillingServiceError(
      'no_provider_id',
      'This checkout never reached Razorpay, so there is nothing to sync.',
      409
    );
  }
  const previousStatus = row.status;
  const { applied } = await refreshSubscription(deps, row, 'admin');
  const fresh = await deps.db.getSubscription(row.id);
  const status = fresh?.status ?? null;

  // Notes are best effort: a read error here must not fail the sync.
  let notesUpdated = 0;
  try {
    notesUpdated = (await backfillPaymentNotes(deps, row)).updated;
  } catch (err) {
    console.error(
      '[razorpay admin] payment notes backfill failed:',
      err instanceof Error ? err.message : err
    );
  }

  const audited = await writeAudit(
    input.audit,
    row.account_id,
    row.id,
    input.actorUserId,
    `Synced from Razorpay: ${previousStatus} -> ${status ?? 'unknown'}, ${applied} payment(s) applied, notes updated on ${notesUpdated} payment(s)`
  );
  return { applied, notesUpdated, previousStatus, status, audited };
}
