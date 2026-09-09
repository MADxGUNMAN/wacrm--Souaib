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
  getSelectedPlan,
  getSubscriptionSettings,
} from '@/lib/subscription/queries';
import { formatTrialBadge, formatTrialBanner } from '@/lib/subscription/status';

export async function GET() {
  try {
    const { ctx, state } = await getBillingContext();

    const [settings, row, owner, pending, latest, selectedPlan] =
      await Promise.all([
        getSubscriptionSettings(),
        getAccountSubscription(ctx.accountId),
        getAccountOwnerContact(ctx.accountId),
        getPendingPaymentRequest(ctx.accountId),
        getLatestPaymentRequest(ctx.accountId),
        getSelectedPlan(ctx.accountId),
      ]);

    const isOwner = ctx.role === 'owner';

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
