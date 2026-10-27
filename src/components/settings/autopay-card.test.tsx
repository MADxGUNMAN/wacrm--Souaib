import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { makeRow } from '@/lib/billing/razorpay/__fixtures__/factories';
import type { BillingSubscriptionRow } from '@/lib/billing/razorpay/types';
import { autopayOptIn } from '@/lib/billing/razorpay/opt-in';
import { buildAutopayView } from '@/lib/billing/razorpay/view';
import { AutopayCardView } from './autopay-card';

/**
 * Plan section 3.5 is the single source of the AutoPay wording. These
 * render every customer-visible state and pin its label and the actions
 * offered, so "authorised" can never read like "paid" and a stopped
 * AutoPay always offers a way back.
 */

function render(
  row: Partial<BillingSubscriptionRow>,
  opts: { isOwner?: boolean; paid?: boolean; failure?: boolean } = {}
) {
  const autopay = buildAutopayView(makeRow(row), {
    currentCyclePaid: opts.paid ?? false,
    lastFailure: opts.failure
      ? {
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'insufficient_balance',
        }
      : null,
  });
  return renderToStaticMarkup(
    <AutopayCardView autopay={autopay} isOwner={opts.isOwner ?? true} />
  );
}

const card = {
  payment_method: 'card' as const,
  method_summary: { method: 'card', network: 'Visa', last4: '4366' },
};
const upi = {
  payment_method: 'upi' as const,
  method_summary: { method: 'upi', vpa_masked: 'te****@razorpay' },
};

