import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeClient,
  makeConfig,
  makeDb,
  makeNoteContext,
  makeRazorpayPayment,
  makeRazorpaySubscription,
  makeRow,
} from './__fixtures__/factories';
import { adminCancelSubscription, adminSyncSubscription } from './admin';
import { RazorpayApiError } from './client';
import type { BillingDeps } from './service';

let db: ReturnType<typeof makeDb>;
let client: ReturnType<typeof makeClient>;
let deps: BillingDeps;
const audit = vi.fn(async () => 'audit-1');

beforeEach(() => {
  db = makeDb();
  client = makeClient();
  deps = {
    db,
    client,
    config: makeConfig(),
    now: () => new Date('2026-10-21T06:00:00.000Z'),
  };
  audit.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const activeRow = () =>
  makeRow({ status: 'active', provider_subscription_id: 'sub_Unit000001' });

describe('adminCancelSubscription', () => {
  it('refuses a row from the other Razorpay mode and never calls Razorpay', async () => {
    deps.config = makeConfig({ mode: 'live', keyId: 'rzp_live_unit000000' });
    await expect(
      adminCancelSubscription(deps, activeRow(), {
        actorUserId: 'admin-1',
        reason: 'Customer asked',
        audit,
      })
    ).rejects.toMatchObject({ code: 'mode_unavailable', status: 409 });
    expect(client.cancelSubscription).not.toHaveBeenCalled();
    expect(db.markCancelRequested).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'completed', 'expired', 'superseded', 'initiating'])(
    'refuses a %s row',
    async (status) => {
      await expect(
        adminCancelSubscription(
          deps,
          makeRow({ status: status as 'cancelled' }),
          { actorUserId: 'admin-1', reason: 'Customer asked', audit }
        )
      ).rejects.toMatchObject({ code: 'not_cancellable', status: 409 });
      expect(client.cancelSubscription).not.toHaveBeenCalled();
    }
  );

  it('refuses a row with no Razorpay id', async () => {
    await expect(
      adminCancelSubscription(
        deps,
        makeRow({ status: 'active', provider_subscription_id: null }),
        { actorUserId: 'admin-1', reason: 'Customer asked', audit }
      )
    ).rejects.toMatchObject({ code: 'not_cancellable' });
  });

  it('cancels immediately, records the admin, re-reads, then audits the reason', async () => {
    const order: string[] = [];
    client.cancelSubscription.mockImplementation(async () => {
      order.push('cancel');
      return makeRazorpaySubscription({ status: 'cancelled' });
    });
    db.markCancelRequested.mockImplementation(async () => {
      order.push('mark');
    });
    client.fetchSubscription.mockImplementation(async () => {
      order.push('fetch');
      return makeRazorpaySubscription({ status: 'cancelled' });
    });
    db.applySubscriptionSnapshot.mockImplementation(async (_m, _s, source) => {
      order.push(`apply:${source}`);
      return { outcome: 'applied' };
    });
    audit.mockImplementation(async () => {
      order.push('audit');
      return 'audit-1';
    });

    const res = await adminCancelSubscription(deps, activeRow(), {
      actorUserId: 'admin-1',
      reason: 'Customer asked by email',
      audit,
    });

    expect(res).toEqual({
      alreadyCancelled: false,
      synced: true,
      audited: true,
    });
    expect(order).toEqual(['cancel', 'mark', 'fetch', 'apply:admin', 'audit']);
    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Unit000001',
      false
    );
    expect(db.markCancelRequested).toHaveBeenCalledWith('row-1', 'admin');
    expect(audit).toHaveBeenCalledWith(
      activeRow().account_id,
      'row-1',
      'admin-1',
      expect.stringContaining('Reason: Customer asked by email')
    );
    expect(audit.mock.calls[0]).toContainEqual(
      expect.stringContaining('sub_Unit000001 (test)')
    );
  });

  it('carries on when Razorpay says it is already cancelled', async () => {
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 400,
        description: 'Subscription is not cancellable in cancelled status.',
      })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );

    const res = await adminCancelSubscription(deps, activeRow(), {
      actorUserId: 'admin-1',
      reason: 'Customer asked',
      audit,
    });
    expect(res.alreadyCancelled).toBe(true);
    expect(db.markCancelRequested).toHaveBeenCalledWith('row-1', 'admin');
    expect(audit).toHaveBeenCalledWith(
      expect.any(String),
      'row-1',
      'admin-1',
      expect.stringContaining('already cancelled')
    );
  });

  it('rethrows a Razorpay 5xx and records nothing', async () => {
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({ status: 500, description: 'down' })
    );
    await expect(
      adminCancelSubscription(deps, activeRow(), {
        actorUserId: 'admin-1',
        reason: 'Customer asked',
        audit,
      })
    ).rejects.toBeInstanceOf(RazorpayApiError);
    expect(db.markCancelRequested).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('reports synced:false when the re-read fails, and still audits', async () => {
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockRejectedValue(new Error('timeout'));

    const res = await adminCancelSubscription(deps, activeRow(), {
      actorUserId: 'admin-1',
      reason: 'Customer asked',
      audit,
    });
    expect(res.synced).toBe(false);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('does not turn a failed audit write into an error', async () => {
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    audit.mockRejectedValueOnce(new Error('db down'));

    const res = await adminCancelSubscription(deps, activeRow(), {
      actorUserId: 'admin-1',
      reason: 'Customer asked',
      audit,
    });
    expect(res).toMatchObject({ synced: true, audited: false });
  });
});

describe('adminSyncSubscription', () => {
  it('refreshes from Razorpay (subscription and invoices) and audits the change', async () => {
    const row = makeRow({ status: 'authenticated' });
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 1,
      items: [
        {
          id: 'inv_Unit000001',
          entity: 'invoice',
          subscription_id: 'sub_Unit000001',
          payment_id: 'pay_Unit000001',
          order_id: null,
          status: 'paid',
          amount: 99000,
          amount_paid: 99000,
          amount_due: 0,
          currency: 'INR',
          billing_start: null,
          billing_end: null,
          issued_at: null,
          paid_at: null,
          expired_at: null,
          short_url: null,
          created_at: 1792562500,
        },
      ],
    });
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment());
    db.applyPayment.mockResolvedValue({ outcome: 'granted' });
    db.getSubscription.mockResolvedValue(makeRow({ status: 'active' }));

    const res = await adminSyncSubscription(deps, row, {
      actorUserId: 'admin-1',
      audit,
    });

    expect(client.listSubscriptionInvoices).toHaveBeenCalledWith(
      'sub_Unit000001',
      { count: 5 }
    );
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.anything(),
      'admin'
    );
    expect(res).toMatchObject({
      applied: 1,
      notesUpdated: 0,
      previousStatus: 'authenticated',
      status: 'active',
    });
    expect(audit).toHaveBeenCalledWith(
      row.account_id,
      'row-1',
      'admin-1',
      'Synced from Razorpay: authenticated -> active, 1 payment(s) applied, notes updated on 0 payment(s)'
    );
  });

  it('backfills payment notes on the stored payments and counts them', async () => {
    const row = makeRow({ status: 'authenticated' });
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });
    db.getSubscription.mockResolvedValue(row);
    db.listPaymentIdsForNotes.mockResolvedValue(['pay_Auth000001']);
    db.getPaymentNoteContext.mockResolvedValue(
      makeNoteContext({ kind: 'authorization', invoiceId: null })
    );
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ id: 'pay_Auth000001', invoice_id: null, notes: [] })
    );
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());

    const res = await adminSyncSubscription(deps, row, {
      actorUserId: 'admin-1',
      audit,
    });

    expect(db.listPaymentIdsForNotes).toHaveBeenCalledWith('row-1', 10);
    expect(client.updatePaymentNotes).toHaveBeenCalledWith(
      'pay_Auth000001',
      expect.objectContaining({ charge_type: 'card_verification' })
    );
    expect(res.notesUpdated).toBe(1);
    expect(audit).toHaveBeenCalledWith(
      row.account_id,
      'row-1',
      'admin-1',
      expect.stringContaining('notes updated on 1 payment(s)')
    );
  });

  it('still completes the sync when the notes backfill cannot read payments', async () => {
    const row = makeRow({ status: 'authenticated' });
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });
    db.getSubscription.mockResolvedValue(row);
    db.listPaymentIdsForNotes.mockRejectedValue(new Error('db down'));

    const res = await adminSyncSubscription(deps, row, {
      actorUserId: 'admin-1',
      audit,
    });
    expect(res).toMatchObject({ notesUpdated: 0, audited: true });
  });

  it('refuses the other mode and a row with no Razorpay id', async () => {
    deps.config = makeConfig({ mode: 'live', keyId: 'rzp_live_unit000000' });
    await expect(
      adminSyncSubscription(deps, makeRow(), { actorUserId: 'a', audit })
    ).rejects.toMatchObject({ code: 'mode_unavailable' });

    deps.config = makeConfig();
    await expect(
      adminSyncSubscription(
        deps,
        makeRow({ status: 'initiating', provider_subscription_id: null }),
        { actorUserId: 'a', audit }
      )
    ).rejects.toMatchObject({ code: 'no_provider_id', status: 409 });
    expect(client.fetchSubscription).not.toHaveBeenCalled();
  });
});
