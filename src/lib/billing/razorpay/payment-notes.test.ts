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
import { makeEventDeps, makeEventRow } from './__fixtures__/phase3';
import { RazorpayApiError } from './client';
import { processWebhookEvent } from './events';
import {
  backfillPaymentNotes,
  ensurePaymentNotes,
  ensurePaymentNotesSafely,
} from './payment-notes';
import { refreshSubscription, syncPayment, type BillingDeps } from './service';
import type { RazorpayInvoice } from './types';

const INVOICE: RazorpayInvoice = {
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
};

/** What our notes look like for the default note context. */
const EXPECTED = {
  product: 'Replai',
  workspace: 'Replai Demo',
  account_id: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
  plan: 'Replai',
  billing_cycle: 'Monthly',
  charge_type: 'first_payment',
  period_start: '22 Oct 2026',
  period_end: '21 Nov 2026',
  subscription_id: 'sub_Unit000001',
  invoice_id: 'inv_Unit000001',
  env: 'dev',
  mode: 'test',
};

let db: ReturnType<typeof makeDb>;
let client: ReturnType<typeof makeClient>;
let deps: BillingDeps;
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db = makeDb();
  client = makeClient();
  deps = { db, client, config: makeConfig() };
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ensurePaymentNotes', () => {
  it('writes our notes when the payment has none', async () => {
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());

    expect(
      await ensurePaymentNotes(deps, makeRazorpayPayment({ notes: [] }))
    ).toBe('updated');
    expect(db.getPaymentNoteContext).toHaveBeenCalledWith(
      'test',
      'pay_Unit000001'
    );
    expect(client.updatePaymentNotes).toHaveBeenCalledWith(
      'pay_Unit000001',
      EXPECTED
    );
  });

  it('is skipped when our notes are already there', async () => {
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    expect(
      await ensurePaymentNotes(
        deps,
        makeRazorpayPayment({ notes: { ...EXPECTED, other: 'kept' } })
      )
    ).toBe('unchanged');
    expect(client.updatePaymentNotes).not.toHaveBeenCalled();
  });

  it('a second run after an update sends nothing', async () => {
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    let stored: unknown = [];
    client.updatePaymentNotes.mockImplementation(async (_id, notes) => {
      stored = notes;
      return makeRazorpayPayment({ notes });
    });
    await ensurePaymentNotes(deps, makeRazorpayPayment({ notes: [] }));
    const again = await ensurePaymentNotes(
      deps,
      makeRazorpayPayment({ notes: stored as Record<string, string> })
    );
    expect(again).toBe('unchanged');
    expect(client.updatePaymentNotes).toHaveBeenCalledTimes(1);
  });

  it('keeps notes already on the payment beside ours', async () => {
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());
    await ensurePaymentNotes(
      deps,
      makeRazorpayPayment({ notes: { source: 'checkout' } })
    );
    expect(client.updatePaymentNotes.mock.calls[0][1]).toMatchObject({
      ...EXPECTED,
      source: 'checkout',
    });
  });

  it('labels the setup check and leaves out its period', async () => {
    db.getPaymentNoteContext.mockResolvedValue(
      makeNoteContext({ kind: 'authorization', invoiceId: null })
    );
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());
    await ensurePaymentNotes(
      deps,
      makeRazorpayPayment({ invoice_id: null, notes: [] })
    );
    const notes = client.updatePaymentNotes.mock.calls[0][1];
    expect(notes.charge_type).toBe('card_verification');
    expect(notes).not.toHaveProperty('period_start');
    expect(notes).not.toHaveProperty('invoice_id');
  });

  it('labels a later charge as a renewal', async () => {
    db.getPaymentNoteContext.mockResolvedValue(
      makeNoteContext({
        createdAt: '2026-11-21T11:33:58.000Z',
        firstAppliedChargeAt: '2026-10-22T11:33:58.000Z',
      })
    );
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());
    await ensurePaymentNotes(deps, makeRazorpayPayment({ notes: [] }));
    expect(client.updatePaymentNotes.mock.calls[0][1].charge_type).toBe(
      'renewal'
    );
  });

  it('leaves alone a payment that is not in our billing tables', async () => {
    db.getPaymentNoteContext.mockResolvedValue(null);
    expect(
      await ensurePaymentNotes(deps, makeRazorpayPayment({ notes: [] }))
    ).toBe('not_ours');
    expect(client.updatePaymentNotes).not.toHaveBeenCalled();
  });

  it('leaves alone a payment from the other environment', async () => {
    db.getPaymentNoteContext.mockResolvedValue(
      makeNoteContext({ env: 'prod' })
    );
    expect(
      await ensurePaymentNotes(deps, makeRazorpayPayment({ notes: [] }))
    ).toBe('not_ours');
    expect(client.updatePaymentNotes).not.toHaveBeenCalled();
  });

  it('the safe variant logs a Razorpay failure and never throws', async () => {
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockRejectedValue(
      new RazorpayApiError({ status: 500, description: 'oops' })
    );
    expect(
      await ensurePaymentNotesSafely(deps, makeRazorpayPayment({ notes: [] }))
    ).toBe('failed');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('payment notes pay_Unit000001: Razorpay 500')
    );
  });
});

