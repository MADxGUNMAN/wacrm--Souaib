import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ACCOUNT_ID,
  makeClient,
  makeConfig,
  makeDb,
  makeRazorpaySubscription,
} from './__fixtures__/factories';
import {
  AutopayCancelError,
  LIVE_AUTOPAY_COLUMNS,
  cancelLiveAutopayForAccount,
  type AutopayContext,
  type LiveAutopayRow,
} from './account-autopay';
import { RazorpayApiError } from './client';
import type { BillingDeps } from './service';

const NOW = new Date('2026-10-24T06:00:00.000Z');

let rows: LiveAutopayRow[];
const calls: {
  table: string;
  select?: string;
  eq?: unknown[];
  in?: unknown[];
}[] = [];
const rpc = vi.fn(async () => ({ data: 'audit-1', error: null }));

const admin = {
  from: (table: string) => {
    const call: (typeof calls)[number] = { table };
    calls.push(call);
    const b = {
      select: (cols: string) => {
        call.select = cols;
        return b;
      },
      eq: (col: string, val: unknown) => {
        call.eq = [col, val];
        return b;
      },
      in: async (col: string, vals: unknown[]) => {
        call.in = [col, vals];
        return { data: rows, error: null };
      },
    };
    return b;
  },
  rpc,
} as unknown as SupabaseClient;

let db: ReturnType<typeof makeDb>;
let client: ReturnType<typeof makeClient>;
let deps: BillingDeps;

const row = (over: Partial<LiveAutopayRow> = {}): LiveAutopayRow => ({
  id: 'row-1',
  account_id: ACCOUNT_ID,
  mode: 'test',
  status: 'active',
  provider_subscription_id: 'sub_Unit000001',
  created_at: '2026-10-01T06:00:00.000Z',
  plan_name: 'Pro',
  cycle_label: 'Monthly',
  ...over,
});

const run = (
  context: AutopayContext = 'account_delete',
  getDeps: () => BillingDeps | null = () => deps
) =>
  cancelLiveAutopayForAccount({
    admin,
    getDeps,
    accountId: ACCOUNT_ID,
    actorUserId: 'admin-1',
    context,
    reason: 'Spam',
    now: NOW,
  });

