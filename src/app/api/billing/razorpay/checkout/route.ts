// ============================================================
// /api/billing/razorpay/checkout
//
// GET  ?planId=&cycleId=  Preview: what "Continue to pay" will do, with
//                         no side effects. Feeds the summary and consent
//                         text shown BEFORE Razorpay Checkout opens.
// POST { planId, cycleId } Create (or reuse) the Razorpay subscription
//                         and return what Checkout needs to open.
//
// Owner only. POST also requires a same-origin request and is rate
// limited. The browser supplies two ids and nothing else: price,
// currency, start date, account and subscription come from the server
// (plan section 5). Under /api/billing, so a lapsed account can reach it
// (UNGATED_API_PREFIXES in src/proxy.ts).
//
// Phase 6: both verbs answer 409 `manual_payment_pending` while a manual
// UPI payment for the account is still under review, before any claim or
// Razorpay call.
// ============================================================

import { NextResponse } from 'next/server';

import { isSameOrigin } from '@/lib/http/request-origin';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  buildPaymentNotes,
  composeCheckoutDescription,
  normalizePrefillContact,
} from '@/lib/billing/razorpay/payment-details';
import { ensureProviderPlan } from '@/lib/billing/razorpay/plans';
import { resolvePaymentProvider } from '@/lib/billing/razorpay/provider';
import {
  getBillingDeps,
  toRazorpayErrorResponse,
} from '@/lib/billing/razorpay/runtime';
import {
  BillingServiceError,
  previewCheckout,
  startCheckout,
  type CheckoutCopy,
} from '@/lib/billing/razorpay/service';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { getAccountPricingRegion } from '@/lib/billing/pricing/region-store';
import { requireBillingOwnerWithState } from '@/lib/subscription/guard';
import {
  getPendingPaymentRequest,
  getRegionSettings,
  getSubscriptionSettings,
  QuoteError,
  resolveQuote,
} from '@/lib/subscription/queries';
import type {
  PricingRegionResolution,
  PublicSubscriptionSettings,
} from '@/lib/subscription/types';

export const dynamic = 'force-dynamic';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readIds(
  planId: unknown,
  cycleId: unknown
): { planId: string; cycleId: string } {
  if (
    typeof planId !== 'string' ||
    typeof cycleId !== 'string' ||
    !ID.test(planId) ||
    !ID.test(cycleId)
  ) {
    throw new QuoteError('A plan and billing term are required');
  }
  return { planId, cycleId };
}

function copyFrom(settings: PublicSubscriptionSettings): CheckoutCopy {
  return {
    business: settings.razorpay_checkout_name || 'Replai',
    consentTemplate: settings.autopay_consent_template,
    deferTemplate: settings.autopay_defer_summary_template,
    immediateTemplate: settings.autopay_immediate_summary_template,
  };
}

function assertRazorpayProvider(
  settings: PublicSubscriptionSettings,
  deps: ReturnType<typeof getBillingDeps>,
  accountId: string
) {
  const provider = resolvePaymentProvider({
    settingsProvider: settings.payment_provider,
    config: deps.config,
    accountId,
  });
  if (provider !== 'razorpay') {
    throw new BillingServiceError(
      'provider_unavailable',
      'Online AutoPay is not available for this workspace yet. Please contact support.',
      403
    );
  }
}

/**
 * Phase 6 (Phase 2 open item): a manual UPI payment still waiting for
 * review would grant access on approval, so AutoPay must not start a
 * second, overlapping purchase. The owner waits for the decision.
 */
async function assertNoPendingManualPayment(accountId: string) {
  const pending = await getPendingPaymentRequest(accountId);
  if (pending) {
    throw new BillingServiceError(
      'manual_payment_pending',
      'A manual UPI payment for this workspace is still being reviewed. You can set up AutoPay once it has been approved or rejected.',
      409
    );
  }
}

/**
 * Localized pricing: the region, its currency and its copy are resolved
 * here on every request from the owner's phone (or a live mandate). The
 * quote below refuses a cycle from any other region, so the amount and
 * currency sent to Razorpay are always the ones this workspace was shown.
 */
