import { describe, expect, it } from 'vitest';

import { ALL_EVENT_TYPES } from '@/lib/billing/event-channel';

import {
  describeBillingEvent,
  type DescribableEvent,
} from './event-description';

const d = (
  eventType: string,
  note: string | null,
  over: Partial<DescribableEvent> = {}
) => describeBillingEvent({ eventType, note, ...over });

describe('describeBillingEvent: live note shapes', () => {
  it.each([
    [
      'autopay_authenticated',
      'Razorpay sub_TrEgorVChJpnSX: created -> authenticated',
      'AutoPay status changed from Awaiting authorisation to Authorised.',
      { kind: 'subscription', id: 'sub_TrEgorVChJpnSX' },
    ],
    [
      'autopay_activated',
      'Razorpay sub_TqwGwrNJq0ZNBa: created -> active',
      'AutoPay status changed from Awaiting authorisation to Active.',
      { kind: 'subscription', id: 'sub_TqwGwrNJq0ZNBa' },
    ],
    [
      'autopay_cancelled',
      'Razorpay sub_TqTtwUDRjijZys: authenticated -> cancelled',
      'AutoPay status changed from Authorised to Cancelled.',
      { kind: 'subscription', id: 'sub_TqTtwUDRjijZys' },
    ],
    [
      'autopay_checkout_created',
      'Razorpay sub_TqTtwUDRjijZys created (defer_to_paid_end)',
      'AutoPay checkout started. First charge when the current paid period ends.',
      { kind: 'subscription', id: 'sub_TqTtwUDRjijZys' },
    ],
    [
      'autopay_checkout_created',
      'Razorpay sub_TqwGwrNJq0ZNBa created (immediate)',
      'AutoPay checkout started. First charge straight away.',
      { kind: 'subscription', id: 'sub_TqwGwrNJq0ZNBa' },
    ],
    [
      'autopay_checkout_created',
      'Razorpay sub_TrEgorVChJpnSX created (defer_to_trial_end)',
      'AutoPay checkout started. First charge when the trial ends.',
      { kind: 'subscription', id: 'sub_TrEgorVChJpnSX' },
    ],
    [
      'payment_succeeded',
      'Razorpay pay_TqwHJmORjkgpjt',
      'AutoPay charge captured and access extended.',
      { kind: 'payment', id: 'pay_TqwHJmORjkgpjt' },
    ],
    [
      'payment_submitted',
      'UTR 614912345678',
      'Manual UPI payment submitted for review.',
      { kind: 'utr', id: '614912345678' },
    ],
  ])('%s: %s', (type, note, text, reference) => {
    const r = d(type, note);
    expect(r.text).toBe(text);
    expect(r.reference).toEqual(reference);
    expect(r.note).toBeNull();
  });

  it('rewrites admin sync notes', () => {
    expect(
      d(
        'billing_admin_action',
        'Synced from Razorpay: active -> active, 0 payment(s) applied',
        { providerSubscriptionId: 'sub_A' }
      )
    ).toEqual({
      text: 'Synced with Razorpay. Status unchanged (Active). No new payments applied.',
      reference: { kind: 'subscription', id: 'sub_A' },
      note: null,
    });
    expect(
      d(
        'billing_admin_action',
        'Synced from Razorpay: active -> active, 0 payment(s) applied, notes updated on 1 payment(s)'
      ).text
    ).toBe(
      'Synced with Razorpay. Status unchanged (Active). No new payments applied. Payment notes updated on 1 payment.'
    );
    expect(
      d(
        'billing_admin_action',
        'Synced from Razorpay: authenticated -> active, 2 payment(s) applied, notes updated on 0 payment(s)'
      ).text
    ).toBe(
      'Synced with Razorpay. Status changed from Authorised to Active. 2 payments applied.'
    );
  });

  it.each([
    ['subscription_expired', 'Trial ended immediately by a platform admin'],
    [
      'trial_extended',
      '7 trial day(s) queued after subscription (starts 2026-09-22)',
    ],
    ['payment_rejected', 'payment do not match'],
    [
      'subscription_extended',
      'Paid window queued behind trial (trial ends 2026-08-29)',
    ],
  ])('passes a person-written note through: %s', (type, note) => {
    const r = d(type, note);
    expect(r.note).toBe(note);
    expect(r.text).toMatch(/\.$/);
    expect(r.text).not.toContain('_');
  });
});