beforeEach(() => {
  rows = [];
  calls.length = 0;
  rpc.mockClear();
  db = makeDb();
  client = makeClient();
  client.cancelSubscription.mockResolvedValue(
    makeRazorpaySubscription({ status: 'cancelled' })
  );
  client.fetchSubscription.mockResolvedValue(
    makeRazorpaySubscription({ status: 'cancelled' })
  );
  deps = { db, client, config: makeConfig(), now: () => NOW };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('listLiveAutopay query', () => {
  it('reads billing_subscriptions for this account, live statuses plus initiating', async () => {
    await run();
    expect(calls).toEqual([
      {
        table: 'billing_subscriptions',
        select: LIVE_AUTOPAY_COLUMNS,
        eq: ['account_id', ACCOUNT_ID],
        in: [
          'status',
          [
            'created',
            'authenticated',
            'active',
            'pending',
            'halted',
            'paused',
            'initiating',
          ],
        ],
      },
    ]);
    expect(LIVE_AUTOPAY_COLUMNS).toBe(
      'id, account_id, mode, status, provider_subscription_id, created_at, plan_name, cycle_label'
    );
  });
});

describe('cancelLiveAutopayForAccount', () => {
  it('returns none when there is nothing live', async () => {
    const getDeps = vi.fn(() => deps);
    expect(await run('account_delete', getDeps)).toEqual({ outcome: 'none' });
    expect(getDeps).not.toHaveBeenCalled();
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it.each([
    'created',
    'authenticated',
    'active',
    'pending',
    'halted',
    'paused',
  ])(
    'cancels a %s AutoPay immediately and records the admin',
    async (status) => {
      rows = [row({ status })];
      const res = await run();
      expect(res).toEqual({
        outcome: 'cancelled',
        cancelled: [
          {
            id: 'row-1',
            providerSubscriptionId: 'sub_Unit000001',
            mode: 'test',
            alreadyCancelled: false,
          },
        ],
      });
      expect(client.cancelSubscription).toHaveBeenCalledWith(
        'sub_Unit000001',
        false
      );
      expect(db.markCancelRequested).toHaveBeenCalledWith('row-1', 'admin');
      expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
        'test',
        expect.anything(),
        'admin'
      );
    }
  );

  it.each(['cancelled', 'expired', 'superseded', 'completed'])(
    'ignores a %s row',
    async (status) => {
      rows = [row({ status })];
      expect(await run()).toEqual({ outcome: 'none' });
      expect(client.cancelSubscription).not.toHaveBeenCalled();
    }
  );

  it('refuses while a fresh checkout is being set up', async () => {
    rows = [
      row({
        status: 'initiating',
        provider_subscription_id: null,
        created_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      }),
    ];
    await expect(run()).rejects.toMatchObject({
      code: 'checkout_in_progress',
      status: 409,
      message: expect.stringContaining('Wait 15 minutes'),
    });
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('ignores an initiating claim older than 15 minutes', async () => {
    rows = [
      row({
        status: 'initiating',
        provider_subscription_id: null,
        created_at: new Date(NOW.getTime() - 16 * 60_000).toISOString(),
      }),
    ];
    expect(await run()).toEqual({ outcome: 'none' });
  });

  it('refuses when Razorpay is not configured here, before any cancel', async () => {
    rows = [row()];
    const err = await run('account_delete', () => null).catch((e) => e);
    expect(err).toBeInstanceOf(AutopayCancelError);
    expect(err).toMatchObject({ code: 'autopay_unreachable', status: 409 });
    expect(err.message).toContain('test mode (sub_Unit000001)');
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('refuses when any row is in the other mode, before cancelling ANY', async () => {
    rows = [
      row(),
      row({
        id: 'row-2',
        mode: 'live',
        provider_subscription_id: 'sub_Live000001',
      }),
    ];
    await expect(run()).rejects.toMatchObject({
      code: 'autopay_unreachable',
      message: expect.stringContaining('live mode (sub_Live000001)'),
    });
    expect(client.cancelSubscription).not.toHaveBeenCalled();
    expect(db.markCancelRequested).not.toHaveBeenCalled();
  });

  it('treats already-cancelled and not-found as done', async () => {
    rows = [
      row(),
      row({ id: 'row-2', provider_subscription_id: 'sub_Unit000002' }),
    ];
    client.cancelSubscription
      .mockRejectedValueOnce(
        new RazorpayApiError({
          status: 400,
          description: 'Subscription is not cancellable in cancelled status.',
        })
      )
      .mockRejectedValueOnce(new RazorpayApiError({ status: 404 }));
    const res = await run();
    expect(res).toMatchObject({
      outcome: 'cancelled',
      cancelled: [{ alreadyCancelled: true }, { alreadyCancelled: true }],
    });
    expect(db.markCancelRequested).toHaveBeenCalledTimes(2);
  });

  it('refuses on a Razorpay 5xx, names the subscription, and records nothing', async () => {
    rows = [row()];
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({ status: 500, description: 'Server down.' })
    );
    await expect(run()).rejects.toMatchObject({
      code: 'autopay_cancel_failed',
      status: 502,
      message:
        "Razorpay did not cancel this workspace's AutoPay (sub_Unit000001), so nothing was deleted. Razorpay said: Server down. Try again in a minute.",
    });
    expect(db.markCancelRequested).not.toHaveBeenCalled();
  });

  it('uses the ban wording when the cancel fails during a ban', async () => {
    rows = [row()];
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({ status: 503, description: 'busy' })
    );
    await expect(run('account_ban')).rejects.toMatchObject({
      message: expect.stringContaining('so AutoPay is still active'),
    });
  });

  it('keeps going when the re-read fails', async () => {
    rows = [row()];
    client.fetchSubscription.mockRejectedValue(new Error('timeout'));
    expect((await run()).outcome).toBe('cancelled');
  });

  it('writes an audit row for a ban, not for a delete', async () => {
    rows = [row()];
    await run('account_delete');
    expect(rpc).not.toHaveBeenCalled();

    await run('account_ban');
    expect(rpc).toHaveBeenCalledWith('billing_admin_audit', {
      p_account_id: ACCOUNT_ID,
      p_billing_subscription_id: 'row-1',
      p_actor: 'admin-1',
      p_note:
        'Cancelled AutoPay sub_Unit000001 because the account was banned. Reason: Spam',
    });
  });
});
