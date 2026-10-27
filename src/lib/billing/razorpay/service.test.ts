import { describe, expect, it } from 'vitest';

import { resolveSubscriptionState } from '@/lib/subscription/status';
import type { AccountSubscriptionRow } from '@/lib/subscription/types';
import { computeTotalCount } from './checkout';
import { RazorpayApiError } from './client';
import {
  ACCOUNT_ID,
  COPY,
  KEY_SECRET,
  OTHER_ACCOUNT_ID,
  QUOTE,
  USER_ID,
  makeClient,
  makeConfig,
  makeDb,
  makeRazorpayPayment,
  makeRazorpaySubscription,
  makeRow,
} from './__fixtures__/factories';
import invoiceFixture from './__fixtures__/invoice-issued-immediate.json';
import {
  BillingServiceError,
  CHECKOUT_EXPIRY_MS,
  STATUS_REFRESH_MS,
  buildCheckoutDisplay,
  formatBillingDate,
  previewCheckout,
  refreshSubscription,
  shouldRefresh,
  startCheckout,
  verifyCheckout,
  type BillingDeps,
} from './service';
import { signCheckout } from './signature';
import type { RazorpayInvoice } from './types';

const NOW = new Date('2026-10-21T06:00:00.000Z');
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const unix = (d: Date | string) => Math.floor(new Date(d).getTime() / 1000);

const TRIAL_END = at(10 * DAY);

function state(
  row: Partial<AccountSubscriptionRow>,
  config = { is_enabled: true, grace_days: 0 }
) {
  return resolveSubscriptionState(row, config, NOW);
}

const trialing = () =>
  state({ subscription_status: 'trialing', trial_ends_at: TRIAL_END });
const expired = () =>
  state({ subscription_status: 'trialing', trial_ends_at: at(-5 * DAY) });

function setup(configOverrides = {}) {
  const db = makeDb();
  const client = makeClient();
  const config = makeConfig(configOverrides);
  const deps: BillingDeps = { db, client, config, now: () => NOW };
  const ensurePlan = async () => ({
    id: 'pp-1',
    provider: 'razorpay' as const,
    mode: 'test' as const,
    plan_id: QUOTE.planId,
    cycle_id: QUOTE.cycleId,
    plan_name: 'Replai',
    cycle_label: 'Monthly',
    duration_days: 30,
    amount_minor: 99000,
    currency: 'INR',
    period: 'daily' as const,
    period_interval: 30,
    provider_plan_id: 'plan_Unit000001',
    is_current: true,
    created_at: NOW.toISOString(),
  });
  const input = (s = trialing()) => ({
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    state: s,
    quote: QUOTE,
    copy: COPY,
    ensurePlan,
  });
  return { db, client, config, deps, input };
}

async function expectServiceError(
  promise: Promise<unknown>,
  code: string,
  status: number
) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(BillingServiceError);
  expect((err as BillingServiceError).code).toBe(code);
  expect((err as BillingServiceError).status).toBe(status);
}

// ------------------------------------------------------------
// Display text
// ------------------------------------------------------------

describe('buildCheckoutDisplay', () => {
  it('authorises now and charges at the trial end for a deferred start', () => {
    const d = buildCheckoutDisplay({
      quote: QUOTE,
      first: { intent: 'defer_to_trial_end', startAt: new Date(TRIAL_END) },
      copy: COPY,
      now: NOW,
    });
    expect(d.mode).toBe('authorise');
    expect(d.amountMinor).toBe(99000);
    expect(d.firstChargeAt).toBe(TRIAL_END);
    expect(d.accessUntil).toBeNull();
    expect(d.summary).toContain('No charge today');
    expect(d.summary).toContain('₹990');
    expect(d.summary).toContain(formatBillingDate(TRIAL_END));
    expect(d.consent).toContain(
      'I authorise Replai to charge ₹990 every 30 days'
    );
    expect(d.verificationNote).toMatch(/₹5/);
  });

  it('charges today and states the access window for an immediate start', () => {
    const d = buildCheckoutDisplay({
      quote: QUOTE,
      first: { intent: 'immediate', startAt: null },
      copy: COPY,
      now: NOW,
    });
    expect(d.mode).toBe('pay_now');
    expect(d.firstChargeAt).toBe(NOW.toISOString());
    expect(d.accessUntil).toBe(at(30 * DAY));
    expect(d.summary).toBe(
      'You pay ₹990 today for 30 days of access, then ₹990 every 30 days until you cancel.'
    );
    expect(d.verificationNote).toBeNull();
  });

  it('uses admin-authored templates when set', () => {
    const d = buildCheckoutDisplay({
      quote: QUOTE,
      first: { intent: 'immediate', startAt: null },
      copy: {
        business: 'Acme',
        consentTemplate: '{business} may charge {amount}.',
        deferTemplate: null,
        immediateTemplate: 'Pay {amount} for {days} days.',
      },
      now: NOW,
    });
    expect(d.consent).toBe('Acme may charge ₹990.');
    expect(d.summary).toBe('Pay ₹990 for 30 days.');
  });

  it('refuses a term that is not a whole number of days (D1)', () => {
    expect(() =>
      buildCheckoutDisplay({
        quote: { ...QUOTE, cycleDurationDays: null },
        first: { intent: 'immediate', startAt: null },
        copy: COPY,
        now: NOW,
      })
    ).toThrow(BillingServiceError);
  });
});

