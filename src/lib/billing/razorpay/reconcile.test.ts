import { describe, expect, it, vi } from 'vitest';

import { makeRazorpaySubscription, makeRow } from './__fixtures__/factories';
import { makeEventDeps } from './__fixtures__/phase3';
import { resolveOrphanClaim, runReconciliation } from './reconcile';

describe('resolveOrphanClaim', () => {
  it('releases a stale claim and cancels the unauthorised subscription Razorpay created for it', async () => {
    const { deps, client, db, store } = makeEventDeps();
    const row = makeRow({
      status: 'initiating',
      provider_subscription_id: null,
      checkout_id: 'chk-orphan',
    });
    client.listSubscriptions.mockResolvedValue({
      entity: 'collection',
      count: 2,
      items: [
        makeRazorpaySubscription({
          id: 'sub_Other000001',
          notes: { checkout_id: 'chk-other' },
        }),
        makeRazorpaySubscription({
          id: 'sub_Orphan00001',
          notes: { checkout_id: 'chk-orphan' },
        }),
      ],
    });
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );

    expect(await resolveOrphanClaim(deps, row)).toBe(true);

    expect(db.markCreateFailed).toHaveBeenCalledWith(
      row.id,
      expect.stringContaining('reconciliation')
    );
    expect(client.listSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: row.provider_plan_id, count: 100 })
    );
    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Orphan00001',
      false
    );
    expect(client.cancelSubscription).not.toHaveBeenCalledWith(
      'sub_Other000001',
      false
    );
    expect(store.markOrphanChecked).toHaveBeenCalledWith(row.id);
  });

  it('never cancels a match that is no longer unauthorised', async () => {
    const { deps, client } = makeEventDeps();
    client.listSubscriptions.mockResolvedValue({
      entity: 'collection',
      count: 1,
      items: [
        makeRazorpaySubscription({
          status: 'authenticated',
          notes: { checkout_id: 'chk-1' },
        }),
      ],
    });
    expect(
      await resolveOrphanClaim(
        deps,
        makeRow({ status: 'failed_to_create', provider_subscription_id: null })
      )
    ).toBe(false);
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('runReconciliation', () => {
  it('runs every step, records the run, and reports counts', async () => {
    const { deps, client, db, store } = makeEventDeps();
    store.reconcileCandidates.mockResolvedValue([
      { id: 'row-1', reason: 'charge_overdue' },
    ]);
    db.getSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });
    const deliver = vi.fn(async () => ({ sent: 2 }));

    const summary = await runReconciliation(deps, { deliver });

    expect(store.claimWebhookEvents).toHaveBeenCalled();
    expect(client.fetchSubscription).toHaveBeenCalledWith('sub_Unit000001');
    expect(deliver).toHaveBeenCalled();
    expect(store.purge).toHaveBeenCalled();
    expect(summary.subscriptions).toMatchObject({ checked: 1, errors: 0 });
    expect(summary.notifications).toEqual({ sent: 2 });
    expect(store.finishRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('one failing subscription does not stop the others, and the run is marked failed', async () => {
    const { deps, client, db, store } = makeEventDeps();
    store.reconcileCandidates.mockResolvedValue([
      { id: 'row-a', reason: 'sweep' },
      { id: 'row-b', reason: 'sweep' },
    ]);
    db.getSubscription.mockImplementation(async (id) =>
      makeRow({
        id,
        provider_subscription_id:
          id === 'row-a' ? 'sub_Aaaaaaaaaa' : 'sub_Bbbbbbbbbb',
        status: 'active',
      })
    );
    client.fetchSubscription.mockImplementation(async (id) => {
      if (id === 'sub_Aaaaaaaaaa') throw new Error('timeout');
      return makeRazorpaySubscription({ id, status: 'active' });
    });
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });

    const summary = await runReconciliation(deps, {
      deliver: async () => null,
    });

    expect(summary.subscriptions).toMatchObject({ checked: 2, errors: 1 });
    expect(store.finishRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('backfills payment notes on the daily sweep only', async () => {
    const { deps, client, db, store } = makeEventDeps();
    store.reconcileCandidates.mockResolvedValue([
      { id: 'row-sweep', reason: 'sweep' },
      { id: 'row-due', reason: 'charge_overdue' },
    ]);
    db.getSubscription.mockImplementation(async (id) =>
      makeRow({ id, status: 'active' })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });

    await runReconciliation(deps, { deliver: async () => null });

    expect(db.listPaymentIdsForNotes).toHaveBeenCalledTimes(1);
    expect(db.listPaymentIdsForNotes).toHaveBeenCalledWith('row-sweep', 10);
  });

  it('a notes backfill error does not count as a failed subscription', async () => {
    const { deps, client, db, store } = makeEventDeps();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.reconcileCandidates.mockResolvedValue([
      { id: 'row-1', reason: 'sweep' },
    ]);
    db.getSubscription.mockResolvedValue(makeRow({ status: 'active' }));
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });
    db.listPaymentIdsForNotes.mockRejectedValue(new Error('db down'));

    const summary = await runReconciliation(deps, {
      deliver: async () => null,
    });
    expect(summary.subscriptions).toMatchObject({ checked: 1, errors: 0 });
    expect(summary.errors).toEqual([]);
  });

  it('records a cron run with no actor by default', async () => {
    const { deps, store } = makeEventDeps();
    await runReconciliation(deps, { deliver: async () => null });
    expect(store.startRun).toHaveBeenCalledWith('test', 'cron', null);
  });

  it('records a manual run with scope admin and the operator', async () => {
    const { deps, store } = makeEventDeps();
    await runReconciliation(deps, {
      deliver: async () => null,
      scope: 'admin',
      triggeredBy: 'admin-1',
    });
    expect(store.startRun).toHaveBeenCalledWith('test', 'admin', 'admin-1');
  });

  it('stops picking up subscriptions once the time budget is spent', async () => {
    const { deps, db, store } = makeEventDeps();
    store.reconcileCandidates.mockResolvedValue([
      { id: 'row-1', reason: 'sweep' },
    ]);
    let t = 0;
    const clock = () => (t += 50_000);
    await runReconciliation(deps, {
      deliver: async () => null,
      budgetMs: 40_000,
      clock,
    });
    expect(db.getSubscription).not.toHaveBeenCalled();
  });
});
