// ============================================================
// GET /api/billing/subscription
//
// One endpoint feeding four surfaces, so they can never disagree about
// whether an account is in trial:
//   - the trial banner in the dashboard shell
//   - the Billing tab in Settings
//   - /upgrade-plan (owner)
//   - the member-blocked screen (non-owner)
//
// Returns the LIVE state (derived from timestamps, not the stored
// status column), the owner's contact details, resolved member-blocked
// copy, and any payment currently under review.
//
// Auth only — deliberately not gated on having a subscription, since
// every consumer above has to work precisely when the account is
// blocked.
// ============================================================

import { NextResponse } from 'next/server';

import {
  fillTemplate,
  formatCopyDate,
  ownerDisplayName,
} from '@/lib/subscription/copy';
import {
  getBillingContext,
  toBillingErrorResponse,
} from '@/lib/subscription/guard';
import {
  getAccountOwnerContact,
  getAccountSubscription,
  getLatestPaymentRequest,
  getPendingPaymentRequest,
  getRegionSettings,
  getSelectedPlan,
  getSubscriptionSettings,
} from '@/lib/subscription/queries';
import { regionLabel } from '@/lib/billing/pricing/regions';
import { getAccountPricingRegion } from '@/lib/billing/pricing/region-store';
import { formatTrialBadge, formatTrialBanner } from '@/lib/subscription/status';
import { isTrialOfferVisible } from '@/lib/billing/razorpay/checkout';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { createBillingDb } from '@/lib/billing/razorpay/db';
import { resolvePaymentProvider } from '@/lib/billing/razorpay/provider';
import { loadAutopayView } from '@/lib/billing/razorpay/service';
import type { AutopayView } from '@/lib/billing/razorpay/view';
import { formatBillingDate } from '@/lib/billing/razorpay/format';
import type { SubscriptionState } from '@/lib/subscription/status';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { REFUND_POLICY_SLUG } from '@/lib/cms/legal-slugs';

/**
 * Is the Refund and Cancellation Policy published? Best effort: any error
 * answers false, so the payment page simply shows no link rather than a
 * link to a page that may 404.
 */
