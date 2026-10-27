// ============================================================
// POST /api/billing/razorpay/payment-method
//
// What "change payment method" means for this workspace's AutoPay:
//   card_change  a card mandate: open Checkout on the same subscription
//                with subscription_card_change, then POST /verify
//   renew        stopped or paused: set AutoPay up again (the checkout
//                replaces the old mandate)
//   unsupported  UPI: managed in the customer's UPI app
//
// Nothing is changed by this call. Owner only, same-origin, 5 per hour.
// ============================================================

import { NextResponse } from 'next/server';

import { isSameOrigin } from '@/lib/http/request-origin';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { paymentMethodAction } from '@/lib/billing/razorpay/lifecycle';
import {
  buildPaymentNotes,
  composeCardChangeDescription,
  normalizePrefillContact,
} from '@/lib/billing/razorpay/payment-details';
import {
  getBillingDeps,
  toRazorpayErrorResponse,
} from '@/lib/billing/razorpay/runtime';
import { getAccountPricingRegion } from '@/lib/billing/pricing/region-store';
import { requireBillingOwner } from '@/lib/subscription/guard';
import {
  getRegionSettings,
  getSubscriptionSettings,
} from '@/lib/subscription/queries';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-site request refused', code: 'bad_origin' },
      { status: 403 }
    );
  }
  try {
    const ctx = await requireBillingOwner();

    const limit = checkRateLimit(
      `razorpay:manage:${ctx.accountId}`,
      RATE_LIMITS.razorpayManage
    );
    if (!limit.success) return rateLimitResponse(limit);

    const deps = getBillingDeps();
    const action = await paymentMethodAction(deps, {
      accountId: ctx.accountId,
    });
    if (action.action !== 'card_change') return NextResponse.json(action);

    const [globalSettings, contact] = await Promise.all([
      getSubscriptionSettings(),
      deps.db.getContact(ctx.userId),
    ]);
    // Checkout copy for the workspace's pricing region (Global unchanged).
    const pricing = await getAccountPricingRegion(ctx.accountId, {
      settings: globalSettings,
      config: deps.config,
    });
    const settings =
      pricing.region === 'global'
        ? globalSettings
        : await getRegionSettings(pricing.region, pricing.currency);
    const phone = normalizePrefillContact(contact.phone);
    return NextResponse.json({
      ...action,
      checkout: {
        name: settings.razorpay_checkout_name || 'Replai',
        description: composeCardChangeDescription(
          settings.razorpay_checkout_name
        ),
        notes: buildPaymentNotes({
          workspace: ctx.account?.name ?? null,
          accountId: ctx.accountId,
          planName: action.planName,
          cycleLabel: action.cycleLabel,
          chargeType: 'card_verification',
          periodStart: null,
          periodEnd: null,
          subscriptionId: action.subscriptionId,
          invoiceId: null,
          env: deps.config.env,
          mode: deps.config.mode,
        }),
        prefill: {
          name: contact.name ?? '',
          email: contact.email ?? '',
          ...(phone ? { contact: phone } : {}),
        },
      },
    });
  } catch (err) {
    return toRazorpayErrorResponse(err, 'payment method');
  }
}
