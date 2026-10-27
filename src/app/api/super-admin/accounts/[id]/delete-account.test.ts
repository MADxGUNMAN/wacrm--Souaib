import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.hoisted(() => {
  process.env.ENCRYPTION_KEY = 'd'.repeat(64);
});

const state = vi.hoisted(() => ({
  superAdmin: true as boolean,
  account: null as null | Record<string, unknown>,
  members: [] as Record<string, unknown>[],
  passwordOk: true,
  twoFactor: false,
  rpc: vi.fn(),
  log: [] as string[],
  liveAutopay: [] as Record<string, unknown>[],
  cancelAutopay: vi.fn(),
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

vi.mock('@/lib/auth/admin-client', () => {
  const table = (name: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      update: chain,
      maybeSingle: async () => ({
        data: name === 'accounts' ? state.account : null,
        error: null,
      }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          data: name === 'profiles' ? state.members : null,
          error: null,
        }).then(ok),
    });
    return b;
  };
  return {
    supabaseAdmin: () => ({
      from: table,
      rpc: (...a: unknown[]) => {
        state.log.push(`rpc:${String(a[0])}`);
        return state.rpc(...a);
      },
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
          remove: async () => ({ error: null }),
        }),
      },
    }),
    MissingServerConfigError: class extends Error {},
  };
});

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => ({
    auth: {
      signInWithPassword: async () => ({
        error: state.passwordOk ? null : { message: 'bad' },
      }),
      signOut: async () => ({}),
    },
  }),
}));

vi.mock('@/lib/two-factor/server', () => ({
  hasActiveTwoFactor: async () => state.twoFactor,
  verifyUserTotp: async (_a: unknown, _u: unknown, code: unknown) =>
    code === '123456' ? 'ok' : 'invalid',
}));
vi.mock('@/lib/billing/razorpay/account-autopay', async (orig) => {
  const actual =
    await orig<typeof import('@/lib/billing/razorpay/account-autopay')>();
  return {
    ...actual,
    getAutopayDeps: () => null,
    listLiveAutopay: async () => state.liveAutopay,
    cancelLiveAutopayForAccount: async (input: unknown) => {
      state.log.push('cancelAutopay');
      return state.cancelAutopay(input);
    },
  };
});
vi.mock('@/lib/storage/s3-client', () => ({
  deleteS3Prefix: vi.fn(async () => 0),
}));

import { __resetRateLimitForTests } from '@/lib/rate-limit';
import { AutopayCancelError } from '@/lib/billing/razorpay/account-autopay';
import { POST as verify } from './delete/verify/route';
import { DELETE as destroy } from './route';

