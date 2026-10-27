import { describe, expect, it } from 'vitest';

import type { BillingNotificationKind } from '@/lib/billing/razorpay/types';
import { renderAutopayEmail, type AutopayEmailContext } from './autopay';

const ctx: AutopayEmailContext = {
  branding: {
    siteName: 'Replai',
    supportEmail: 'support@example.com',
    appUrl: 'https://app.example.com',
    logoUrl: null,
    logoDarkUrl: null,
  },
  recipientName: 'Demo Owner',
  supportNote: null,
};

const base = {
  plan_name: 'Replai',
  cycle_label: 'Yearly',
  amount_minor: 900000,
  currency: 'INR',
  duration_days: 360,
};

const ALL: BillingNotificationKind[] = [
  'mandate_authenticated',
  'payment_receipt',
  'payment_failed',
  'payment_retry_final',
  'action_required',
  'autopay_cancelled',
  'autopay_paused',
  'subscription_completed',
  'refund_processed',
];

describe('renderAutopayEmail', () => {
  it.each(ALL)('renders %s with a subject, greeting and plain text', (kind) => {
    const email = renderAutopayEmail(kind, base, ctx);
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.html).toContain('Hi Demo,');
    expect(email.text.length).toBeGreaterThan(20);
  });

  it('never calls an authorisation a payment, and says nothing was charged', () => {
    const email = renderAutopayEmail(
      'mandate_authenticated',
      {
        ...base,
        first_charge_at: '2027-04-06T11:49:35Z',
        method_summary: { method: 'upi', vpa_masked: 'te****@razorpay' },
      },
      ctx
    );
    expect(email.subject).toMatch(/not been charged/i);
    expect(email.text).toMatch(/not a payment/i);
    expect(email.text).not.toMatch(/receipt/i);
    expect(email.text).toContain('6 Apr 2027 (IST)');
    expect(email.text).toContain('₹9,000 every 360 days');
    expect(email.text).toContain('UPI te****@razorpay');
  });

  it('receipt shows the amount, IST dates, masked method and invoice link', () => {
    const email = renderAutopayEmail(
      'payment_receipt',
      {
        ...base,
        paid_at: '2027-04-06T12:00:00Z',
        period_start: '2027-04-06T11:49:35Z',
        period_end: '2028-04-01T11:49:35Z',
        paid_through: '2028-04-01T11:49:35Z',
        card_network: 'Visa',
        card_last4: '1111',
        invoice_url: 'https://rzp.io/i/abc',
        provider_payment_id: 'pay_Unit000001',
        first_payment: true,
      },
      ctx
    );
    expect(email.subject).toBe('Payment received: Replai · Yearly is active');
    expect(email.text).toContain('₹9,000');
    expect(email.text).toContain('Visa ending 1111');
    expect(email.text).toContain('1 Apr 2028 (IST)');
    expect(email.html).toContain('https://rzp.io/i/abc');
  });

  it('a renewal receipt says renewed', () => {
    expect(
      renderAutopayEmail(
        'payment_receipt',
        { ...base, first_payment: false },
        ctx
      ).subject
    ).toMatch(/renewed/);
  });

  it('refund wording follows the access effect', () => {
    const removed = renderAutopayEmail(
      'refund_processed',
      {
        ...base,
        access_effect: 'window_removed',
        paid_through: '2027-04-06T11:49:35Z',
      },
      ctx
    );
    expect(removed.text).toMatch(/time it paid for has been removed/);
    const partial = renderAutopayEmail(
      'refund_processed',
      { ...base, amount_minor: 10000, access_effect: 'none_partial' },
      ctx
    );
    expect(partial.text).toMatch(/access is unchanged/i);
    expect(partial.subject).toBe('Refund processed: ₹100');
  });

  it('links to the app, never to a raw Razorpay page except the invoice', () => {
    const email = renderAutopayEmail('action_required', base, ctx);
    expect(email.html).toContain('https://app.example.com/upgrade-plan');
  });

  it('escapes values that came from data', () => {
    const email = renderAutopayEmail(
      'autopay_cancelled',
      { ...base, plan_name: '<script>x</script>' },
      ctx
    );
    expect(email.html).not.toContain('<script>x</script>');
  });

  it('formats a non-INR mandate in its own currency, with no rupee note', () => {
    const email = renderAutopayEmail(
      'mandate_authenticated',
      { ...base, currency: 'USD', amount_minor: 1200 },
      ctx
    );
    expect(email.text).toContain('$12 every 360 days');
    expect(email.text).not.toContain('₹5');
    expect(email.text).toContain('a small verification charge is made');
  });

  it('keeps the ₹5 verification note for an INR mandate', () => {
    const email = renderAutopayEmail('mandate_authenticated', base, ctx);
    expect(email.text).toContain('verification charge of ₹5');
  });
});