describe('formatBillingDate', () => {
  it('formats in IST, not the machine time zone', () => {
    // 20:00 UTC on 5 Apr is 01:30 IST on 6 Apr.
    expect(formatBillingDate('2027-04-05T20:00:00.000Z')).toBe('6 Apr 2027');
  });
});

// ------------------------------------------------------------
// Preview and start
// ------------------------------------------------------------

describe('previewCheckout', () => {
  it('has no side effects', () => {
    const { db, client, deps } = setup();
    const d = previewCheckout(deps, {
      accountId: ACCOUNT_ID,
      state: trialing(),
      quote: QUOTE,
      copy: COPY,
    });
    expect(d.mode).toBe('authorise');
    for (const fn of [...Object.values(db), ...Object.values(client)]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('refuses an account outside the test allowlist', () => {
    const { deps } = setup();
    expect(() =>
      previewCheckout(deps, {
        accountId: OTHER_ACCOUNT_ID,
        state: trialing(),
        quote: QUOTE,
        copy: COPY,
      })
    ).toThrow(/not available/);
  });
});

describe('startCheckout', () => {
  it('claims first, then creates the subscription with server-decided parameters', async () => {
    const { db, client, deps, input } = setup();
    const row = makeRow({
      status: 'initiating',
      provider_subscription_id: null,
    });
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: row,
    });
    client.createSubscription.mockResolvedValue(makeRazorpaySubscription());
    db.attachProviderSubscription.mockResolvedValue({
      outcome: 'attached',
      subscription: makeRow({ provider_subscription_id: 'sub_Unit000001' }),
    });

    const res = await startCheckout(deps, input());

    expect(res).toMatchObject({
      keyId: 'rzp_test_unit0000000000',
      subscriptionId: 'sub_Unit000001',
      reused: false,
    });
    expect(res.display.mode).toBe('authorise');

    const claim = db.claimCheckout.mock.calls[0][0];
    expect(claim).toMatchObject({
      account_id: ACCOUNT_ID,
      mode: 'test',
      env: 'dev',
      provider_plan_id: 'plan_Unit000001',
      amount_minor: 99000,
      currency: 'INR',
      duration_days: 30,
      intent: 'defer_to_trial_end',
      start_at: TRIAL_END,
      created_by: USER_ID,
    });

    expect(client.createSubscription).toHaveBeenCalledWith({
      plan_id: 'plan_Unit000001',
      total_count: computeTotalCount(30, new Date(TRIAL_END), NOW),
      quantity: 1,
      start_at: unix(TRIAL_END),
      expire_by: unix(new Date(NOW.getTime() + CHECKOUT_EXPIRY_MS)),
      customer_notify: 1,
      notes: {
        account_id: ACCOUNT_ID,
        checkout_id: row.checkout_id,
        env: 'dev',
        intent: 'defer_to_trial_end',
      },
    });
    expect(db.claimCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      client.createSubscription.mock.invocationCallOrder[0]
    );
    expect(db.attachProviderSubscription.mock.calls[0][0]).toBe(row.id);
  });

  it('starts immediately (no start_at) when access has already ended', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: makeRow({
        status: 'initiating',
        provider_subscription_id: null,
        intent: 'immediate',
      }),
    });
    client.createSubscription.mockResolvedValue(
      makeRazorpaySubscription({ start_at: null })
    );
    db.attachProviderSubscription.mockResolvedValue({
      outcome: 'attached',
      subscription: makeRow(),
    });

    const res = await startCheckout(deps, input(expired()));

    expect(res.display.mode).toBe('pay_now');
    const params = client.createSubscription.mock.calls[0][0];
    expect(params).not.toHaveProperty('start_at');
    expect(params.total_count).toBe(computeTotalCount(30, null, NOW));
    expect(db.claimCheckout.mock.calls[0][0]).toMatchObject({
      intent: 'immediate',
      start_at: null,
    });
  });

  it('reuses an open checkout for a double click or second tab', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'reuse',
      subscription: makeRow(),
    });

    const res = await startCheckout(deps, input());

    expect(res).toMatchObject({
      subscriptionId: 'sub_Unit000001',
      reused: true,
    });
    expect(client.createSubscription).not.toHaveBeenCalled();
  });

  it.each([
    ['autopay_exists', 'autopay_exists'],
    ['in_progress', 'checkout_in_progress'],
  ] as const)('answers 409 for claim outcome %s', async (outcome, code) => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome,
      subscription: makeRow({ status: 'active' }),
    });
    await expectServiceError(startCheckout(deps, input()), code, 409);
    expect(client.createSubscription).not.toHaveBeenCalled();
  });

  it('supersedes an unauthorised subscription: cancel at Razorpay, mark, then claim again', async () => {
    const { db, client, deps, input } = setup();
    const old = makeRow({
      id: 'row-old',
      provider_subscription_id: 'sub_Old0000001',
    });
    db.claimCheckout
      .mockResolvedValueOnce({
        outcome: 'supersede_required',
        subscription: old,
      })
      .mockResolvedValueOnce({
        outcome: 'claimed',
        subscription: makeRow({
          id: 'row-new',
          status: 'initiating',
          provider_subscription_id: null,
        }),
      });
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ id: 'sub_Old0000001' })
    );
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ id: 'sub_Old0000001', status: 'cancelled' })
    );
    client.createSubscription.mockResolvedValue(
      makeRazorpaySubscription({ id: 'sub_New0000001' })
    );
    db.attachProviderSubscription.mockResolvedValue({
      outcome: 'attached',
      subscription: makeRow({
        id: 'row-new',
        provider_subscription_id: 'sub_New0000001',
      }),
    });

    const res = await startCheckout(deps, input());

    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Old0000001',
      false
    );
    expect(db.markSuperseded).toHaveBeenCalledWith('row-old');
    expect(db.claimCheckout).toHaveBeenCalledTimes(2);
    expect(res.subscriptionId).toBe('sub_New0000001');
  });

  it('treats "already cancelled" as done while superseding', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout
      .mockResolvedValueOnce({
        outcome: 'supersede_required',
        subscription: makeRow({ id: 'row-old' }),
      })
      .mockResolvedValueOnce({
        outcome: 'reuse',
        subscription: makeRow({ provider_subscription_id: 'sub_New0000001' }),
      });
    client.fetchSubscription.mockResolvedValue(makeRazorpaySubscription());
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 400,
        code: 'BAD_REQUEST_ERROR',
        description: 'Subscription is not cancellable in cancelled status.',
      })
    );

    const res = await startCheckout(deps, input());
    expect(db.markSuperseded).toHaveBeenCalledWith('row-old');
    expect(res.subscriptionId).toBe('sub_New0000001');
  });

  it('never cancels a subscription the customer has just authorised in another tab', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'supersede_required',
      subscription: makeRow(),
    });
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );

    await expectServiceError(
      startCheckout(deps, input()),
      'autopay_exists',
      409
    );

    expect(client.cancelSubscription).not.toHaveBeenCalled();
    expect(db.markSuperseded).not.toHaveBeenCalled();
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        provider_subscription_id: 'sub_Unit000001',
        status: 'authenticated',
      }),
      'checkout'
    );
  });

  it('marks the claim failed and answers 502 when Razorpay refuses to create', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: makeRow({
        status: 'initiating',
        provider_subscription_id: null,
      }),
    });
    client.createSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 400,
        code: 'BAD_REQUEST_ERROR',
        description: 'start_at is invalid',
      })
    );

    await expectServiceError(
      startCheckout(deps, input()),
      'provider_error',
      502
    );
    expect(db.markCreateFailed).toHaveBeenCalledWith(
      'row-1',
      expect.stringContaining('start_at is invalid')
    );
    expect(db.attachProviderSubscription).not.toHaveBeenCalled();
  });

  it('answers currency_not_supported, never INR, when Razorpay refuses the currency', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: makeRow({
        status: 'initiating',
        provider_subscription_id: null,
      }),
    });
    client.createSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 400,
        code: 'BAD_REQUEST_ERROR',
        description:
          'International transactions are not enabled for this currency',
      })
    );
    const base = input();
    await expectServiceError(
      startCheckout(deps, {
        ...base,
        quote: { ...base.quote, amount: 60, currency: 'USD' },
      }),
      'currency_not_supported',
      409
    );
    expect(db.claimCheckout.mock.calls[0][0]).toMatchObject({
      amount_minor: 6000,
      currency: 'USD',
    });
    expect(db.markCreateFailed).toHaveBeenCalledWith(
      'row-1',
      expect.stringContaining('International transactions are not enabled')
    );
  });

  it('answers currency_not_supported when Razorpay refuses the plan currency', async () => {
    const { db, deps, input } = setup();
    const base = input();
    await expectServiceError(
      startCheckout(deps, {
        ...base,
        quote: { ...base.quote, amount: 60, currency: 'USD' },
        ensurePlan: async () => {
          throw new RazorpayApiError({
            status: 400,
            code: 'BAD_REQUEST_ERROR',
            description: 'The currency USD is not supported',
          });
        },
      }),
      'currency_not_supported',
      409
    );
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });

  it('cancels the new subscription if our claim went stale while Razorpay answered', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: makeRow({
        status: 'initiating',
        provider_subscription_id: null,
      }),
    });
    client.createSubscription.mockResolvedValue(
      makeRazorpaySubscription({ id: 'sub_Orphan00001' })
    );
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    db.attachProviderSubscription.mockResolvedValue({
      outcome: 'not_initiating',
    });

    await expectServiceError(
      startCheckout(deps, input()),
      'checkout_in_progress',
      409
    );
    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Orphan00001',
      false
    );
  });

  it('refuses an account outside the test allowlist before touching anything', async () => {
    const { db, client, deps, input } = setup();
    await expectServiceError(
      startCheckout(deps, { ...input(), accountId: OTHER_ACCOUNT_ID }),
      'account_not_allowed',
      403
    );
    expect(db.claimCheckout).not.toHaveBeenCalled();
    expect(client.createSubscription).not.toHaveBeenCalled();
  });

  it('refuses when billing is switched off', async () => {
    const { db, deps, input } = setup();
    const off = state(
      { subscription_status: 'trialing' },
      { is_enabled: false, grace_days: 0 }
    );
    await expectServiceError(
      startCheckout(deps, input(off)),
      'billing_not_required',
      409
    );
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
// Verify
// ------------------------------------------------------------

describe('verifyCheckout', () => {
  const paymentId = 'pay_Unit000001';
  const subId = 'sub_Unit000001';

  it('404s when the account has no open checkout', async () => {
    const { deps } = setup();
    await expectServiceError(
      verifyCheckout(deps, {
        accountId: ACCOUNT_ID,
        paymentId,
        signature: 'x',
        clientSubscriptionId: subId,
      }),
      'no_checkout',
      404
    );
  });

  it('rejects a response for a different subscription', async () => {
    const { db, client, deps } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow());
    await expectServiceError(
      verifyCheckout(deps, {
        accountId: ACCOUNT_ID,
        paymentId,
        signature: signCheckout(paymentId, 'sub_Other000001', KEY_SECRET),
        clientSubscriptionId: 'sub_Other000001',
      }),
      'subscription_mismatch',
      400
    );
    expect(client.fetchSubscription).not.toHaveBeenCalled();
  });

  it('rejects a bad signature without calling Razorpay', async () => {
    const { db, client, deps } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow());
    await expectServiceError(
      verifyCheckout(deps, {
        accountId: ACCOUNT_ID,
        paymentId,
        signature: signCheckout(paymentId, subId, 'wrong_secret_wrong_secret'),
        clientSubscriptionId: subId,
      }),
      'invalid_signature',
      400
    );
    expect(client.fetchSubscription).not.toHaveBeenCalled();
    expect(db.applyPayment).not.toHaveBeenCalled();
  });

  it('checks the signature against OUR subscription id, then re-reads everything from Razorpay', async () => {
    const { db, client, deps } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow({ id: 'row-1' }));
    db.getSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    client.fetchInvoice.mockResolvedValue({
      ...(invoiceFixture as unknown as RazorpayInvoice),
      id: 'inv_Unit000001',
      subscription_id: subId,
      payment_id: paymentId,
      status: 'paid',
    });
    db.applyPayment.mockResolvedValue({ outcome: 'granted' });

    const res = await verifyCheckout(deps, {
      accountId: ACCOUNT_ID,
      paymentId,
      signature: signCheckout(paymentId, subId, KEY_SECRET),
      // Checkout may omit it; our stored id is what is signed against.
      clientSubscriptionId: undefined,
    });

    expect(client.fetchSubscription).toHaveBeenCalledWith(subId);
    expect(client.fetchPayment).toHaveBeenCalledWith(paymentId);
    expect(client.fetchInvoice).toHaveBeenCalledWith('inv_Unit000001');
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ status: 'active' }),
      'checkout'
    );
    expect(db.applyPayment).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        provider_payment_id: paymentId,
        provider_subscription_id: subId,
        captured: true,
      }),
      expect.objectContaining({
        provider_invoice_id: 'inv_Unit000001',
        status: 'paid',
      }),
      'checkout'
    );
    expect(res.payment.outcome).toBe('granted');
    expect(res.row?.status).toBe('active');
  });

  it('records a deferred authorisation payment with no invoice', async () => {
    const { db, client, deps } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow());
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ amount: 500, invoice_id: null, order_id: null })
    );
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });

    const res = await verifyCheckout(deps, {
      accountId: ACCOUNT_ID,
      paymentId,
      signature: signCheckout(paymentId, subId, KEY_SECRET),
      clientSubscriptionId: subId,
    });

    expect(client.fetchInvoice).not.toHaveBeenCalled();
    expect(db.applyPayment.mock.calls[0][2]).toBeNull();
    expect(res.payment.outcome).toBe('recorded');
  });
});

