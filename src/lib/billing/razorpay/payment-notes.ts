// ============================================================
// Notes on every Razorpay payment (first payment, renewals and card
// checks), written with the Update a Payment API after the payment has
// been applied to our tables.
//
// Razorpay does not copy subscription notes onto payments, and renewals
// are created by Razorpay without our Checkout, so this server-side
// PATCH is the only path that covers every payment.
//
// Rules:
//   - best effort: `ensurePaymentNotesSafely` never throws, so a notes
//     failure can never undo or block applying a payment. The next sync
//     (admin "Sync now" or the daily reconciliation sweep) retries it.
//   - idempotent: nothing is sent when our keys already hold our values.
//   - ours only: a payment that is not in billing_payments with a
//     subscription of this server's mode and env is left alone.
// ============================================================

import { RazorpayApiError } from './client';
import {
  buildPaymentNotes,
  chargeTypeFor,
  mergeNotes,
  notesNeedUpdate,
} from './payment-details';
import type { BillingDeps } from './service';
import type { BillingSubscriptionRow, RazorpayPayment } from './types';

export type NotesOutcome = 'updated' | 'unchanged' | 'not_ours' | 'failed';

/** Payments checked per subscription by a backfill. */
export const NOTES_BACKFILL_LIMIT = 10;

function message(err: unknown): string {
  if (err instanceof RazorpayApiError)
    return `Razorpay ${err.status} ${err.code ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}

export async function ensurePaymentNotes(
  deps: BillingDeps,
  payment: RazorpayPayment
): Promise<Exclude<NotesOutcome, 'failed'>> {
  const ctx = await deps.db.getPaymentNoteContext(deps.config.mode, payment.id);
  if (!ctx || ctx.mode !== deps.config.mode || ctx.env !== deps.config.env)
    return 'not_ours';
  const chargeType = chargeTypeFor({
    kind: ctx.kind,
    hasInvoice: Boolean(ctx.invoiceId),
    createdAt: ctx.createdAt,
    firstAppliedChargeAt: ctx.firstAppliedChargeAt,
  });
  const verification = chargeType === 'card_verification';
  const ours = buildPaymentNotes({
    workspace: ctx.workspace,
    accountId: ctx.accountId,
    planName: ctx.planName,
    cycleLabel: ctx.cycleLabel,
    chargeType,
    periodStart: verification ? null : ctx.periodStart,
    periodEnd: verification ? null : ctx.periodEnd,
    subscriptionId: ctx.subscriptionId,
    invoiceId: ctx.invoiceId,
    env: deps.config.env,
    mode: deps.config.mode,
  });
  if (!notesNeedUpdate(payment.notes, ours)) return 'unchanged';
  await deps.client.updatePaymentNotes(
    payment.id,
    mergeNotes(payment.notes, ours)
  );
  return 'updated';
}

/** `ensurePaymentNotes` that logs and reports `failed` instead of throwing. */
export async function ensurePaymentNotesSafely(
  deps: BillingDeps,
  payment: RazorpayPayment
): Promise<NotesOutcome> {
  try {
    return await ensurePaymentNotes(deps, payment);
  } catch (err) {
    console.error(`[razorpay] payment notes ${payment.id}: ${message(err)}`);
    return 'failed';
  }
}

export interface NotesBackfillResult {
  checked: number;
  updated: number;
  failed: number;
}

/**
 * Bring the notes of a subscription's stored payments up to date. Picks
 * up payments the apply paths never revisit (an applied payment, the
 * card check that has no invoice) and any earlier PATCH that failed.
 */
export async function backfillPaymentNotes(
  deps: BillingDeps,
  row: BillingSubscriptionRow,
  limit = NOTES_BACKFILL_LIMIT
): Promise<NotesBackfillResult> {
  const result: NotesBackfillResult = { checked: 0, updated: 0, failed: 0 };
  const ids = await deps.db.listPaymentIdsForNotes(row.id, limit);
  for (const id of ids) {
    result.checked += 1;
    let payment: RazorpayPayment;
    try {
      payment = await deps.client.fetchPayment(id);
    } catch (err) {
      console.error(`[razorpay] payment notes ${id}: ${message(err)}`);
      result.failed += 1;
      continue;
    }
    const outcome = await ensurePaymentNotesSafely(deps, payment);
    if (outcome === 'updated') result.updated += 1;
    if (outcome === 'failed') result.failed += 1;
  }
  return result;
}
