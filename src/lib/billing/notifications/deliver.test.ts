import { describe, expect, it, vi } from 'vitest';

import { makeStore, NOW } from '@/lib/billing/razorpay/__fixtures__/phase3';
import type { BillingNotificationRow } from '@/lib/billing/razorpay/types';
import {
  NOTIFY_BACKOFF_MS,
  deliverDueNotifications,
  type DeliverDeps,
} from './deliver';

function row(
  overrides: Partial<BillingNotificationRow> = {}
): BillingNotificationRow {
  return {
    id: 'n-1',
    account_id: 'acc-1',
    kind: 'mandate_authenticated',
    dedupe_key: 'mandate:sub-1',
    recipient_user_id: 'user-1',
    recipient_email: null,
    data: { plan_name: 'Replai' },
    status: 'sending',
    attempts: 1,
    next_attempt_at: NOW.toISOString(),
    last_error: null,
    sent_at: null,
    created_at: new Date(NOW.getTime() - 60_000).toISOString(),
    mode: 'test',
    env: 'dev',
    ...overrides,
  };
}

function setup(rows: BillingNotificationRow[]) {
  const store = makeStore();
  store.claimNotifications.mockResolvedValue(rows);
  const render = vi.fn<DeliverDeps['render']>(async () => ({
    subject: 'S',
    html: '<p>H</p>',
    text: 'H',
  }));
  const send = vi.fn<DeliverDeps['send']>(async () => ({ ok: true }) as const);
  const deps: DeliverDeps = {
    store,
    mode: 'test',
    env: 'dev',
    render,
    send,
    fromName: 'Replai Billing',
    replyTo: 'support@example.com',
    now: () => NOW,
  };
  return { store, render, send, deps };
}

describe('deliverDueNotifications', () => {
  it('claims only this deployment’s mode and environment', async () => {
    const { store, deps } = setup([]);
    await deliverDueNotifications(deps, { limit: 7 });
    expect(store.claimNotifications).toHaveBeenCalledWith(
      'test',
      'dev',
      7,
      undefined
    );
  });

  it('renders with the owner’s name, sends to the address resolved now, and records it', async () => {
    const { store, render, send, deps } = setup([row()]);
    const summary = await deliverDueNotifications(deps, { limit: 5 });

    expect(render).toHaveBeenCalledWith(
      'mandate_authenticated',
      { plan_name: 'Replai' },
      'Demo Owner'
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        subject: 'S',
        fromName: 'Replai Billing',
      })
    );
    expect(store.finishNotification).toHaveBeenCalledWith('n-1', {
      status: 'sent',
      recipientEmail: 'owner@example.com',
    });
    expect(summary).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
  });

  it('skips anything older than 48 hours instead of sending stale news', async () => {
    const { store, send, deps } = setup([
      row({
        created_at: new Date(NOW.getTime() - 49 * 3_600_000).toISOString(),
      }),
    ]);
    await deliverDueNotifications(deps, { limit: 5 });
    expect(send).not.toHaveBeenCalled();
    expect(store.finishNotification).toHaveBeenCalledWith('n-1', {
      status: 'skipped',
      reason: expect.stringContaining('stale'),
    });
  });

  it('skips when there is nobody to send to', async () => {
    const { store, send, deps } = setup([row({ recipient_user_id: null })]);
    store.getRecipient.mockResolvedValue({ email: null, name: null });
    await deliverDueNotifications(deps, { limit: 5 });
    expect(send).not.toHaveBeenCalled();
    expect(store.finishNotification).toHaveBeenCalledWith('n-1', {
      status: 'skipped',
      reason: 'no recipient',
    });
  });

  it('retries a failed send with backoff', async () => {
    const { store, send, deps } = setup([row({ attempts: 3 })]);
    send.mockResolvedValue({
      ok: false,
      reason: 'send_failed',
      detail: 'SMTP 421',
    });
    const summary = await deliverDueNotifications(deps, { limit: 5 });
    expect(store.finishNotification).toHaveBeenCalledWith('n-1', {
      status: 'failed',
      error: 'SMTP 421',
      nextAttemptAt: new Date(NOW.getTime() + NOTIFY_BACKOFF_MS[2]),
    });
    expect(summary.failed).toBe(1);
  });

  it('keeps going after one row throws', async () => {
    const { store, render, deps } = setup([
      row({ id: 'n-1' }),
      row({ id: 'n-2' }),
    ]);
    render.mockRejectedValueOnce(new Error('template broke'));
    const summary = await deliverDueNotifications(deps, { limit: 5 });
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
    expect(store.finishNotification).toHaveBeenCalledWith(
      'n-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});
