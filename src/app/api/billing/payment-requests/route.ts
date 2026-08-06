// ============================================================
// /api/billing/payment-requests
//
// GET  — this account's submission history (any member may look)
// POST — submit a manual UPI payment for verification (OWNER ONLY)
//
// The security-critical line in this file is the `resolveQuote` call in
// POST. `expected_amount` is written from the server-resolved price, and
// the client's `planId`/`cycleId` are the only inputs to that. The
// payer's own `paidAmount` is stored alongside it, unmodified, so the
// reviewing admin sees both numbers and can spot a short payment. We do
// NOT reject a mismatch automatically: partial payments, rounding by the
// payer's bank, and deliberate part-payments are all real, and the whole
// point of this flow is that a human decides.
// ============================================================

import { after, NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import { sendPaymentSubmittedEmail } from '@/lib/email/billing';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireBillingOwner, toBillingErrorResponse } from '@/lib/subscription/guard';
import {
  getPendingPaymentRequest,
  listPaymentRequestsForAccount,
  logSubscriptionEvent,
  resolveQuote,
} from '@/lib/subscription/queries';
import { buildReferenceNote } from '@/lib/subscription/upi';
import {
  parsePaymentSubmission,
  ValidationError,
} from '@/lib/subscription/validation';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const requests = await listPaymentRequestsForAccount(ctx.accountId);

    // Project rather than spreading the rows: `reviewed_by_user_id` is
    // an internal id a customer has no use for.
    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        planName: r.plan_name_snapshot,
        cycleLabel: r.cycle_label_snapshot,
        expectedAmount: r.expected_amount,
        paidAmount: r.paid_amount,
        currency: r.currency,
        transactionRef: r.transaction_ref,
        payerName: r.payer_name,
        status: r.status,
        reviewNote: r.review_note,
        reviewedAt: r.reviewed_at,
        activatedFrom: r.activated_from,
        activatedUntil: r.activated_until,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireBillingOwner();

    const limit = checkRateLimit(
      `billing:submit:${ctx.accountId}`,
      RATE_LIMITS.paymentSubmit,
    );
    if (!limit.success) return rateLimitResponse(limit);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Could not read the submitted form');
    }

    const input = parsePaymentSubmission(body);

    // Friendly pre-check for the "one pending per account" rule. The DB
    // enforces it with a partial unique index regardless — this exists
    // so the common case returns a readable message instead of a raw
    // constraint violation.
    const existing = await getPendingPaymentRequest(ctx.accountId);
    if (existing) {
      return NextResponse.json(
        {
          error:
            'You already have a payment under review. We will activate your subscription once it is verified.',
          code: 'payment_already_pending',
          pendingId: existing.id,
        },
        { status: 409 },
      );
    }

    // ---- The authoritative amount ----
    // Re-resolved here rather than trusted from the QR step, because the
    // admin may have changed the price between the customer scanning and
    // submitting. Storing the price in force AT SUBMIT TIME is what the
    // admin will compare the bank statement against.
    const quote = await resolveQuote(input.planId, input.cycleId);

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('payment_requests')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        plan_id: quote.planId,
        cycle_id: quote.cycleId,
        plan_name_snapshot: quote.planName,
        cycle_label_snapshot: quote.cycleLabel,
        cycle_months: quote.cycleMonths,
        cycle_duration_days: quote.cycleDurationDays,
        expected_amount: quote.amount,
        paid_amount: input.paidAmount,
        currency: quote.currency,
        transaction_ref: input.transactionRef,
        payer_name: input.payerName,
        payer_mobile: input.payerMobile,
        payer_upi_id: input.payerUpiId,
        payer_bank: input.payerBank,
        paid_at: input.paidAt,
        payment_method: 'upi',
        reference_note: buildReferenceNote({
          accountId: ctx.accountId,
          planName: quote.planName,
          cycleLabel: quote.cycleLabel,
        }),
        payer_note: input.payerNote,
        status: 'pending',
      })
      .select('id, created_at')
      .single();

    if (error) {
      // 23505 = unique_violation. Two indexes can raise it, and they
      // mean very different things to the user, so disambiguate on the
      // constraint name rather than showing one generic message.
      if (error.code === '23505') {
        const detail = `${error.message} ${error.details ?? ''}`;
        if (detail.includes('txn_ref')) {
          throw new ValidationError(
            'That transaction ID has already been submitted. Check the UTR, or contact support if you think this is a mistake.',
            'transactionRef',
          );
        }
        if (detail.includes('one_pending')) {
          return NextResponse.json(
            {
              error: 'You already have a payment under review.',
              code: 'payment_already_pending',
            },
            { status: 409 },
          );
        }
      }
      console.error('[billing] payment submission failed:', error.message);
      return NextResponse.json(
        { error: 'Could not save your payment details. Please try again.' },
        { status: 500 },
      );
    }

    await logSubscriptionEvent({
      accountId: ctx.accountId,
      eventType: 'payment_submitted',
      planName: quote.planName,
      cycleLabel: quote.cycleLabel,
      amount: input.paidAmount,
      paymentRequestId: data.id,
      actorUserId: ctx.userId,
      note: `UTR ${input.transactionRef}`,
    });

    // Acknowledgement email, scheduled AFTER the response.
    //
    // `after` rather than an awaited call because an SMTP handshake can
    // take seconds and the customer is staring at a spinner on a form
    // they have already completed successfully — the submission is
    // committed either way. `after` is the supported primitive on a
    // Node/Docker deployment (this app runs a standalone server behind
    // nginx), so unlike a floating promise the work is not cut short
    // when the response closes.
    //
    // Values are captured here rather than re-read inside the callback:
    // nothing in the closure touches request-scoped APIs, which keeps
    // this valid regardless of where `after` runs.
    after(async () => {
      await sendPaymentSubmittedEmail({
        accountId: ctx.accountId,
        submitterUserId: ctx.userId,
        planName: quote.planName,
        cycleLabel: quote.cycleLabel,
        expectedAmount: quote.amount,
        paidAmount: input.paidAmount,
        currency: quote.currency,
        transactionRef: input.transactionRef,
        payerName: input.payerName,
        submittedAt: data.created_at,
      });
    });

    return NextResponse.json(
      {
        id: data.id,
        status: 'pending',
        submittedAt: data.created_at,
        expectedAmount: quote.amount,
        paidAmount: input.paidAmount,
        currency: quote.currency,
        planName: quote.planName,
        cycleLabel: quote.cycleLabel,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: err.status },
      );
    }
    return toBillingErrorResponse(err);
  }
}
