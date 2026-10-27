import { describe, expect, it } from 'vitest';

import { makeRow } from './__fixtures__/factories';
import { classifyAutopay } from './outcome';
import type { BillingSubscriptionRow } from './types';
import { buildAutopayView } from './view';

function view(
  row: Partial<BillingSubscriptionRow>,
  extras: { currentCyclePaid?: boolean; failure?: boolean } = {}
) {
  return buildAutopayView(makeRow(row), {
    currentCyclePaid: extras.currentCyclePaid ?? false,
    lastFailure: extras.failure
      ? {
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'insufficient_balance',
        }
      : null,
  });
}

describe('classifyAutopay', () => {
  it('is "paid" when the server granted access, whatever the subscription says', () => {
    expect(
      classifyAutopay(
        view({ status: 'authenticated', intent: 'immediate' }),
        'granted'
      )?.kind
    ).toBe('paid');
    expect(classifyAutopay(null, 'granted')?.kind).toBe('paid');
  });

  it('is "paid" when the current cycle is covered (a repeat verify or a poll)', () => {
    expect(
      classifyAutopay(
        view({ status: 'active' }, { currentCyclePaid: true }),
        'recorded'
      )?.kind
    ).toBe('paid');
  });

  it('is "authorised" for a deferred start with an authorised mandate', () => {
    for (const intent of ['defer_to_trial_end', 'defer_to_paid_end'] as const) {
      expect(
        classifyAutopay(view({ status: 'authenticated', intent }), 'recorded')
          ?.kind
      ).toBe('authorised');
    }
  });

  it('keeps an immediate start "processing" until its first charge lands', () => {
    expect(
      classifyAutopay(
        view({ status: 'authenticated', intent: 'immediate' }),
        'recorded'
      )
    ).toBeNull();
    expect(
      classifyAutopay(
        view({ status: 'active', intent: 'immediate' }),
        'awaiting_invoice'
      )
    ).toBeNull();
  });

  it('is "failed" when Razorpay is retrying or has halted, with a plain reason', () => {
    const r = classifyAutopay(view({ status: 'pending' }, { failure: true }));
    expect(r).toEqual({
      kind: 'failed',
      reason: 'Your bank declined the payment because of insufficient balance.',
      paymentId: null,
    });
    expect(classifyAutopay(view({ status: 'halted' }))?.kind).toBe('failed');
  });

  it('does not treat an old failure on an unauthorised checkout as this attempt failing', () => {
    expect(
      classifyAutopay(view({ status: 'created' }, { failure: true }))
    ).toBeNull();
  });

  it('waits when there is nothing to show yet', () => {
    expect(classifyAutopay(null)).toBeNull();
  });
});
