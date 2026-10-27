import { describe, expect, it } from 'vitest';

import { resolveSubscriptionState } from '@/lib/subscription/status';
import type { AccountSubscriptionRow } from '@/lib/subscription/types';
import {
  MIN_DEFER_MS,
  computeCoverageEnd,
  computeFirstCharge,
  computeTotalCount,
  hasLiveAutopay,
  isTrialOfferVisible,
} from './checkout';

const NOW = new Date('2026-10-21T06:00:00.000Z');
const DAY = 86_400_000;
const at = (offsetMs: number) =>
  new Date(NOW.getTime() + offsetMs).toISOString();

function state(
  row: Partial<AccountSubscriptionRow>,
  config = { is_enabled: true, grace_days: 0 }
) {
  return resolveSubscriptionState(row, config, NOW);
}

describe('computeFirstCharge', () => {
  it('defers to the trial end for a trial user (no new trial, no charge today)', () => {
    const trialEnd = at(10 * DAY);
    const fc = computeFirstCharge({
      state: state({
        subscription_status: 'trialing',
        trial_ends_at: trialEnd,
      }),
      now: NOW,
    });
    expect(fc).toEqual({
      intent: 'defer_to_trial_end',
      startAt: new Date(trialEnd),
    });
  });

  it('uses the existing trial end for an already running trial, not a fresh window', () => {
    const trialEnd = at(2 * DAY + 3_600_000);
    const fc = computeFirstCharge({
      state: state({
        subscription_status: 'trialing',
        trial_ends_at: trialEnd,
      }),
      now: NOW,
    });
    expect(fc.startAt?.toISOString()).toBe(trialEnd);
  });

  it('defers to the paid-through date for a manually paid customer (no double charge)', () => {
    const paidEnd = at(40 * DAY);
    const fc = computeFirstCharge({
      state: state({
        subscription_status: 'active',
        subscription_ends_at: paidEnd,
        trial_ends_at: at(-60 * DAY),
      }),
      now: NOW,
    });
    expect(fc).toEqual({
      intent: 'defer_to_paid_end',
      startAt: new Date(paidEnd),
    });
  });

  it('defers to the END of a paid window queued behind a trial', () => {
    const trialEnd = at(5 * DAY);
    const paidEnd = at(35 * DAY);
    const fc = computeFirstCharge({
      state: state({
        subscription_status: 'trialing',
        trial_ends_at: trialEnd,
        subscription_ends_at: paidEnd,
      }),
      now: NOW,
    });
    expect(fc).toEqual({
      intent: 'defer_to_paid_end',
      startAt: new Date(paidEnd),
    });
  });

  it('charges now when the trial has expired', () => {
    const fc = computeFirstCharge({
      state: state({
        subscription_status: 'trialing',
        trial_ends_at: at(-DAY),
      }),
      now: NOW,
    });
    expect(fc).toEqual({ intent: 'immediate', startAt: null });
  });

  it('charges now when coverage ends within the safety margin', () => {
    const fc = computeFirstCharge({
      state: state({
        subscription_status: 'trialing',
        trial_ends_at: at(MIN_DEFER_MS - 1000),
      }),
      now: NOW,
    });
    expect(fc.intent).toBe('immediate');
  });

  it('charges now during the global grace period (grace is not coverage)', () => {
    const s = state(
      { subscription_status: 'active', subscription_ends_at: at(-DAY) },
      { is_enabled: true, grace_days: 3 }
    );
    expect(s.inGracePeriod).toBe(true);
    expect(computeFirstCharge({ state: s, now: NOW }).intent).toBe('immediate');
  });

  it('has no coverage when billing is off or the account is ungated', () => {
    expect(
      computeCoverageEnd(state({ subscription_status: 'none' }), NOW)
    ).toBeNull();
    expect(
      computeCoverageEnd(
        resolveSubscriptionState({}, { is_enabled: false, grace_days: 0 }, NOW),
        NOW
      )
    ).toBeNull();
    expect(
      computeCoverageEnd(
        state({
          subscription_status: 'expired',
          subscription_ends_at: at(DAY),
        }),
        NOW
      )
    ).toBeNull();
  });
});

describe('computeTotalCount', () => {
  it('fits about ten years of cycles after the deferral', () => {
    expect(computeTotalCount(30, null, NOW)).toBe(121);
    expect(computeTotalCount(360, null, NOW)).toBe(10);
    expect(
      computeTotalCount(360, new Date(NOW.getTime() + 14 * DAY), NOW)
    ).toBe(10);
    expect(
      computeTotalCount(30, new Date(NOW.getTime() + 360 * DAY), NOW)
    ).toBe(109);
    expect(computeTotalCount(5000, null, NOW)).toBe(1);
  });

  it('rejects a non-positive duration', () => {
    expect(() => computeTotalCount(0, null, NOW)).toThrow();
    expect(() => computeTotalCount(2.5, null, NOW)).toThrow();
  });
});

describe('trial offer and existing AutoPay', () => {
  const base = {
    showTrialBadges: true,
    trialDays: 14,
    isBlocked: false,
    billingDisabled: false,
    hasPaidCoverage: false,
    hasLiveAutopay: false,
  };

  it('matches the existing /upgrade-plan rule and hides once AutoPay exists', () => {
    expect(isTrialOfferVisible(base)).toBe(true);
    expect(isTrialOfferVisible({ ...base, isBlocked: true })).toBe(false);
    expect(isTrialOfferVisible({ ...base, trialDays: 0 })).toBe(false);
    expect(isTrialOfferVisible({ ...base, hasPaidCoverage: true })).toBe(false);
    expect(isTrialOfferVisible({ ...base, hasLiveAutopay: true })).toBe(false);
  });

  it('counts only real mandates, not unauthorised or cancelled-at-cycle-end ones', () => {
    expect(
      hasLiveAutopay([{ status: 'created' }, { status: 'cancelled' }])
    ).toBe(false);
    expect(hasLiveAutopay([{ status: 'authenticated' }])).toBe(true);
    expect(
      hasLiveAutopay([{ status: 'active', cancel_at_cycle_end: true }])
    ).toBe(false);
    expect(hasLiveAutopay([{ status: 'halted' }])).toBe(true);
  });
});
