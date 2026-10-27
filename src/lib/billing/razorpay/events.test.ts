import { describe, expect, it, vi } from 'vitest';

import { RazorpayApiError } from './client';
import {
  ACCOUNT_ID,
  makeRazorpayPayment,
  makeRazorpaySubscription,
} from './__fixtures__/factories';
import invoiceFixture from './__fixtures__/invoice-issued-immediate.json';
import {
  NOW,
  makeDispute,
  makeEventDeps,
  makeEventRow,
  makeRefund,
} from './__fixtures__/phase3';
import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  processDueWebhookEvents,
  processWebhookEvent,
} from './events';
import type { RazorpayInvoice } from './types';

const paidInvoice = (
  overrides: Partial<RazorpayInvoice> = {}
): RazorpayInvoice => ({
  ...(invoiceFixture as unknown as RazorpayInvoice),
  id: 'inv_Unit000001',
  subscription_id: 'sub_Unit000001',
  payment_id: 'pay_Unit000001',
  status: 'paid',
  ...overrides,
});

describe('processWebhookEvent: subscriptions', () => {
  it('refetches the subscription from Razorpay and applies the fresh state, not the payload', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );
    db.applySubscriptionSnapshot.mockResolvedValue({
      outcome: 'applied',
      account_id: ACCOUNT_ID,
    });

    const res = await processWebhookEvent(deps, makeEventRow());

    expect(client.fetchSubscription).toHaveBeenCalledWith('sub_Unit000001');
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        provider_subscription_id: 'sub_Unit000001',
        status: 'authenticated',
      }),
      'razorpay_webhook'
    );
    expect(res).toMatchObject({ status: 'processed', accountId: ACCOUNT_ID });
  });

  it('ignores a subscription created by the other environment (shared database)', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({
        notes: { account_id: ACCOUNT_ID, env: 'prod' },
      })
    );
    const res = await processWebhookEvent(deps, makeEventRow());
    expect(res).toEqual({ status: 'ignored', note: 'other_env' });
    expect(db.applySubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it('ignores a subscription that is not ours', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchSubscription.mockResolvedValue(makeRazorpaySubscription());
    db.applySubscriptionSnapshot.mockResolvedValue({
      outcome: 'unknown_subscription',
    });
    expect(await processWebhookEvent(deps, makeEventRow())).toEqual({
      status: 'ignored',
      note: 'not_ours',
    });
  });

  it('ignores an id Razorpay does not know', async () => {
    const { deps, client } = makeEventDeps();
    client.fetchSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 400,
        description: 'The ID provided is invalid or could not be found.',
      })
    );
    expect(await processWebhookEvent(deps, makeEventRow())).toEqual({
      status: 'ignored',
      note: 'not_found_at_razorpay',
    });
  });

  it('subscription.charged applies the subscription AND the payment with its invoice', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    client.fetchInvoice.mockResolvedValue(paidInvoice());
    db.applySubscriptionSnapshot.mockResolvedValue({
      outcome: 'applied',
      account_id: ACCOUNT_ID,
    });
    db.applyPayment.mockResolvedValue({ outcome: 'granted' });

    const res = await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'subscription.charged',
        entity_ids: {
          subscription: 'sub_Unit000001',
          payment: 'pay_Unit000001',
        },
      })
    );

    expect(db.applyPayment).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        provider_payment_id: 'pay_Unit000001',
        provider_subscription_id: 'sub_Unit000001',
      }),
      expect.objectContaining({
        provider_invoice_id: 'inv_Unit000001',
        status: 'paid',
      }),
      'razorpay_webhook'
    );
    expect(res.status).toBe('processed');
    expect(res.note).toContain('granted');
  });

  it('records an anomaly without failing the event', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchSubscription.mockResolvedValue(makeRazorpaySubscription());
    db.applySubscriptionSnapshot.mockResolvedValue({
      outcome: 'anomaly',
      anomaly: 'plan_mismatch',
    });
    expect(await processWebhookEvent(deps, makeEventRow())).toMatchObject({
      status: 'processed',
      anomaly: 'plan_mismatch',
    });
  });
});

describe('processWebhookEvent: payments and invoices', () => {
  it('links a charge to its subscription through the invoice', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    client.fetchInvoice.mockResolvedValue(paidInvoice());
    db.applyPayment.mockResolvedValue({ outcome: 'granted' });
    const res = await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'payment.captured',
        entity_ids: { payment: 'pay_Unit000001' },
      })
    );
    expect(db.applyPayment.mock.calls[0][1].provider_subscription_id).toBe(
      'sub_Unit000001'
    );
    expect(res.status).toBe('processed');
  });

  it('ignores an authorisation payment it cannot tie to a subscription (no invoice, no notes)', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ invoice_id: null, order_id: null, amount: 500 })
    );
    const res = await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'payment.failed',
        entity_ids: { payment: 'pay_Unit000001' },
      })
    );
    expect(res).toEqual({ status: 'ignored', note: 'no_subscription_link' });
    expect(db.applyPayment).not.toHaveBeenCalled();
  });

  it('invoice.paid applies the named payment', async () => {
    const { deps, client, db } = makeEventDeps();
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    client.fetchInvoice.mockResolvedValue(paidInvoice());
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });
    await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'invoice.paid',
        entity_ids: {
          invoice: 'inv_Unit000001',
          payment: 'pay_Unit000001',
          subscription: 'sub_Unit000001',
        },
      })
    );
    expect(db.applyPayment).toHaveBeenCalledTimes(1);
  });

  it('ignores event types it does not handle', async () => {
    const { deps, client } = makeEventDeps();
    expect(
      await processWebhookEvent(
        deps,
        makeEventRow({ event_type: 'payment.downtime.started', entity_ids: {} })
      )
    ).toEqual({ status: 'ignored', note: 'unhandled_event' });
    expect(client.fetchSubscription).not.toHaveBeenCalled();
  });
});

