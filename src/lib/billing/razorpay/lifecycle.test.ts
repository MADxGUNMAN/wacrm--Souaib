import { describe, expect, it, vi } from 'vitest';

import { RazorpayApiError } from './client';
import {
  ACCOUNT_ID,
  makeClient,
  makeConfig,
  makeDb,
  makeRazorpaySubscription,
  makeRow,
} from './__fixtures__/factories';
import { cancelAutopay, paymentMethodAction } from './lifecycle';
import { BillingServiceError, type BillingDeps } from './service';

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
  return { db, client, deps };
}

async function expectError(
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

describe('cancelAutopay', () => {
  it('requires an explicit confirmation', async () => {
    const { deps, client } = setup();
    await expectError(
      cancelAutopay(deps, { accountId: ACCOUNT_ID, confirm: 'yes' }),
      'confirmation_required',
      400
    );
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it.each([
    null,
    makeRow({ status: 'created' }),
    makeRow({ status: 'cancelled' }),
  ])('refuses when there is no AutoPay to cancel (%#)', async (row) => {
    const { deps, db, client } = setup();
    db.getLatestSubscription.mockResolvedValue(row);
    await expectError(
      cancelAutopay(deps, { accountId: ACCOUNT_ID, confirm: true }),
      'no_autopay',
      409
    );
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancels immediately at Razorpay, records the customer, then applies what Razorpay says', async () => {
    const { deps, db, client } = setup();
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'authenticated' })
    );
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    db.getSubscription.mockResolvedValue(makeRow({ status: 'cancelled' }));

    const res = await cancelAutopay(deps, {
      accountId: ACCOUNT_ID,
      confirm: true,
    });

    // Immediate: access is ours to keep (accounts.subscription_ends_at),
    // so no Razorpay charge can happen after the customer said stop.
    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Unit000001',
      false
    );
    expect(db.markCancelRequested).toHaveBeenCalledWith('row-1', 'customer');
    expect(client.cancelSubscription.mock.invocationCallOrder[0]).toBeLessThan(
      db.markCancelRequested.mock.invocationCallOrder[0]
    );
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ status: 'cancelled' }),
      'customer'
    );
    expect(res.synced).toBe(true);
    expect(res.autopay?.display.key).toBe('autopay_cancelled');
  });

  it('carries on when Razorpay says it is already cancelled (another tab, the UPI app)', async () => {
    const { deps, db, client } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 400,
        description: 'Subscription is not cancellable in cancelled status.',
      })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    db.getSubscription.mockResolvedValue(makeRow({ status: 'cancelled' }));

    await cancelAutopay(deps, { accountId: ACCOUNT_ID, confirm: true });
    expect(db.markCancelRequested).toHaveBeenCalled();
  });

  it('does not record a cancel Razorpay refused', async () => {
    const { deps, db, client } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({ status: 500, description: 'down' })
    );
    await expect(
      cancelAutopay(deps, { accountId: ACCOUNT_ID, confirm: true })
    ).rejects.toBeInstanceOf(RazorpayApiError);
    expect(db.markCancelRequested).not.toHaveBeenCalled();
    expect(db.applySubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it('reports synced=false when the re-read fails after a successful cancel', async () => {
    const { deps, db, client } = setup();
    db.getLatestSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockRejectedValue(new Error('timeout'));
    db.getSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await cancelAutopay(deps, {
      accountId: ACCOUNT_ID,
      confirm: true,
    });
    expect(res.synced).toBe(false);
    expect(db.markCancelRequested).toHaveBeenCalled();
  });
});

describe('paymentMethodAction', () => {
  it('offers a card change on a card mandate', async () => {
    const { deps, db } = setup();
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'active', payment_method: 'card' })
    );
    expect(await paymentMethodAction(deps, { accountId: ACCOUNT_ID })).toEqual({
      action: 'card_change',
      keyId: 'rzp_test_unit0000000000',
      subscriptionId: 'sub_Unit000001',
      planName: 'Replai',
      cycleLabel: 'Monthly',
    });
  });

  it('sends a UPI mandate to the UPI app instead', async () => {
    const { deps, db } = setup();
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'pending', payment_method: 'upi' })
    );
    const res = await paymentMethodAction(deps, { accountId: ACCOUNT_ID });
    expect(res.action).toBe('unsupported');
  });

  it.each(['halted', 'paused'] as const)(
    'asks to renew a %s mandate',
    async (status) => {
      const { deps, db } = setup();
      db.getLatestSubscription.mockResolvedValue(
        makeRow({ status, payment_method: 'card' })
      );
      expect(
        await paymentMethodAction(deps, { accountId: ACCOUNT_ID })
      ).toMatchObject({ action: 'renew' });
    }
  );

  it('refuses without an AutoPay', async () => {
    const { deps } = setup();
    await expectError(
      paymentMethodAction(deps, { accountId: ACCOUNT_ID }),
      'no_autopay',
      409
    );
  });
});