describe('describeBillingEvent: SQL and server templates', () => {
  it('admin cancel keeps the reason as the note', () => {
    expect(
      d(
        'billing_admin_action',
        'Cancelled AutoPay sub_X1 (test). Reason: Customer asked'
      )
    ).toEqual({
      text: 'AutoPay cancelled by a super admin.',
      reference: { kind: 'subscription', id: 'sub_X1' },
      note: 'Customer asked',
    });
    expect(
      d(
        'billing_admin_action',
        'Cancelled AutoPay sub_X1 (live). Razorpay reported it was already cancelled. Reason: Duplicate'
      ).text
    ).toBe(
      'AutoPay cancelled by a super admin. Razorpay reported it was already cancelled.'
    );
  });

  it('ban cancel', () => {
    const r = d(
      'billing_admin_action',
      'Cancelled AutoPay sub_Unit000001 because the account was banned. Reason: Spam'
    );
    expect(r.text).toBe('AutoPay cancelled because the workspace was banned.');
    expect(r.note).toBe('Spam');
  });

  it('webhook re-queue', () => {
    const r = d(
      'billing_admin_action',
      'Re-queued Razorpay webhook evt_ABC (subscription.charged)'
    );
    expect(r.text).toBe(
      'Webhook event re-queued for processing (Subscription charged).'
    );
    expect(r.reference).toBeNull();
    expect(r.note).toBe('Event id evt_ABC');
  });

  it('refunds', () => {
    expect(
      d(
        'refund_processed',
        'Refund rfnd_1 on pay_2 (full); access: window_removed'
      )
    ).toEqual({
      text: 'Full refund processed (rfnd_1). Access: Access removed.',
      reference: { kind: 'payment', id: 'pay_2' },
      note: null,
    });
    expect(
      d(
        'refund_processed',
        'Refund rfnd_1 on pay_2 (partial); access: none_partial'
      ).text
    ).toBe('Partial refund processed (rfnd_1). Access: No change.');
  });

  it('disputes', () => {
    expect(
      d(
        'dispute_opened',
        'Dispute disp_1 on pay_2 (chargeback, product_not_received), respond by 30 Oct 2026 18:00 IST'
      ).text
    ).toBe(
      'Dispute opened (Chargeback, Product not received). Respond by 30 Oct 2026 18:00 IST.'
    );
    expect(
      d(
        'dispute_opened',
        'Dispute disp_1 on pay_2 (unknown phase, no reason code), respond by unknown'
      ).text
    ).toBe('Dispute opened.');
    expect(
      d('dispute_closed', 'Dispute disp_1 lost; access: window_removed', {
        providerPaymentId: 'pay_2',
      })
    ).toEqual({
      text: 'Dispute lost. Access: Access removed.',
      reference: { kind: 'payment', id: 'pay_2' },
      note: null,
    });
  });

  it('paid time removed', () => {
    expect(d('subscription_revoked', 'Full refund rfnd_9').text).toBe(
      'Paid time removed after a full refund.'
    );
    expect(d('subscription_revoked', 'Dispute lost disp_9').reference).toEqual({
      kind: 'dispute',
      id: 'disp_9',
    });
  });

  it('anomalies', () => {
    expect(d('billing_anomaly', 'refund_mismatch on rfnd_1 (pay_2)').text).toBe(
      'Refund rfnd_1 does not match its payment. Check it in Razorpay.'
    );
    expect(
      d('billing_anomaly', 'Razorpay plan plan_A differs from stored plan_B')
        .text
    ).toBe('The Razorpay plan (plan_A) differs from the stored plan (plan_B).');
    expect(
      d(
        'billing_anomaly',
        'Razorpay notes.account_id does not match this subscription'
      ).text
    ).toBe(
      'The workspace id in the Razorpay notes does not match this subscription.'
    );
  });
});

describe('describeBillingEvent: defaults', () => {
  it('has a sentence for every event type with no note', () => {
    for (const t of ALL_EVENT_TYPES) {
      const r = d(t, null);
      expect(r.text, t).toMatch(/^[A-Z].*\.$/);
      expect(r.text).not.toContain('_');
      expect(r.note).toBeNull();
    }
  });

  it('falls back to the linked reference', () => {
    expect(
      d('payment_failed', null, { providerPaymentId: 'pay_F' }).reference
    ).toEqual({
      kind: 'payment',
      id: 'pay_F',
    });
    expect(d('payment_approved', null, { utr: '61490' }).reference).toEqual({
      kind: 'utr',
      id: '61490',
    });
  });

  it('passes an unknown note through', () => {
    const r = d('subscription_activated', 'Comp for the outage');
    expect(r.text).toBe('Paid access started.');
    expect(r.note).toBe('Comp for the outage');
  });
});
