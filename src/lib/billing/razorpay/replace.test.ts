import { describe, expect, it } from 'vitest';

import { resolveSubscriptionState } from '@/lib/subscription/status';
import {
  ACCOUNT_ID,
  COPY,
  KEY_SECRET,
  QUOTE,
  USER_ID,
  makeClient,
  makeConfig,
  makeDb,
  makeRazorpayPayment,
  makeRazorpaySubscription,
  makeRow,
} from './__fixtures__/factories';
import {
  BillingServiceError,
  startCheckout,
  verifyCheckout,
  type BillingDeps,
} from './service';
import { signCheckout } from './signature';

// Phase 4: a checkout replaces a mandate that will not charge (halted or
// paused), and verify keeps the shown payment method current.

const NOW = new Date('2026-10-21T06:00:00.000Z');

function setup() {
  const db = makeDb();
  const client = makeClient();
  const deps: BillingDeps = {
    db,
    client,
    config: makeConfig(),
    now: () => NOW,
  };
  const input = {
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    // Blocked: the stopped AutoPay's charge was never collected.
    state: resolveSubscriptionState(
      {
        subscription_status: 'active',
        subscription_ends_at: new Date(
          NOW.getTime() - 86_400_000
        ).toISOString(),
      },
      { is_enabled: true, grace_days: 0 },
      NOW
    ),
    quote: QUOTE,
    copy: COPY,
    ensurePlan: async () => ({
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
    }),
  };
  return { db, client, deps, input };
}

describe('startCheckout replaces a stopped or paused mandate', () => {
  it.each(['halted', 'paused'] as const)(
    'cancels a %s mandate Razorpay still reports as stopped, then creates the new one',
    async (status) => {
      const { db, client, deps, input } = setup();
      const old = makeRow({
        id: 'row-old',
        status,
        provider_subscription_id: 'sub_Old0000001',
      });
      db.claimCheckout
        .mockResolvedValueOnce({ outcome: 'autopay_exists', subscription: old })
        .mockResolvedValueOnce({
          outcome: 'claimed',
          subscription: makeRow({
            id: 'row-new',
            status: 'initiating',
            provider_subscription_id: null,
            intent: 'immediate',
          }),
        });
      client.fetchSubscription
        .mockResolvedValueOnce(
          makeRazorpaySubscription({ id: 'sub_Old0000001', status })
        )
        .mockResolvedValueOnce(
          makeRazorpaySubscription({
            id: 'sub_Old0000001',
            status: 'cancelled',
          })
        );
      client.cancelSubscription.mockResolvedValue(
        makeRazorpaySubscription({ status: 'cancelled' })
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

      const res = await startCheckout(deps, input);

      expect(client.cancelSubscription).toHaveBeenCalledWith(
        'sub_Old0000001',
        false
      );
      expect(db.markCancelRequested).toHaveBeenCalledWith(
        'row-old',
        'customer'
      );
      expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          provider_subscription_id: 'sub_Old0000001',
          status: 'cancelled',
        }),
        'customer'
      );
      expect(res.subscriptionId).toBe('sub_New0000001');
      // The blocked account pays now: no start_at.
      expect(client.createSubscription.mock.calls[0][0]).not.toHaveProperty(
        'start_at'
      );
    }
  );

  it('never cancels a mandate that came back to life (card changed, resumed)', async () => {
    const { db, client, deps, input } = setup();
    db.claimCheckout.mockResolvedValue({
      outcome: 'autopay_exists',
      subscription: makeRow({
        status: 'halted',
        provider_subscription_id: 'sub_Old0000001',
      }),
    });
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ id: 'sub_Old0000001', status: 'active' })
    );

    const err = await startCheckout(deps, input).then(
      () => null,
      (e: unknown) => e
    );
    expect((err as BillingServiceError).code).toBe('autopay_exists');
    expect(client.cancelSubscription).not.toHaveBeenCalled();
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ status: 'active' }),
      'checkout'
    );
  });

  it.each(['authenticated', 'active', 'pending'] as const)(
    'leaves a working %s mandate alone and answers 409 without asking Razorpay',
    async (status) => {
      const { db, client, deps, input } = setup();
      db.claimCheckout.mockResolvedValue({
        outcome: 'autopay_exists',
        subscription: makeRow({ status }),
      });
      const err = await startCheckout(deps, input).then(
        () => null,
        (e: unknown) => e
      );
      expect((err as BillingServiceError).status).toBe(409);
      expect(client.fetchSubscription).not.toHaveBeenCalled();
      expect(client.cancelSubscription).not.toHaveBeenCalled();
    }
  );
});

describe('verifyCheckout keeps the payment method current', () => {
  it('refreshes the method summary after applying the payment (card change)', async () => {
    const { db, client, deps } = setup();
    const paymentId = 'pay_NewCard0001';
    db.getLatestSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({
        id: paymentId,
        amount: 100,
        invoice_id: null,
        status: 'refunded',
      })
    );
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });

    await verifyCheckout(deps, {
      accountId: ACCOUNT_ID,
      paymentId,
      signature: signCheckout(paymentId, 'sub_Unit000001', KEY_SECRET),
      clientSubscriptionId: 'sub_Unit000001',
    });

    expect(db.refreshMethodSummary).toHaveBeenCalledWith('row-1');
    expect(db.applyPayment.mock.invocationCallOrder[0]).toBeLessThan(
      db.refreshMethodSummary.mock.invocationCallOrder[0]
    );
  });
});
