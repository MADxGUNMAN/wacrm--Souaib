// ============================================================
// GET /api/billing/upi-qr?planId=…&cycleId=…
//
// Generates the UPI QR for a (plan, cycle) pair.
//
// The whole point of this route: the amount is NEVER supplied by the
// client. It sends two ids; the server reads the live price from
// `subscription_plan_prices` and encodes THAT into the QR. So when the
// super admin edits the 1-month Pro price from 1,000 to 2,000, the next
// QR requests 2,000 — no cache, no rebuild, no client cooperation
// required. A tampered request body cannot lower the amount, because
// there is no amount in the request to tamper with.
//
// Owner-only: purchasing is an owner action, enforced here and not just
// hidden in the UI.
// ============================================================

import { NextResponse } from 'next/server';

import { requireBillingOwner, toBillingErrorResponse } from '@/lib/subscription/guard';
import {
  getSubscriptionSettings,
  previewQuoteWindow,
  QuoteError,
  resolveQuote,
} from '@/lib/subscription/queries';
import {
  buildPaymentNote,
  buildReferenceNote,
  buildUpiUri,
  generateQrSvg,
  UpiConfigError,
} from '@/lib/subscription/upi';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import type { PaymentQuote } from '@/lib/subscription/types';

export async function GET(request: Request) {
  try {
    const ctx = await requireBillingOwner();

    const limit = checkRateLimit(
      `billing:quote:${ctx.accountId}`,
      RATE_LIMITS.paymentQuote,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId');
    const cycleId = searchParams.get('cycleId');

    if (!planId || !cycleId) {
      throw new QuoteError('A plan and billing cycle are required');
    }

    // Authoritative price + duration, straight from the DB.
    const quote = await resolveQuote(planId, cycleId);
    const settings = await getSubscriptionSettings();

    if (!settings.upi_id) {
      // Distinct from a validation error: nothing the customer did is
      // wrong, the platform simply isn't ready to take money. 503 so
      // it's clearly a server-side configuration gap.
      throw new UpiConfigError(
        'Online payment is not configured yet. Please contact support to complete your purchase.',
      );
    }

    const referenceNote = buildReferenceNote({
      accountId: ctx.accountId,
      planName: quote.planName,
      cycleLabel: quote.cycleLabel,
    });

    const upiUri = buildUpiUri({
      upiId: settings.upi_id,
      payeeName: settings.upi_payee_name || 'Replai',
      amount: quote.amount,
      currency: quote.currency,
      note: buildPaymentNote({
        planName: quote.planName,
        cycleLabel: quote.cycleLabel,
      }),
      reference: referenceNote,
    });

    const qrSvg = await generateQrSvg(upiUri);

    const payload: PaymentQuote = {
      planId: quote.planId,
      planName: quote.planName,
      cycleId: quote.cycleId,
      cycleLabel: quote.cycleLabel,
      cycleMonths: quote.cycleMonths,
      cycleDurationDays: quote.cycleDurationDays,
      amount: quote.amount,
      currency: quote.currency,
      upiUri,
      qrSvg,
      upiId: settings.upi_id,
      payeeName: settings.upi_payee_name || 'Replai',
      referenceNote,
    };

    return NextResponse.json({
      quote: payload,
      // What the customer would get if approved right now — shown as
      // "valid until" on the payment screen so the purchase is concrete.
      wouldEndAt: previewQuoteWindow(quote).toISOString(),
      instructions: settings.payment_instructions,
      paymentHeading: settings.payment_heading,
      submitButtonLabel: settings.submit_button_label,
      supportNote: settings.support_note,
    });
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}