describe('AutopayCardView', () => {
  it('without AutoPay, offers to set it up (owner) or says who can (member)', () => {
    const owner = renderToStaticMarkup(
      <AutopayCardView autopay={null} isOwner />
    );
    expect(owner).toContain('Not set up');
    expect(owner).toContain('Set up AutoPay');
    const member = renderToStaticMarkup(
      <AutopayCardView autopay={null} isOwner={false} />
    );
    expect(member).toContain('Only the workspace owner can change billing.');
    expect(member).not.toContain('href="/upgrade-plan"');
  });

  describe('Phase 6 opt-in prompt (not set up yet)', () => {
    const NOW = new Date('2026-10-22T10:00:00Z');
    const base = {
      isTrialing: false,
      isActive: false,
      isExpired: false,
      isBlocked: false,
      billingDisabled: false,
      endsAt: null as string | null,
      pendingWindow: null,
    };
    const paid = autopayOptIn({
      paymentProvider: 'razorpay',
      hasMandate: false,
      state: { ...base, isActive: true, endsAt: '2026-11-21T10:00:00Z' },
      now: NOW,
    });
    const trial = autopayOptIn({
      paymentProvider: 'razorpay',
      hasMandate: false,
      state: { ...base, isTrialing: true, endsAt: '2026-10-29T10:00:00Z' },
      now: NOW,
    });

    it('paid customer: "paid until" with the renewal date and the owner CTA', () => {
      const html = renderToStaticMarkup(
        <AutopayCardView autopay={null} optIn={paid} isOwner />
      );
      expect(html).toContain('You&#x27;re paid until 21 Nov 2026.');
      expect(html).toContain(
        'Set up AutoPay to renew automatically on 21 Nov 2026.'
      );
      expect(html).toContain('href="/upgrade-plan"');
      expect(html).not.toContain('Not set up');
    });

    it('trial customer: first charge at the end of the trial', () => {
      const html = renderToStaticMarkup(
        <AutopayCardView autopay={null} optIn={trial} isOwner />
      );
      expect(html).toContain('Your free trial runs until 29 Oct 2026.');
      expect(html).toContain('your first charge is on 29 Oct 2026');
    });

    it('member sees the prompt but no CTA', () => {
      const html = renderToStaticMarkup(
        <AutopayCardView autopay={null} optIn={paid} isOwner={false} />
      );
      expect(html).toContain('paid until 21 Nov 2026');
      expect(html).toContain('Only the workspace owner can change billing.');
      expect(html).not.toContain('href="/upgrade-plan"');
    });

    it('kind none falls back to the generic text', () => {
      const none = autopayOptIn({
        paymentProvider: 'manual_upi',
        hasMandate: false,
        state: { ...base, isActive: true, endsAt: '2026-11-21T10:00:00Z' },
        now: NOW,
      });
      const html = renderToStaticMarkup(
        <AutopayCardView autopay={null} optIn={none} isOwner />
      );
      expect(html).toContain('Not set up');
    });
  });

  it('authorised: says nothing has been charged, offers cancel and card change', () => {
    const html = render({
      status: 'authenticated',
      start_at: '2027-04-06T11:49:35Z',
      charge_at: '2027-04-06T11:49:35Z',
      ...card,
    });
    expect(html).toContain('AutoPay authorised');
    expect(html).toContain('Nothing has been charged yet');
    expect(html).toContain('First charge');
    expect(html).toContain('6 Apr 2027');
    expect(html).toContain('Visa •••• 4366');
    expect(html).toContain('Cancel AutoPay');
    expect(html).toContain('Change card');
    expect(html).not.toMatch(/Payment successful|Paid through/);
  });

  it('UPI mandate: no card change, masked VPA only', () => {
    const html = render({ status: 'authenticated', ...upi });
    expect(html).toContain('UPI te****@razorpay');
    expect(html).not.toContain('Change card');
    expect(html).toContain('Cancel AutoPay');
  });

  it('active and paid: "Subscription active" with the paid-through date', () => {
    const html = render(
      {
        status: 'active',
        current_end: '2027-05-06T11:49:35Z',
        charge_at: '2027-05-06T11:49:35Z',
        ...card,
      },
      { paid: true }
    );
    expect(html).toContain('Subscription active');
    expect(html).toContain('Renews automatically on 6 May 2027');
    expect(html).toContain('Paid through');
  });

  it('active but unpaid: "Payment pending", never "active"', () => {
    const html = render({ status: 'active', ...card });
    expect(html).toContain('Payment pending');
    expect(html).not.toContain('Subscription active');
  });

  it('retrying: plain-language reason and the retry promise', () => {
    const html = render({ status: 'pending', ...upi }, { failure: true });
    expect(html).toContain('Payment failed, retrying');
    expect(html).toContain('insufficient balance');
    expect(html).toContain('try again automatically');
    expect(html).toContain('enough balance for the retry');
  });

  it('halted: "Payment failed, action needed" with Renew now to the same plan', () => {
    const html = render({ status: 'halted', ...card }, { failure: true });
    expect(html).toContain('Payment failed, action needed');
    expect(html).toContain('Renew now');
    expect(html).toContain(
      '/upgrade-plan/payment?plan=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    expect(html).not.toContain('Change card');
  });

  it('paused: explains resuming, offers a new AutoPay', () => {
    const html = render({ status: 'paused', ...upi });
    expect(html).toContain('AutoPay paused');
    expect(html).toContain('resume it there');
    expect(html).toContain('Set up a new AutoPay');
  });

  it.each([
    ['cancelled', 'AutoPay cancelled'],
    ['completed', 'Subscription completed'],
  ] as const)(
    '%s: offers to set it up again, nothing to cancel',
    (status, label) => {
      const html = render({ status, ...card });
      expect(html).toContain(label);
      expect(html).toContain('Set up AutoPay again');
      expect(html).not.toContain('Cancel AutoPay');
    }
  );

  it('not finished: "Checkout not completed" with a way to finish', () => {
    const html = render({ status: 'created' });
    expect(html).toContain('Checkout not completed');
    expect(html).toContain('Finish setting up');
  });

  it('members see the facts but no actions', () => {
    const html = render(
      { status: 'authenticated', ...card },
      { isOwner: false }
    );
    expect(html).toContain('AutoPay authorised');
    expect(html).toContain('Only the workspace owner can change billing.');
    expect(html).not.toContain('Cancel AutoPay');
    expect(html).not.toContain('Change card');
  });
});
