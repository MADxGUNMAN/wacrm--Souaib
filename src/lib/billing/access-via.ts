// ============================================================
// How a workspace has (or last had) access, for the Workspaces list
// (pure).
//
// Derived from existing data only: the workspace's live status, its
// AutoPay row and the newest GRANT event (a paid-time event, classified
// by classifyBillingEvent). When nothing recorded explains the access,
// the answer is "Not recorded", never a guess (AGENTS.md §6).
//
//   none                          -> none (ungated)
//   trialing                      -> trial
//   active                        -> channel of the newest grant;
//                                    no grant but AutoPay active -> AutoPay;
//                                    otherwise unknown
//   expired                       -> same as active with current = false;
//                                    no grant and never paid -> trial
// ============================================================

import type { SubscriberAccessVia } from '@/types/super-admin';

import type { BillingChannel } from './event-channel';

/** subscription_events types that grant paid time. Trials are not grants. */
export const GRANT_EVENT_TYPES = [
  'payment_succeeded',
  'payment_approved',
  'subscription_activated',
  'subscription_extended',
] as const;

export interface LatestGrant {
  channel: BillingChannel;
  createdAt: string;
}

export interface AccessViaInput {
  liveStatus: 'trialing' | 'active' | 'expired' | 'none';
  /** billing_subscriptions.status / mode of the workspace's AutoPay. */
  autopay: { status: string; mode: string } | null | undefined;
  latestGrant: LatestGrant | null;
  /** accounts.subscription_ends_at is set: the workspace has had paid time. */
  hadPaidWindow: boolean;
}

const AUTOPAY_SET_UP = new Set(['authenticated', 'active']);

function fromGrant(
  grant: LatestGrant | null,
  autopay: AccessViaInput['autopay']
): Pick<SubscriberAccessVia, 'kind' | 'since'> | null {
  if (grant) {
    if (grant.channel === 'razorpay') {
      return { kind: 'razorpay_autopay', since: grant.createdAt };
    }
    if (grant.channel === 'manual_upi') {
      return { kind: 'manual_upi', since: grant.createdAt };
    }
    if (grant.channel === 'admin') {
      return { kind: 'admin_grant', since: grant.createdAt };
    }
  }
  if (autopay?.status === 'active') {
    return { kind: 'razorpay_autopay', since: null };
  }
  return null;
}

export function deriveAccessVia(input: AccessViaInput): SubscriberAccessVia {
  const { liveStatus, autopay, latestGrant } = input;
  if (liveStatus === 'none') {
    return { kind: 'none', current: true, since: null, detail: null };
  }
  if (liveStatus === 'trialing') {
    return {
      kind: 'trial',
      current: true,
      since: null,
      detail:
        autopay && AUTOPAY_SET_UP.has(autopay.status) ? 'AutoPay set up' : null,
    };
  }
  const current = liveStatus === 'active';
  const hit = fromGrant(latestGrant, autopay);
  if (hit) {
    return {
      ...hit,
      current,
      detail:
        hit.kind === 'razorpay_autopay' && autopay?.mode === 'test'
          ? 'Test mode'
          : null,
    };
  }
  if (!current && !input.hadPaidWindow) {
    return { kind: 'trial', current: false, since: null, detail: null };
  }
  return { kind: 'unknown', current, since: null, detail: null };
}