// ------------------------------------------------------------
// Refresh (status polling, later reconciliation)
// ------------------------------------------------------------

describe('shouldRefresh', () => {
  it('only refreshes an in-flight subscription, at most every 30 s', () => {
    expect(
      shouldRefresh(makeRow({ provider_subscription_id: null }), NOW)
    ).toBe(false);
    expect(shouldRefresh(makeRow({ status: 'cancelled' }), NOW)).toBe(false);
    expect(shouldRefresh(makeRow({ last_synced_at: null }), NOW)).toBe(true);
    expect(shouldRefresh(makeRow({ last_synced_at: at(-10_000) }), NOW)).toBe(
      false
    );
    expect(
      shouldRefresh(
        makeRow({ last_synced_at: at(-(STATUS_REFRESH_MS + 1_000)) }),
        NOW
      )
    ).toBe(true);
  });
});

describe('refreshSubscription', () => {
  it('applies only invoices whose payment has not been applied yet', async () => {
    const { db, client, deps } = setup();
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    const inv = (
      id: string,
      paymentIdValue: string | null
    ): RazorpayInvoice => ({
      ...(invoiceFixture as unknown as RazorpayInvoice),
      id,
      subscription_id: 'sub_Unit000001',
      payment_id: paymentIdValue,
      status: paymentIdValue ? 'paid' : 'issued',
    });
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 3,
      items: [
        inv('inv_A', 'pay_Applied0001'),
        inv('inv_B', null),
        inv('inv_C', 'pay_New00000001'),
      ],
    });
    db.isPaymentApplied.mockImplementation(
      async (_mode, id) => id === 'pay_Applied0001'
    );
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ id: 'pay_New00000001', invoice_id: 'inv_C' })
    );
    db.applyPayment.mockResolvedValue({ outcome: 'granted' });

    const res = await refreshSubscription(deps, makeRow(), 'reconciliation');

    expect(res).toEqual({ applied: 1 });
    expect(client.fetchPayment).toHaveBeenCalledTimes(1);
    expect(client.fetchPayment).toHaveBeenCalledWith('pay_New00000001');
    expect(db.applyPayment).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ provider_payment_id: 'pay_New00000001' }),
      expect.objectContaining({ provider_invoice_id: 'inv_C' }),
      'reconciliation'
    );
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.anything(),
      'reconciliation'
    );
  });

  it('does nothing for a row Razorpay never created', async () => {
    const { client, deps } = setup();
    expect(
      await refreshSubscription(
        deps,
        makeRow({ provider_subscription_id: null })
      )
    ).toEqual({ applied: 0 });
    expect(client.fetchSubscription).not.toHaveBeenCalled();
  });
});
