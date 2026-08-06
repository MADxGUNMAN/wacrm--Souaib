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

import { fillTemplate, formatCopyDate, ownerDisplayName } from '@/lib/subscription/copy';
import { getBillingContext, toBillingErrorResponse } from '@/lib/subscription/guard';
import {
  getAccountOwnerContact,
  getAccountSubscription,
  getLatestPaymentRequest,
  getPendingPaymentRequest,
  getSubscriptionSettings,
} from '@/lib/subscription/queries';
import { formatTrialBanner } from '@/lib/subscription/status';

export async function GET() {
  try {
    const { ctx, state } = await getBillingContext();

    const [settings, row, owner, pending, latest] = await Promise.all([
      getSubscriptionSettings(),
      getAccountSubscription(ctx.accountId),
      getAccountOwnerContact(ctx.accountId),
      getPendingPaymentRequest(ctx.accountId),
      getLatestPaymentRequest(ctx.accountId),
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
