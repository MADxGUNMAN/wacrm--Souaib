import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
  superAdmin: true as boolean,
  log: [] as string[],
  liveAutopay: [] as Record<string, unknown>[],
  banAccount: vi.fn(),
  cancelAutopay: vi.fn(),
  notifyAdmin: vi.fn(),
  deliver: vi.fn(),
  after: [] as (() => unknown)[],
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (cb: () => unknown) => {
    state.after.push(cb);
  },
}));

vi.mock('@/lib/super-admin/guard', () => ({
  requireSuperAdmin: async () => {
    if (!state.superAdmin) {
      throw NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return { userId: 'admin-1', email: 'sa@example.com' };
  },
  superAdminErrorResponse: (err: unknown) =>
    err instanceof NextResponse ? err : null,
}));

vi.mock('@/lib/super-admin/queries', () => ({
  banAccount: async (...a: unknown[]) => {
    state.log.push('ban');
    return state.banAccount(...a);
  },
  unbanAccount: vi.fn(async () => {}),
}));

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => ({ marker: 'admin-client' }),
  MissingServerConfigError: class extends Error {},
}));

vi.mock('@/lib/billing/razorpay/account-autopay', async (orig) => {
  const actual =
    await orig<typeof import('@/lib/billing/razorpay/account-autopay')>();
  return {
    ...actual,
    getAutopayDeps: () => null,
    listLiveAutopay: async (_admin: unknown, accountId: unknown) => {
      state.log.push(`list:${String(accountId)}`);
      return state.liveAutopay;
    },
    cancelLiveAutopayForAccount: async (input: unknown) => {
      state.log.push('cancelAutopay');
      return state.cancelAutopay(input);
    },
  };
});

vi.mock('@/lib/billing/razorpay/store', () => ({
  createBillingStore: () => ({ notifyAdmin: state.notifyAdmin }),
}));

vi.mock('@/lib/billing/razorpay/jobs', () => ({
  getEventDeps: () => ({}),
  deliverBillingEmails: (...a: unknown[]) => state.deliver(...a),
}));

import { AutopayCancelError } from '@/lib/billing/razorpay/account-autopay';
import { POST as ban } from './route';

const ACCT = '33333333-3333-4333-8333-333333333333';
const params = { params: Promise.resolve({ id: ACCT }) };
const req = (body: unknown, origin = 'https://app.test') =>
  new Request(`https://app.test/api/super-admin/accounts/${ACCT}/ban`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'app.test',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

const liveRow = {
  id: 'bs-1',
  account_id: ACCT,
  mode: 'test',
  status: 'active',
  provider_subscription_id: 'sub_Ban000001',
  created_at: '2026-10-01T00:00:00.000Z',
  plan_name: 'Pro',
  cycle_label: 'Monthly',
};

beforeEach(() => {
  state.superAdmin = true;
  state.log = [];
  state.liveAutopay = [];
  state.after = [];
  state.banAccount.mockReset();
  state.banAccount.mockResolvedValue(undefined);
  state.cancelAutopay.mockReset();
  state.cancelAutopay.mockResolvedValue({ outcome: 'none' });
  state.notifyAdmin.mockReset();
  state.notifyAdmin.mockResolvedValue(undefined);
  state.deliver.mockReset();
  state.deliver.mockResolvedValue({});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/super-admin/accounts/[id]/ban', () => {
  it('refuses non-super-admins', async () => {
    state.superAdmin = false;
    const res = await ban(req({ reason: 'Spam' }), params);
    expect(res.status).toBe(403);
    expect(state.log).toEqual([]);
  });

  it('refuses cross-site requests and bans nothing', async () => {
    for (const origin of ['https://evil.test', '']) {
      const res = await ban(req({ reason: 'Spam' }, origin), params);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('bad_origin');
    }
    expect(state.log).toEqual([]);
  });

  it('refuses an invalid account id', async () => {
    const res = await ban(req({}), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
    expect(state.log).toEqual([]);
  });

  it('asks for confirmation when a live AutoPay exists, without banning', async () => {
    state.liveAutopay = [liveRow];
    const res = await ban(req({ reason: 'Spam' }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'autopay_confirmation_required',
      error:
        'This workspace has an active Razorpay AutoPay. Banning it also cancels the AutoPay at Razorpay immediately. Confirm to continue.',
      autopay: [
        {
          mode: 'test',
          status: 'active',
          provider_subscription_id: 'sub_Ban000001',
        },
      ],
    });
    expect(state.log).toEqual([`list:${ACCT}`]);
    expect(state.banAccount).not.toHaveBeenCalled();
  });

  it('with confirmation, bans first, then cancels AutoPay and emails', async () => {
    state.liveAutopay = [liveRow];
    const cancelled = [
      {
        id: 'bs-1',
        providerSubscriptionId: 'sub_Ban000001',
        mode: 'test',
        alreadyCancelled: false,
      },
    ];
    state.cancelAutopay.mockResolvedValue({ outcome: 'cancelled', cancelled });

    const res = await ban(
      req({ reason: 'Spam', confirmAutopayCancel: true }),
      params
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: 'Account banned',
      autopay: { outcome: 'cancelled', cancelled },
    });
    expect(state.log).toEqual([`list:${ACCT}`, 'ban', 'cancelAutopay']);
    expect(state.banAccount).toHaveBeenCalledWith(ACCT, 'Spam', 'admin-1');
    expect(state.cancelAutopay).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCT,
        actorUserId: 'admin-1',
        context: 'account_ban',
        reason: 'Spam',
      })
    );
    expect(state.notifyAdmin).not.toHaveBeenCalled();

    expect(state.after).toHaveLength(1);
    await state.after[0]();
    expect(state.deliver).toHaveBeenCalledWith({}, { limit: 5 });
  });

  it('stays banned and reports the failure when Razorpay does not cancel', async () => {
    state.liveAutopay = [liveRow];
    const message =
      "Razorpay did not cancel this workspace's AutoPay (sub_Ban000001), so AutoPay is still active. Razorpay said: down. Try again in a minute.";
    state.cancelAutopay.mockRejectedValue(
      new AutopayCancelError('autopay_cancel_failed', message, 502)
    );

    const res = await ban(
      req({ reason: 'Spam', confirmAutopayCancel: true }),
      params
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      autopay: { outcome: 'failed', code: 'autopay_cancel_failed', message },
    });
    expect(state.banAccount).toHaveBeenCalledTimes(1);
    expect(state.notifyAdmin).toHaveBeenCalledWith({
      type: 'billing_anomaly',
      severity: 'warning',
      title: 'Account banned but AutoPay was not cancelled',
      body: message,
      accountId: ACCT,
    });
    expect(state.after).toHaveLength(0);
  });

  it('reports none when the workspace has no AutoPay', async () => {
    const res = await ban(req({ reason: 'Spam' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).autopay).toEqual({ outcome: 'none' });
    expect(state.banAccount).toHaveBeenCalledTimes(1);
    expect(state.notifyAdmin).not.toHaveBeenCalled();
    expect(state.after).toHaveLength(0);
  });
});
