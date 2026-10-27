import { describe, expect, it } from 'vitest';

import {
  buildPaymentNotes,
  chargeTypeFor,
  chargeTypeLabel,
  composeCardChangeDescription,
  composeCheckoutDescription,
  firstAppliedChargeAtBySubscription,
  MAX_NOTE_VALUE,
  MAX_PAYMENT_NOTES,
  mergeNotes,
  normalizePrefillContact,
  notesNeedUpdate,
  PAYMENT_NOTE_KEYS,
  type PaymentNotesInput,
} from './payment-details';

describe('composeCheckoutDescription', () => {
  const base = { planName: 'Pro', cycleLabel: 'Monthly' };

  it('names the plan and cycle when no setting is stored', () => {
    expect(composeCheckoutDescription({ ...base, setting: null })).toBe(
      'Replai Pro plan · Monthly · AutoPay'
    );
    expect(composeCheckoutDescription({ ...base, setting: '   ' })).toBe(
      'Replai Pro plan · Monthly · AutoPay'
    );
  });

  it('ignores the legacy default, whatever its case', () => {
    for (const setting of ['Replai subscription', 'REPLAI SUBSCRIPTION ']) {
      expect(composeCheckoutDescription({ ...base, setting })).toBe(
        'Replai Pro plan · Monthly · AutoPay'
      );
    }
  });

  it('keeps a custom setting as a prefix instead of replacing the plan', () => {
    expect(composeCheckoutDescription({ ...base, setting: 'Acme Ltd' })).toBe(
      'Acme Ltd · Replai Pro plan · Monthly · AutoPay'
    );
  });

  it('does not double "Replai" or "plan"', () => {
    expect(
      composeCheckoutDescription({
        setting: null,
        planName: 'Replai',
        cycleLabel: 'Yearly',
      })
    ).toBe('Replai plan · Yearly · AutoPay');
    expect(
      composeCheckoutDescription({
        setting: 'Replai',
        planName: 'Replai Growth plan',
        cycleLabel: 'Yearly',
      })
    ).toBe('Replai Growth plan · Yearly · AutoPay');
  });

  it('stays within 255 characters', () => {
    const d = composeCheckoutDescription({
      setting: 'x'.repeat(400),
      planName: 'Pro',
      cycleLabel: 'Monthly',
    });
    expect(d.length).toBeLessThanOrEqual(255);
  });

  it('describes a card change specifically', () => {
    expect(composeCardChangeDescription('Replai')).toBe(
      'Replai · Update AutoPay card'
    );
    expect(composeCardChangeDescription(null)).toBe(
      'Replai · Update AutoPay card'
    );
  });
});

describe('chargeTypeFor', () => {
  const first = '2026-10-22T11:33:58Z';

  it('treats a payment without an invoice as the AutoPay setup check', () => {
    expect(
      chargeTypeFor({
        kind: 'authorization',
        hasInvoice: false,
        createdAt: first,
        firstAppliedChargeAt: null,
      })
    ).toBe('card_verification');
    expect(
      chargeTypeFor({
        kind: 'charge',
        hasInvoice: false,
        createdAt: first,
        firstAppliedChargeAt: null,
      })
    ).toBe('card_verification');
  });

  it('labels the first charge, a failed first attempt and its retry as the first payment', () => {
    const charge = { kind: 'charge', hasInvoice: true };
    expect(
      chargeTypeFor({ ...charge, createdAt: first, firstAppliedChargeAt: null })
    ).toBe('first_payment');
    expect(
      chargeTypeFor({
        ...charge,
        createdAt: first,
        firstAppliedChargeAt: first,
      })
    ).toBe('first_payment');
    // A failed attempt before the successful first charge.
    expect(
      chargeTypeFor({
        ...charge,
        createdAt: '2026-10-22T11:00:00Z',
        firstAppliedChargeAt: first,
      })
    ).toBe('first_payment');
  });

  it('labels any later charge as a renewal', () => {
    expect(
      chargeTypeFor({
        kind: 'charge',
        hasInvoice: true,
        createdAt: '2027-10-17T11:33:58Z',
        firstAppliedChargeAt: first,
      })
    ).toBe('renewal');
  });

  it('has plain labels', () => {
    expect(chargeTypeLabel('first_payment')).toBe('First payment');
    expect(chargeTypeLabel('renewal')).toBe('Renewal');
    expect(chargeTypeLabel('card_verification')).toBe('AutoPay setup check');
  });

  it('finds the earliest applied charge per subscription', () => {
    const map = firstAppliedChargeAtBySubscription([
      {
        subscription_id: 'a',
        provider_created_at: '2027-01-01T00:00:00Z',
        created_at: 'x',
      },
      {
        subscription_id: 'a',
        provider_created_at: null,
        created_at: '2026-12-01T00:00:00Z',
      },
      { subscription_id: null, provider_created_at: null, created_at: 'y' },
    ]);
    expect(map.get('a')).toBe('2026-12-01T00:00:00Z');
    expect(map.size).toBe(1);
  });
});