describe('apply paths', () => {
  it('syncPayment returns the apply result even when the notes PATCH fails', async () => {
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ invoice_id: null, notes: [] })
    );
    db.applyPayment.mockResolvedValue({ outcome: 'recorded', kind: 'x' });
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockRejectedValue(
      new RazorpayApiError({ status: 500, description: 'oops' })
    );

    await expect(
      syncPayment(deps, 'pay_Unit000001', 'sub_Unit000001', 'checkout')
    ).resolves.toEqual({ outcome: 'recorded', kind: 'x' });
    expect(db.applyPayment).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalled();
  });

  it('syncPayment still returns when the notes context read fails', async () => {
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ invoice_id: null })
    );
    db.getPaymentNoteContext.mockRejectedValue(new Error('db down'));
    await expect(
      syncPayment(deps, 'pay_Unit000001', 'sub_Unit000001', 'checkout')
    ).resolves.toEqual({ outcome: 'granted' });
  });

  it('writes notes only after the payment is applied', async () => {
    const order: string[] = [];
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ invoice_id: null, notes: [] })
    );
    db.applyPayment.mockImplementation(async () => {
      order.push('apply');
      return { outcome: 'granted' };
    });
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockImplementation(async () => {
      order.push('notes');
      return makeRazorpayPayment();
    });
    await syncPayment(deps, 'pay_Unit000001', 'sub_Unit000001', 'checkout');
    expect(order).toEqual(['apply', 'notes']);
  });

  it('refreshSubscription writes notes on a newly applied renewal', async () => {
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 1,
      items: [INVOICE],
    });
    client.fetchPayment.mockResolvedValue(makeRazorpayPayment({ notes: [] }));
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());

    expect(await refreshSubscription(deps, makeRow())).toEqual({ applied: 1 });
    expect(client.updatePaymentNotes).toHaveBeenCalledWith(
      'pay_Unit000001',
      EXPECTED
    );
  });

  it('a webhook payment.captured stays processed when the notes PATCH fails', async () => {
    const ev = makeEventDeps();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ev.client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ notes: [] })
    );
    ev.client.fetchInvoice.mockResolvedValue(INVOICE);
    ev.db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    ev.client.updatePaymentNotes.mockRejectedValue(
      new RazorpayApiError({ status: 500, description: 'oops' })
    );

    const result = await processWebhookEvent(
      ev.deps,
      makeEventRow({
        event_type: 'payment.captured',
        entity_ids: { payment: 'pay_Unit000001' },
      })
    );
    expect(result).toMatchObject({ status: 'processed', note: 'granted' });
    expect(ev.db.applyPayment).toHaveBeenCalledTimes(1);
  });
});

describe('backfillPaymentNotes', () => {
  it('checks each stored payment and counts updates and failures', async () => {
    db.listPaymentIdsForNotes.mockResolvedValue([
      'pay_Done000001',
      'pay_Todo000001',
      'pay_Gone000001',
    ]);
    client.fetchPayment.mockImplementation(async (id) => {
      if (id === 'pay_Gone000001')
        throw new RazorpayApiError({ status: 0, description: 'timeout' });
      return makeRazorpayPayment({
        id,
        notes: id === 'pay_Done000001' ? EXPECTED : [],
      });
    });
    db.getPaymentNoteContext.mockResolvedValue(makeNoteContext());
    client.updatePaymentNotes.mockResolvedValue(makeRazorpayPayment());

    expect(await backfillPaymentNotes(deps, makeRow())).toEqual({
      checked: 3,
      updated: 1,
      failed: 1,
    });
    expect(db.listPaymentIdsForNotes).toHaveBeenCalledWith('row-1', 10);
    expect(client.updatePaymentNotes).toHaveBeenCalledTimes(1);
    expect(client.updatePaymentNotes).toHaveBeenCalledWith(
      'pay_Todo000001',
      EXPECTED
    );
  });
});
