// ============================================================
// Manual UPI retirement (Razorpay Phase 6, plan section 7.2 last row).
//
// Once an account's purchase flow is Razorpay AutoPay, the manual QR and
// "I have paid" routes answer 410 Gone with a stable code instead of
// taking money outside the subscription. The code is NOT deleted: the
// moment the resolver answers manual UPI again (dev override, Phase 7
// rollback to `payment_provider = 'manual_upi'`) the same routes work as
// before. History (GET /api/billing/payment-requests) is never retired.
//
// "Razorpay" means the answer `resolvePaymentProvider` gives for THIS
// account on THIS deployment, the same answer the purchase page and the
// Razorpay routes use, so the UI and the routes can never disagree.
// ============================================================

import { NextResponse } from 'next/server';

import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { resolvePaymentProvider } from '@/lib/billing/razorpay/provider';
import { getSubscriptionSettings } from '@/lib/subscription/queries';

export const MANUAL_RETIRED_CODE = 'manual_payments_retired';

export const MANUAL_RETIRED_MESSAGE =
  'Manual UPI payments have been replaced by AutoPay. Go to Upgrade plan to set up AutoPay.';

/** A 410 response when manual UPI is retired for this account, else null. */
export async function manualPaymentsRetiredResponse(
  accountId: string
): Promise<NextResponse | null> {
  const config = getRazorpayConfig();
  // No Razorpay here (production today): skip the settings read entirely.
  if (!config) return null;
  const settings = await getSubscriptionSettings();
  const provider = resolvePaymentProvider({
    settingsProvider: settings.payment_provider,
    config,
    accountId,
  });
  if (provider !== 'razorpay') return null;
  return NextResponse.json(
    { error: MANUAL_RETIRED_MESSAGE, code: MANUAL_RETIRED_CODE },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