async function resolveCheckoutPricing(
  accountId: string,
  globalSettings: PublicSubscriptionSettings,
  deps: ReturnType<typeof getBillingDeps>
): Promise<{
  pricing: PricingRegionResolution;
  settings: PublicSubscriptionSettings;
}> {
  const pricing = await getAccountPricingRegion(accountId, {
    settings: globalSettings,
    config: deps.config,
  });
  const settings =
    pricing.region === 'global'
      ? globalSettings
      : await getRegionSettings(pricing.region, pricing.currency);
  return { pricing, settings };
}

export async function GET(request: Request) {
  try {
    const { ctx, state } = await requireBillingOwnerWithState();
    const deps = getBillingDeps();
    const globalSettings = await getSubscriptionSettings();
    assertRazorpayProvider(globalSettings, deps, ctx.accountId);
    await assertNoPendingManualPayment(ctx.accountId);

    const url = new URL(request.url);
    const { planId, cycleId } = readIds(
      url.searchParams.get('planId'),
      url.searchParams.get('cycleId')
    );
    const { pricing, settings } = await resolveCheckoutPricing(
      ctx.accountId,
      globalSettings,
      deps
    );
    const quote = await resolveQuote(planId, cycleId, pricing);

    const display = previewCheckout(deps, {
      accountId: ctx.accountId,
      state,
      quote,
      copy: copyFrom(settings),
    });
    return NextResponse.json({ display });
  } catch (err) {
    return toRazorpayErrorResponse(err, 'checkout preview');
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-site request refused', code: 'bad_origin' },
      { status: 403 }
    );
  }
  try {
    const { ctx, state } = await requireBillingOwnerWithState();

    const limit = checkRateLimit(
      `razorpay:checkout:${ctx.accountId}`,
      RATE_LIMITS.razorpayCheckout
    );
    if (!limit.success) return rateLimitResponse(limit);

    const deps = getBillingDeps();
    const globalSettings = await getSubscriptionSettings();
    assertRazorpayProvider(globalSettings, deps, ctx.accountId);
    await assertNoPendingManualPayment(ctx.accountId);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'bad_request' },
        { status: 400 }
      );
    }
    const { planId, cycleId } = readIds(body.planId, body.cycleId);
    const { pricing, settings } = await resolveCheckoutPricing(
      ctx.accountId,
      globalSettings,
      deps
    );
    const quote = await resolveQuote(planId, cycleId, pricing);

    const started = await startCheckout(deps, {
      accountId: ctx.accountId,
      userId: ctx.userId,
      state,
      quote,
      copy: copyFrom(settings),
      ensurePlan: () =>
        ensureProviderPlan({
          admin: supabaseAdmin(),
          client: deps.client,
          mode: deps.config.mode,
          env: deps.config.env,
          quote,
        }),
    });

    const contact = await deps.db.getContact(ctx.userId);
    const phone = normalizePrefillContact(contact.phone);
    const payNow = started.display.mode === 'pay_now';
    return NextResponse.json({
      keyId: started.keyId,
      subscriptionId: started.subscriptionId,
      reused: started.reused,
      display: started.display,
      checkout: {
        name: settings.razorpay_checkout_name || 'Replai',
        // Always names the plan and cycle; a custom admin description
        // becomes a prefix instead of replacing them.
        description: composeCheckoutDescription({
          setting: settings.razorpay_checkout_description,
          planName: quote.planName,
          cycleLabel: quote.cycleLabel,
        }),
        // Same keys the server writes after payment, so the Checkout
        // payment carries them from the start.
        notes: buildPaymentNotes({
          workspace: ctx.account?.name ?? null,
          accountId: ctx.accountId,
          planName: quote.planName,
          cycleLabel: quote.cycleLabel,
          chargeType: payNow ? 'first_payment' : 'card_verification',
          periodStart: payNow ? (deps.now?.() ?? new Date()) : null,
          periodEnd: payNow ? started.display.accessUntil : null,
          subscriptionId: started.subscriptionId,
          invoiceId: null,
          env: deps.config.env,
          mode: deps.config.mode,
        }),
        // The owner's own details; all editable in Checkout. The phone is
        // sent only when one is stored and valid.
        prefill: {
          name: contact.name ?? '',
          email: contact.email ?? '',
          ...(phone ? { contact: phone } : {}),
        },
      },
    });
  } catch (err) {
    return toRazorpayErrorResponse(err, 'checkout start');
  }
}