describe('processWebhookEvent: refunds and disputes', () => {
  it('syncs the parent payment, then applies the refund', async () => {
    const { deps, client, db, store } = makeEventDeps();
    client.fetchRefund.mockResolvedValue(makeRefund());
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ status: 'refunded', amount_refunded: 99000 })
    );
    client.fetchInvoice.mockResolvedValue(paidInvoice());
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });
    store.applyRefund.mockResolvedValue({
      outcome: 'processed',
      access_effect: 'window_removed',
    });

    const res = await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'refund.processed',
        entity_ids: { refund: 'rfnd_Unit000001', payment: 'pay_Unit000001' },
      })
    );

    expect(db.applyPayment.mock.invocationCallOrder[0]).toBeLessThan(
      store.applyRefund.mock.invocationCallOrder[0]
    );
    expect(store.applyRefund).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        provider_refund_id: 'rfnd_Unit000001',
        amount_minor: 99000,
        status: 'processed',
      }),
      'razorpay_webhook'
    );
    expect(res.status).toBe('processed');
  });

  it('ignores a refund on a payment that is not ours', async () => {
    const { deps, client, store } = makeEventDeps();
    client.fetchRefund.mockResolvedValue(makeRefund());
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ invoice_id: null })
    );
    store.applyRefund.mockResolvedValue({ outcome: 'unknown_payment' });
    const res = await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'refund.processed',
        entity_ids: { refund: 'rfnd_Unit000001' },
      })
    );
    expect(res).toEqual({ status: 'ignored', note: 'no_subscription_link' });
  });

  it('a LOST dispute cancels AutoPay at Razorpay and re-syncs the subscription (D4)', async () => {
    const { deps, client, db, store } = makeEventDeps();
    client.fetchDispute.mockResolvedValue(makeDispute({ status: 'lost' }));
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    client.fetchInvoice.mockResolvedValue(paidInvoice());
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });
    store.applyDispute.mockResolvedValue({
      outcome: 'applied',
      status: 'lost',
      lost: true,
      provider_subscription_id: 'sub_Unit000001',
    });
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    db.applySubscriptionSnapshot.mockResolvedValue({ outcome: 'applied' });

    await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'payment.dispute.lost',
        entity_ids: { dispute: 'disp_Unit000001' },
      })
    );

    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Unit000001',
      false
    );
    expect(db.applySubscriptionSnapshot).toHaveBeenCalled();
  });

  it('an open dispute changes nothing at Razorpay', async () => {
    const { deps, client, db, store } = makeEventDeps();
    client.fetchDispute.mockResolvedValue(makeDispute());
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    client.fetchInvoice.mockResolvedValue(paidInvoice());
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });
    store.applyDispute.mockResolvedValue({
      outcome: 'applied',
      status: 'open',
      lost: false,
    });
    await processWebhookEvent(
      deps,
      makeEventRow({
        event_type: 'payment.dispute.created',
        entity_ids: { dispute: 'disp_Unit000001' },
      })
    );
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('processDueWebhookEvents', () => {
  it('finishes each claimed event with its outcome', async () => {
    const { deps, client, db, store } = makeEventDeps();
    store.claimWebhookEvents.mockResolvedValue([makeEventRow()]);
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );
    db.applySubscriptionSnapshot.mockResolvedValue({
      outcome: 'applied',
      account_id: ACCOUNT_ID,
    });

    const summary = await processDueWebhookEvents(deps, {
      limit: 1,
      id: 'evt-row-1',
    });

    expect(store.claimWebhookEvents).toHaveBeenCalledWith(
      'test',
      1,
      'evt-row-1'
    );
    expect(store.finishWebhookEvent).toHaveBeenCalledWith(
      'evt-row-1',
      expect.objectContaining({ status: 'processed', accountId: ACCOUNT_ID })
    );
    expect(summary).toMatchObject({ claimed: 1, processed: 1, failed: 0 });
  });

  it('schedules a retry with backoff when Razorpay is unreachable', async () => {
    const { deps, client, store } = makeEventDeps();
    store.claimWebhookEvents.mockResolvedValue([makeEventRow({ attempts: 2 })]);
    client.fetchSubscription.mockRejectedValue(
      new RazorpayApiError({ status: 503, description: 'down' })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await processDueWebhookEvents(deps, { limit: 5 });

    expect(store.finishWebhookEvent).toHaveBeenCalledWith('evt-row-1', {
      status: 'failed',
      error: expect.stringContaining('Razorpay 503'),
      nextAttemptAt: new Date(NOW.getTime() + WEBHOOK_BACKOFF_MS[1]),
    });
    expect(summary.failed).toBe(1);
    expect(store.notifyAdmin).not.toHaveBeenCalled();
  });

  it('parks an event as dead after the last attempt and tells an operator', async () => {
    const { deps, client, store } = makeEventDeps();
    store.claimWebhookEvents.mockResolvedValue([
      makeEventRow({ attempts: WEBHOOK_MAX_ATTEMPTS }),
    ]);
    client.fetchSubscription.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await processDueWebhookEvents(deps, { limit: 5 });

    expect(store.finishWebhookEvent).toHaveBeenCalledWith('evt-row-1', {
      status: 'dead',
      error: 'boom',
    });
    expect(store.notifyAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'billing_webhook_dead',
        severity: 'critical',
        title: expect.stringMatching(/^\[Test\]/),
      })
    );
    expect(summary.dead).toBe(1);
  });
});
