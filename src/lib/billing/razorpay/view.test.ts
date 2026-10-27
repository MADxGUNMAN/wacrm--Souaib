import { describe, expect, it } from 'vitest';

import { makeRow } from './__fixtures__/factories';
import { buildAutopayView } from './view';

const NONE = { currentCyclePaid: false, lastFailure: null };

describe('buildAutopayView', () => {
  it.each(['superseded', 'failed_to_create', 'expired'] as const)(
    'hides a %s subscription from the customer',
    (status) => {
      expect(buildAutopayView(makeRow({ status }), NONE)).toBeNull();
    }
  );

  it('never exposes provider ids, internal errors or the short link', () => {
    const view = buildAutopayView(makeRow({ status: 'authenticated' }), NONE);
    const json = JSON.stringify(view);
    expect(json).not.toContain('cust_Secret0001');
    expect(json).not.toContain('sub_Unit000001');
    expect(json).not.toContain('rzp.io');
    expect(json).not.toContain('internal detail');
    expect(json).not.toContain('internal anomaly');
  });

  it('counts a working mandate only when it will charge: authorised, active or retrying', () => {
    for (const status of ['authenticated', 'active', 'pending'] as const) {
      const view = buildAutopayView(makeRow({ status }), NONE);
      expect(view?.hasMandate).toBe(true);
      expect(view?.canReplace).toBe(false);
    }
    // Stopped or paused: it exists but will not charge, so a new checkout
    // may replace it.
    for (const status of ['halted', 'paused'] as const) {
      const view = buildAutopayView(makeRow({ status }), NONE);
      expect(view?.hasMandate).toBe(false);
      expect(view?.canReplace).toBe(true);
    }
    for (const status of ['created', 'cancelled', 'completed'] as const) {
      const view = buildAutopayView(makeRow({ status }), NONE);
      expect(view?.hasMandate).toBe(false);
      expect(view?.canReplace).toBe(false);
    }
  });

  it('carries the catalogue ids for renew links', () => {
    const view = buildAutopayView(makeRow({ status: 'halted' }), NONE);
    expect(view).toMatchObject({
      planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      cycleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
  });

  it('does not count a mandate that ends at the period end', () => {
    const view = buildAutopayView(
      makeRow({ status: 'active', cancel_at_cycle_end: true }),
      NONE
    );
    expect(view?.hasMandate).toBe(false);
    expect(view?.display.key).toBe('cancel_scheduled');
  });

  it('says "Subscription active" only when the current cycle is paid', () => {
    expect(
      buildAutopayView(makeRow({ status: 'active' }), NONE)?.display.key
    ).toBe('payment_pending');
    expect(
      buildAutopayView(makeRow({ status: 'active' }), {
        currentCyclePaid: true,
        lastFailure: null,
      })?.display.key
    ).toBe('subscription_active');
  });

  it('summarises the payment method from method_summary, masked', () => {
    const view = buildAutopayView(
      makeRow({
        status: 'active',
        payment_method: 'card',
        method_summary: { method: 'card', network: 'Visa', last4: '1111' },
      }),
      NONE
    );
    expect(view?.method).toEqual({
      type: 'card',
      network: 'Visa',
      last4: '1111',
      vpaMasked: null,
    });
  });

  it('falls back to the bare method when there is no summary', () => {
    const view = buildAutopayView(
      makeRow({ status: 'active', payment_method: 'upi' }),
      NONE
    );
    expect(view?.method).toEqual({
      type: 'upi',
      network: null,
      last4: null,
      vpaMasked: null,
    });
  });

  it('turns the last failure into plain language', () => {
    const view = buildAutopayView(makeRow({ status: 'pending' }), {
      currentCyclePaid: false,
      lastFailure: { error_code: 'SERVER_ERROR', error_reason: 'server_error' },
    });
    expect(view?.lastFailure).toMatch(/temporary problem/);
    expect(view?.lastFailure).not.toMatch(/card_mandate_process/);
  });

  it('carries the amount in minor units as a number', () => {
    const view = buildAutopayView(
      makeRow({
        status: 'authenticated',
        amount_minor: '99000' as unknown as number,
      }),
      NONE
    );
    expect(view?.amountMinor).toBe(99000);
  });
});
