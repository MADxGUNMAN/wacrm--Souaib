import { describe, expect, it } from 'vitest';

import { autopayOptIn, type AutopayOptInState } from './opt-in';

const NOW = new Date('2026-10-22T10:00:00Z');

function state(over: Partial<AutopayOptInState> = {}): AutopayOptInState {
  return {
    isTrialing: false,
    isActive: false,
    isExpired: false,
    isBlocked: false,
    billingDisabled: false,
    endsAt: null,
    pendingWindow: null,
    ...over,
  };
}

function optIn(
  s: AutopayOptInState,
  extra: Partial<Parameters<typeof autopayOptIn>[0]> = {}
) {
  return autopayOptIn({
    paymentProvider: 'razorpay',
    hasMandate: false,
    state: s,
    now: NOW,
    ...extra,
  });
}

describe('autopayOptIn', () => {
  const activePaid = state({ isActive: true, endsAt: '2026-11-21T10:00:00Z' });

  it('is none for manual UPI accounts (production today)', () => {
    expect(optIn(activePaid, { paymentProvider: 'manual_upi' }).kind).toBe(
      'none'
    );
    expect(optIn(activePaid, { paymentProvider: undefined }).kind).toBe('none');
  });

  it('is none once AutoPay exists', () => {
    expect(optIn(activePaid, { hasMandate: true }).kind).toBe('none');
  });

  it('is none when billing is switched off', () => {
    expect(optIn(state({ ...activePaid, billingDisabled: true })).kind).toBe(
      'none'
    );
  });

  it('paid window: "You\'re paid until X" and renews on X (IST date)', () => {
    const r = optIn(activePaid);
    expect(r.kind).toBe('paid');
    expect(r.renewsOn).toBe('2026-11-21T10:00:00.000Z');
    expect(r.headline).toBe("You're paid until 21 Nov 2026.");
    expect(r.detail).toBe(
      'Set up AutoPay to renew automatically on 21 Nov 2026. Nothing is charged before then.'
    );
  });

  it('formats the date in IST, not UTC', () => {
    // 20:00 UTC on 21 Nov is 01:30 IST on 22 Nov.
    const r = optIn(state({ isActive: true, endsAt: '2026-11-21T20:00:00Z' }));
    expect(r.headline).toBe("You're paid until 22 Nov 2026.");
  });

  it('a paid window queued behind the trial counts as paid, with the later end', () => {
    const r = optIn(
      state({
        isTrialing: true,
        endsAt: '2026-10-29T10:00:00Z',
        pendingWindow: { type: 'active', endsAt: '2026-11-28T10:00:00Z' },
      })
    );
    expect(r.kind).toBe('paid');
    expect(r.headline).toBe("You're paid until 28 Nov 2026.");
  });

  it('trial only: first charge at the end of the trial', () => {
    const r = optIn(
      state({ isTrialing: true, endsAt: '2026-10-29T10:00:00Z' })
    );
    expect(r.kind).toBe('trial');
    expect(r.headline).toBe('Your free trial runs until 29 Oct 2026.');
    expect(r.detail).toContain('your first charge is on 29 Oct 2026');
  });

  it('expired or blocked: access has ended, pay now', () => {
    for (const s of [
      state({ isExpired: true, endsAt: '2026-12-01T00:00:00Z' }),
      state({ isBlocked: true }),
    ]) {
      const r = optIn(s);
      expect(r.kind).toBe('lapsed');
      expect(r.renewsOn).toBeNull();
      expect(r.headline).toBe('Your access has ended.');
    }
  });

  it('ignores dates already in the past', () => {
    const r = optIn(
      state({
        isActive: true,
        endsAt: '2026-10-01T00:00:00Z',
        pendingWindow: { type: 'trialing', endsAt: '2026-09-01T00:00:00Z' },
      })
    );
    // No future coverage and the server did not say expired: no prompt
    // rather than a guessed "access has ended".
    expect(r.kind).toBe('none');
  });
});
