import { describe, expect, it } from 'vitest';

import { resolveSubscriptionState } from './status';

const NOW = new Date('2026-10-21T06:00:00.000Z');
const DAY = 86_400_000;
const at = (offsetMs: number) =>
  new Date(NOW.getTime() + offsetMs).toISOString();
const CONFIG = { is_enabled: true, grace_days: 0 };

describe('resolveSubscriptionState — Razorpay AutoPay grace', () => {
  it('changes nothing when billing_grace_ends_at is absent or null', () => {
    const lapsed = {
      subscription_status: 'active' as const,
      subscription_ends_at: at(-DAY),
    };
    for (const row of [lapsed, { ...lapsed, billing_grace_ends_at: null }]) {
      const s = resolveSubscriptionState(row, CONFIG, NOW);
      expect(s.isBlocked).toBe(true);
      expect(s.inGracePeriod).toBe(false);
      expect(s.autopayGraceEndsAt).toBeNull();
    }
  });

  it('keeps a lapsed account open while the AutoPay charge is being collected', () => {
    const s = resolveSubscriptionState(
      {
        subscription_status: 'active',
        subscription_ends_at: at(-DAY),
        billing_grace_ends_at: at(2 * DAY),
      },
      CONFIG,
      NOW
    );
    expect(s.status).toBe('expired');
    expect(s.isActive).toBe(false);
    expect(s.isBlocked).toBe(false);
    expect(s.inGracePeriod).toBe(true);
    expect(s.autopayGraceEndsAt?.toISOString()).toBe(at(2 * DAY));
  });

  it('blocks once the AutoPay grace has passed', () => {
    const s = resolveSubscriptionState(
      {
        subscription_status: 'trialing',
        trial_ends_at: at(-5 * DAY),
        billing_grace_ends_at: at(-DAY),
      },
      CONFIG,
      NOW
    );
    expect(s.isBlocked).toBe(true);
    expect(s.autopayGraceEndsAt).toBeNull();
  });

  it('never overrides an operator revoke', () => {
    const s = resolveSubscriptionState(
      {
        subscription_status: 'expired',
        subscription_ends_at: at(10 * DAY),
        billing_grace_ends_at: at(2 * DAY),
      },
      CONFIG,
      NOW
    );
    expect(s.isBlocked).toBe(true);
    expect(s.autopayGraceEndsAt).toBeNull();
  });

  it('is irrelevant while a window is still open', () => {
    const s = resolveSubscriptionState(
      {
        subscription_status: 'trialing',
        trial_ends_at: at(3 * DAY),
        billing_grace_ends_at: at(6 * DAY),
      },
      CONFIG,
      NOW
    );
    expect(s.isTrialing).toBe(true);
    expect(s.isBlocked).toBe(false);
    expect(s.inGracePeriod).toBe(false);
    expect(s.autopayGraceEndsAt).toBeNull();
  });

  it('is ignored when billing is switched off or the account is ungated', () => {
    const off = resolveSubscriptionState(
      { billing_grace_ends_at: at(DAY) },
      { is_enabled: false, grace_days: 0 },
      NOW
    );
    expect(off.autopayGraceEndsAt).toBeNull();
    const none = resolveSubscriptionState(
      { subscription_status: 'none', billing_grace_ends_at: at(DAY) },
      CONFIG,
      NOW
    );
    expect(none.autopayGraceEndsAt).toBeNull();
  });
});