describe('buildPaymentNotes', () => {
  const input: PaymentNotesInput = {
    workspace: 'Replai Demo',
    accountId: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
    planName: 'Replai',
    cycleLabel: 'Yearly',
    chargeType: 'first_payment',
    periodStart: '2026-10-22T11:33:58Z',
    // 01:30 IST on 18 Oct: the IST date, not the UTC one.
    periodEnd: '2027-10-17T20:00:00Z',
    subscriptionId: 'sub_TqwGwrNJq0ZNBa',
    invoiceId: 'inv_TqwGxOmj8cMGXS',
    env: 'dev',
    mode: 'test',
  };

  it('writes our keys in a fixed order with IST dates', () => {
    const notes = buildPaymentNotes(input);
    expect(Object.keys(notes)).toEqual([...PAYMENT_NOTE_KEYS]);
    expect(notes).toEqual({
      product: 'Replai',
      workspace: 'Replai Demo',
      account_id: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
      plan: 'Replai',
      billing_cycle: 'Yearly',
      charge_type: 'first_payment',
      period_start: '22 Oct 2026',
      period_end: '18 Oct 2027',
      subscription_id: 'sub_TqwGwrNJq0ZNBa',
      invoice_id: 'inv_TqwGxOmj8cMGXS',
      env: 'dev',
      mode: 'test',
    });
  });

  it('leaves out what a setup check does not have', () => {
    const notes = buildPaymentNotes({
      ...input,
      chargeType: 'card_verification',
      periodStart: null,
      periodEnd: null,
      invoiceId: null,
    });
    expect(notes).not.toHaveProperty('period_start');
    expect(notes).not.toHaveProperty('period_end');
    expect(notes).not.toHaveProperty('invoice_id');
    expect(notes.charge_type).toBe('card_verification');
  });

  it('keeps every value within 256 characters and strips control characters', () => {
    const notes = buildPaymentNotes({
      ...input,
      workspace: `Acme\n\t${'w'.repeat(300)}`,
    });
    for (const value of Object.values(notes))
      expect(value.length).toBeLessThanOrEqual(MAX_NOTE_VALUE);
    expect(notes.workspace.startsWith('Acme w')).toBe(true);
    expect(notes.workspace).not.toMatch(/[\n\t]/);
  });

  it('never carries contact or card details', () => {
    const keys = Object.keys(buildPaymentNotes(input)).join(',');
    expect(keys).not.toMatch(/email|phone|contact|card|vpa/);
  });
});

describe('mergeNotes and notesNeedUpdate', () => {
  const ours = { product: 'Replai', charge_type: 'renewal' };

  it("treats Razorpay's [] and null as no notes", () => {
    expect(mergeNotes([], ours)).toEqual(ours);
    expect(mergeNotes(null, ours)).toEqual(ours);
    expect(notesNeedUpdate([], ours)).toBe(true);
  });

  it('keeps other notes after ours, never more than 15 in total', () => {
    const foreign = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`k${i}`, `v${i}`])
    );
    const merged = mergeNotes(foreign, ours);
    expect(Object.keys(merged)).toHaveLength(MAX_PAYMENT_NOTES);
    expect(Object.keys(merged).slice(0, 2)).toEqual(['product', 'charge_type']);
    expect(merged.k0).toBe('v0');
  });

  it('fits our full set beside existing notes within the limit', () => {
    const full = buildPaymentNotes({
      workspace: 'W',
      accountId: 'a',
      planName: 'P',
      cycleLabel: 'C',
      chargeType: 'renewal',
      periodStart: '2026-10-22T00:00:00Z',
      periodEnd: '2026-11-22T00:00:00Z',
      subscriptionId: 's',
      invoiceId: 'i',
      env: 'dev',
      mode: 'test',
    });
    const foreign = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`k${i}`, 'x'])
    );
    const merged = mergeNotes(foreign, full);
    expect(Object.keys(merged).length).toBeLessThanOrEqual(MAX_PAYMENT_NOTES);
    for (const key of Object.keys(full)) expect(merged[key]).toBe(full[key]);
  });

  it('our value wins over a stale one', () => {
    expect(mergeNotes({ charge_type: 'first_payment' }, ours).charge_type).toBe(
      'renewal'
    );
  });

  it('needs no update when our keys already hold our values', () => {
    expect(notesNeedUpdate({ ...ours, other: 'x' }, ours)).toBe(false);
    expect(notesNeedUpdate({ product: 'Replai' }, ours)).toBe(true);
    expect(
      notesNeedUpdate({ product: 'Replai', charge_type: 'first_payment' }, ours)
    ).toBe(true);
  });
});

describe('normalizePrefillContact', () => {
  it('accepts a valid E.164 number and adds the plus', () => {
    expect(normalizePrefillContact('+919876543210')).toBe('+919876543210');
    expect(normalizePrefillContact('919876543210')).toBe('+919876543210');
    expect(normalizePrefillContact('+91 98765 43210')).toBe('+919876543210');
  });

  it('returns null for nothing or an invalid number', () => {
    expect(normalizePrefillContact(null)).toBeNull();
    expect(normalizePrefillContact('')).toBeNull();
    expect(normalizePrefillContact('abc')).toBeNull();
    expect(normalizePrefillContact('+0123')).toBeNull();
  });
});
