import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SubscriberAutopay } from '@/types/super-admin';
import {
  AutopayManualActionWarning,
  type ManualIntent,
} from './autopay-warning';

/**
 * F6: a manual grant, date change or end of access does not move
 * Razorpay's charge schedule. The warning must appear exactly when
 * Razorpay will still charge, and say when and how much.
 */

function autopay(over: Partial<SubscriberAutopay> = {}): SubscriberAutopay {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    mode: 'live',
    status: 'active',
    paymentMethod: 'card',
    // 20:00 UTC on 5 Apr is 01:30 on 6 Apr in IST.
    chargeAt: '2027-04-05T20:00:00Z',
    amountMinor: 99900,
    currency: 'INR',
    providerSubscriptionId: 'sub_TEST123',
    charging: true,
    ...over,
  };
}

function render(
  a: SubscriberAutopay | null | undefined,
  intent: ManualIntent = 'give'
) {
  return renderToStaticMarkup(
    <AutopayManualActionWarning autopay={a} intent={intent} />
  );
}

describe('AutopayManualActionWarning', () => {
  it.each(['authenticated', 'active', 'pending'])(
    'warns for a charging %s AutoPay with the amount and IST date',
    (status) => {
      const html = render(autopay({ status }));
      expect(html).toContain('role="note"');
      expect(html).toContain('does not move Razorpay');
      expect(html).toContain('₹999');
      expect(html).toContain('6 Apr 2027');
      expect(html).not.toContain('test mode');
    }
  );

  it('names test mode for a test AutoPay', () => {
    const html = render(autopay({ mode: 'test', status: 'authenticated' }));
    expect(html).toContain('(authorised, test mode)');
  });

  it('shows the same warning when changing the end date', () => {
    expect(render(autopay(), 'date')).toContain('does not move Razorpay');
  });

  it.each([
    ['halted', autopay({ status: 'halted', charging: false })],
    ['paused', autopay({ status: 'paused', charging: false })],
    ['cancel at cycle end', autopay({ status: 'active', charging: false })],
    ['no AutoPay', null],
    ['unknown AutoPay', undefined],
  ])('renders nothing for %s', (_label, a) => {
    expect(render(a)).toBe('');
    expect(render(a, 'end')).toBe('');
  });

  it('end copy says ending access does not cancel AutoPay', () => {
    const end = render(autopay(), 'end');
    const give = render(autopay(), 'give');
    expect(end).toContain('Ending access here does not cancel AutoPay.');
    expect(end).toContain('Razorpay will still charge ₹999 on 6 Apr 2027');
    expect(give).not.toContain('Ending access here');
    expect(end).not.toBe(give);
  });

  it('links to the AutoPay in the Subscriptions tab', () => {
    expect(render(autopay())).toContain(
      'href="?tab=subscriptions&amp;view=autopay&amp;sub=11111111-2222-4333-8444-555555555555"'
    );
  });

  it('renders nothing for the advanced intent', () => {
    expect(render(autopay(), 'advanced')).toBe('');
  });
});