const ACCT = '22222222-2222-4222-8222-222222222222';
const params = { params: Promise.resolve({ id: ACCT }) };
const req = (method: string, body: unknown, origin = 'https://app.test') =>
  new Request(`https://app.test/api/super-admin/accounts/${ACCT}`, {
    method,
    headers: {
      'content-type': 'application/json',
      host: 'app.test',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

async function getToken(): Promise<string> {
  const res = await verify(req('POST', { password: 'pw' }), params);
  return (await res.json()).token;
}

beforeEach(() => {
  __resetRateLimitForTests();
  state.superAdmin = true;
  state.account = {
    id: ACCT,
    name: 'Acme',
    is_banned: false,
    owner_user_id: 'owner-1',
  };
  state.members = [{ user_id: 'owner-1', is_super_admin: false }];
  state.passwordOk = true;
  state.twoFactor = false;
  state.rpc.mockReset();
  state.log = [];
  state.liveAutopay = [];
  state.cancelAutopay.mockReset();
  state.cancelAutopay.mockResolvedValue({ outcome: 'none' });
  state.rpc.mockResolvedValue({
    data: {
      audit_id: 'a1',
      member_ids: ['owner-1'],
      support_conversation_ids: [],
    },
    error: null,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('who can delete', () => {
  it('refuses non-super-admins on both steps', async () => {
    state.superAdmin = false;
    expect((await verify(req('POST', { password: 'pw' }), params)).status).toBe(
      403
    );
    expect(
      (
        await destroy(
          req('DELETE', { token: 'x', confirmation: 'CONFIRM' }),
          params
        )
      ).status
    ).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('refuses cross-site requests', async () => {
    expect(
      (
        await verify(
          req('POST', { password: 'pw' }, 'https://evil.test'),
          params
        )
      ).status
    ).toBe(403);
    expect((await destroy(req('DELETE', {}, ''), params)).status).toBe(403);
  });
});

describe('step 1 — password', () => {
  it('rejects a wrong password and rate limits guesses', async () => {
    state.passwordOk = false;
    const res = await verify(req('POST', { password: 'nope' }), params);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('invalid_password');
    for (let i = 0; i < 4; i++)
      await verify(req('POST', { password: 'nope' }), params);
    expect((await verify(req('POST', { password: 'pw' }), params)).status).toBe(
      429
    );
  });

  it('asks for the 2FA code when the super admin uses 2FA', async () => {
    state.twoFactor = true;
    const r1 = await verify(req('POST', { password: 'pw' }), params);
    expect((await r1.json()).code).toBe('two_factor_code_required');
    const r2 = await verify(
      req('POST', { password: 'pw', code: '000000' }),
      params
    );
    expect((await r2.json()).code).toBe('invalid_two_factor_code');
    const r3 = await verify(
      req('POST', { password: 'pw', code: '123456' }),
      params
    );
    expect((await r3.json()).token).toBeTruthy();
  });

  it('refuses a banned account before checking the password', async () => {
    state.account = { ...state.account!, is_banned: true };
    const res = await verify(req('POST', { password: 'pw' }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'account_banned',
      error: expect.stringContaining('Unban it first'),
    });
  });

  it('refuses a workspace that holds a super admin', async () => {
    state.members = [{ user_id: 'x', is_super_admin: true }];
    expect((await verify(req('POST', { password: 'pw' }), params)).status).toBe(
      403
    );
  });
});

describe('step 2+3 — delete', () => {
  it('needs a valid token and the word CONFIRM', async () => {
    const token = await getToken();
    expect(
      (
        await destroy(
          req('DELETE', { token: 'forged', confirmation: 'CONFIRM' }),
          params
        )
      ).status
    ).toBe(401);
    expect(
      (await destroy(req('DELETE', { token, confirmation: 'confirm' }), params))
        .status
    ).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
    const res = await destroy(
      req('DELETE', { token, confirmation: 'CONFIRM' }),
      params
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      deleted_members: 1,
    });
    expect(state.rpc).toHaveBeenCalledWith('sa_delete_account', {
      p_account_id: ACCT,
      p_actor_user_id: 'admin-1',
    });
  });

  it('refuses if the account was banned after the password step', async () => {
    const token = await getToken();
    state.account = { ...state.account!, is_banned: true };
    const res = await destroy(
      req('DELETE', { token, confirmation: 'CONFIRM' }),
      params
    );
    expect(res.status).toBe(409);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('maps a database-level ban refusal (race) to 409', async () => {
    const token = await getToken();
    state.rpc.mockResolvedValue({
      data: null,
      error: { message: 'account_banned' },
    });
    const res = await destroy(
      req('DELETE', { token, confirmation: 'CONFIRM' }),
      params
    );
    expect(res.status).toBe(409);
  });
});

describe('Razorpay AutoPay on delete', () => {
  const liveRow = {
    id: 'bs-1',
    account_id: ACCT,
    mode: 'test',
    status: 'active',
    provider_subscription_id: 'sub_Del000001',
    created_at: '2026-10-01T00:00:00.000Z',
    plan_name: 'Pro',
    cycle_label: 'Monthly',
  };

  it('verify lists the live AutoPay the delete will cancel', async () => {
    state.liveAutopay = [
      liveRow,
      // a stale checkout claim has nothing to cancel and is not listed
      {
        ...liveRow,
        id: 'bs-2',
        status: 'initiating',
        provider_subscription_id: null,
      },
    ];
    const res = await verify(req('POST', { password: 'pw' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).live_autopay).toEqual([
      {
        mode: 'test',
        status: 'active',
        provider_subscription_id: 'sub_Del000001',
      },
    ]);
  });

  it('cancels AutoPay BEFORE sa_delete_account and reports it', async () => {
    const token = await getToken();
    state.cancelAutopay.mockResolvedValue({
      outcome: 'cancelled',
      cancelled: [
        {
          id: 'bs-1',
          providerSubscriptionId: 'sub_Del000001',
          mode: 'test',
          alreadyCancelled: false,
        },
      ],
    });
    const res = await destroy(
      req('DELETE', { token, confirmation: 'CONFIRM' }),
      params
    );
    expect(res.status).toBe(200);
    expect((await res.json()).autopay_cancelled).toEqual(['sub_Del000001']);
    expect(state.log).toEqual(['cancelAutopay', 'rpc:sa_delete_account']);
    expect(state.cancelAutopay).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCT,
        actorUserId: 'admin-1',
        context: 'account_delete',
      })
    );
  });

  it('refuses the delete when Razorpay does not cancel, naming the subscription', async () => {
    const token = await getToken();
    state.cancelAutopay.mockRejectedValue(
      new AutopayCancelError(
        'autopay_cancel_failed',
        "Razorpay did not cancel this workspace's AutoPay (sub_Del000001), so nothing was deleted. Razorpay said: down. Try again in a minute.",
        502
      )
    );
    const res = await destroy(
      req('DELETE', { token, confirmation: 'CONFIRM' }),
      params
    );
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      code: 'autopay_cancel_failed',
      error: expect.stringContaining('sub_Del000001'),
    });
    expect(state.rpc).not.toHaveBeenCalledWith(
      'sa_delete_account',
      expect.anything()
    );
  });

  it('refuses the delete when the AutoPay mode is unreachable from this server', async () => {
    const token = await getToken();
    state.cancelAutopay.mockRejectedValue(
      new AutopayCancelError(
        'autopay_unreachable',
        'This workspace has a Razorpay AutoPay in live mode (sub_Live000001) that this server cannot reach.',
        409
      )
    );
    const res = await destroy(
      req('DELETE', { token, confirmation: 'CONFIRM' }),
      params
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('autopay_unreachable');
    expect(state.log).not.toContain('rpc:sa_delete_account');
  });
});