async function isRefundPolicyPublished(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('legal_pages')
      .select('slug')
      .eq('slug', REFUND_POLICY_SLUG)
      .eq('is_published', true)
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

/**
 * The "Cancel AutoPay?" text. `{access_until}` is the last day already
 * covered (trial, paid, or a queued window), in IST like every billing
 * date. If nothing is still covered (a renewal is being retried), say
 * plainly that access ends now rather than print a past date.
 */
function autopayCancelNote(
  template: string | null,
  state: SubscriptionState,
  now: Date = new Date()
): string {
  const ends = [state.endsAt, state.pendingWindow?.endsAt ?? null].filter(
    (d): d is Date => d instanceof Date && d.getTime() > now.getTime()
  );
  if (ends.length === 0) {
    return 'Cancelling stops future charges. The current payment has not been collected, so your access ends when you cancel. Payments already made are not refunded.';
  }
  const accessUntil = formatBillingDate(
    new Date(Math.max(...ends.map((d) => d.getTime())))
  );
  return (
    fillTemplate(template, { access_until: accessUntil }) ||
    `Cancelling stops future charges. Your access continues until ${accessUntil}. Payments already made are not refunded.`
  );
}

export async function GET() {
  try {
    const { ctx, state } = await getBillingContext();

    const [
      globalSettings,
      row,
      owner,
      pending,
      latest,
      pricing,
      refundPolicyPublished,
    ] = await Promise.all([
      getSubscriptionSettings(),
      getAccountSubscription(ctx.accountId),
      getAccountOwnerContact(ctx.accountId),
      getPendingPaymentRequest(ctx.accountId),
      getLatestPaymentRequest(ctx.accountId),
      getAccountPricingRegion(ctx.accountId),
      isRefundPolicyPublished(),
    ]);

    // Localized pricing: a country plan layers its copy and currency over
    // Global. Global accounts keep the exact settings row as before.
    const [settings, selectedPlan] = await Promise.all([
      pricing.region === 'global'
        ? Promise.resolve(globalSettings)
        : getRegionSettings(pricing.region, pricing.currency),
      getSelectedPlan(ctx.accountId, pricing),
    ]);

    const isOwner = ctx.role === 'owner';

    // ---- Razorpay AutoPay (Phase 2) ----
    // Which purchase flow this account gets is decided here, per request,
    // and the Razorpay routes enforce the same answer. `autopay` comes from
    // our database only (no Razorpay call on this hot path); the status
    // route does the refetching.
    const razorpay = getRazorpayConfig();
    const paymentProvider = resolvePaymentProvider({
      settingsProvider: settings.payment_provider,
      config: razorpay,
      accountId: ctx.accountId,
    });
    let autopay: AutopayView | null = null;
    if (razorpay) {
      try {
        const db = createBillingDb();
        autopay = await loadAutopayView(
          db,
          await db.getLatestSubscription(ctx.accountId, razorpay.mode)
        );
      } catch (err) {
        console.error(
          '[billing] autopay read failed:',
          err instanceof Error ? err.message : err
        );
      }
    }
    const hasPaidCoverage =
      state.isActive || state.pendingWindow?.type === 'active';
    const trialOfferVisible = isTrialOfferVisible({
      showTrialBadges: settings.show_trial_badges,
      trialDays: settings.trial_days,
      isBlocked: state.isBlocked,
      billingDisabled: state.billingDisabled,
      hasPaidCoverage,
      hasLiveAutopay: autopay?.hasMandate === true,
    });

    // Resolve admin-authored templates server-side so all four consumers
    // render identical text and none of them has to know the
    // placeholder vocabulary.
    const copyVars = {
      account_name: ctx.account.name,
      owner_name: ownerDisplayName(owner),
      owner_email: owner?.email ?? null,
      plan_name: row?.subscription_plan_name ?? null,
      expired_on: formatCopyDate(state.endsAt),
    };

    // Withholding is a setting, so honour it on the SERVER rather than
    // trusting the client to skip rendering a field it was handed.
    const exposeOwnerContact =
      settings.member_blocked_show_owner_contact && !isOwner;

    return NextResponse.json({
      role: ctx.role,
      isOwner,
      account: { id: ctx.account.id, name: ctx.account.name },

      state: {
        status: state.status,
        isTrialing: state.isTrialing,
        isActive: state.isActive,
        isExpired: state.isExpired,
        isBlocked: state.isBlocked,
        inGracePeriod: state.inGracePeriod,
        autopayGraceEndsAt: state.autopayGraceEndsAt
          ? state.autopayGraceEndsAt.toISOString()
          : null,
        billingDisabled: state.billingDisabled,
        daysLeft: state.daysLeft,
        endsAt: state.endsAt ? state.endsAt.toISOString() : null,
        pendingWindow: state.pendingWindow
          ? {
              type: state.pendingWindow.type,
              startsAt: state.pendingWindow.startsAt.toISOString(),
              endsAt: state.pendingWindow.endsAt.toISOString(),
              durationDays: state.pendingWindow.durationDays,
            }
          : null,
      },

      subscription: row
        ? {
            planName: row.subscription_plan_name,
            cycleLabel: row.subscription_cycle_label,
            startedAt: row.subscription_started_at,
            endsAt: row.subscription_ends_at,
            trialEndsAt: row.trial_ends_at,
          }
        : null,

      // ---- The plan they picked but have not paid for ----
      //
      // Distinct from `subscription` above, which is what they HOLD. This
      // is what they chose on /upgrade-plan, and it is what Billing's
      // "upcoming plan" card and the trial-end redirect both key on.
      //
      // Null when there is no usable choice — including when the plan or
      // cycle has since been deleted or unpriced, which `getSelectedPlan`
      // checks. A null here means "ask them to choose again", never
      // "render a Pay button that cannot be honoured".
      selectedPlan,

      /**
       * TRUE while this account still has to pick a plan before using the
       * CRM. Only ever true for accounts created after the plan-selection
       * migration — every pre-existing account was grandfathered out.
       */
      planSelectionRequired: row?.plan_selection_required === true,
      // Which pricing this workspace sees and is charged in.
      pricingRegion: {
        region: pricing.region,
        currency: pricing.currency,
        label: regionLabel(pricing.region),
        // A live mandate keeps charging its own currency (and price) even
        // after a Global currency change; `autopay` carries the amount.
        mandateCurrency: pricing.mandateCurrency ?? null,
      },

      // 'manual_upi' or 'razorpay' for THIS account on THIS deployment.
      paymentProvider,
      // Text for the "Cancel AutoPay?" dialog, filled server-side.
      autopayCancelNote: autopay
        ? autopayCancelNote(settings.autopay_cancel_note, state)
        : null,
      // The customer-safe AutoPay projection, or null.
      autopay,
      // Same rule /upgrade-plan used, plus: never once AutoPay exists.
      trialOfferVisible,

      // Only what the screens actually render, not the whole settings
      // row — no reason to ship the UPI id to a member who cannot pay.
      copy: {
        trialBanner:
          state.isTrialing && state.daysLeft !== null
            ? formatTrialBanner(settings.trial_banner_template, state.daysLeft)
            : null,
        trialBannerCta: settings.trial_banner_cta,
        freePlanLabel: settings.free_plan_label,
        freePlanSubtitle: settings.free_plan_subtitle,

        // ---- Trial-first onboarding + upcoming-plan card ----
        // Resolved here so /upgrade-plan and Settings -> Billing render
        // the same words, and neither has to know the placeholder
        // vocabulary. `trialBadge` is filled from `trial_days`, NOT from
        // this account's remaining days — it describes the offer, not the
        // account.
        showTrialBadges: settings.show_trial_badges,
        trialBadge: formatTrialBadge(
          settings.trial_badge_template,
          settings.trial_days
        ),
        noCardLabel: settings.no_card_label,
        trialCtaLabel: settings.trial_cta_label,
        trialCtaNote: settings.trial_cta_note,
        upcomingPlanLabel: settings.upcoming_plan_label,
        upcomingUnpaidLabel: settings.upcoming_unpaid_label,
        payNowLabel: settings.pay_now_label,
        changePlanLabel: settings.change_plan_label,
        expiredHeading: settings.expired_heading,
        pendingReviewMessage: settings.pending_review_message,
        supportNote: settings.support_note,
        // Phase 6: linked from the AutoPay consent only once published.
        refundPolicyHref: refundPolicyPublished
          ? `/legal/${REFUND_POLICY_SLUG}`
          : null,
        memberBlocked: {
          heading: fillTemplate(settings.member_blocked_heading, copyVars),
          body: fillTemplate(settings.member_blocked_body, copyVars),
          note: fillTemplate(settings.member_blocked_note, copyVars),
          contactLabel: settings.member_blocked_contact_label,
        },
      },

      owner: exposeOwnerContact
        ? { name: ownerDisplayName(owner), email: owner?.email ?? null }
        : null,

      pendingPayment: pending
        ? {
            id: pending.id,
            planName: pending.plan_name_snapshot,
            cycleLabel: pending.cycle_label_snapshot,
            expectedAmount: pending.expected_amount,
            paidAmount: pending.paid_amount,
            currency: pending.currency,
            transactionRef: pending.transaction_ref,
            submittedAt: pending.created_at,
          }
        : null,

      // Surfaces a rejection reason so a customer whose payment bounced
      // sees why, instead of silently landing back on the pricing page.
      lastPayment:
        latest && latest.status !== 'pending'
          ? {
              id: latest.id,
              status: latest.status,
              planName: latest.plan_name_snapshot,
              cycleLabel: latest.cycle_label_snapshot,
              reviewNote: latest.review_note,
              reviewedAt: latest.reviewed_at,
            }
          : null,
    });
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}
