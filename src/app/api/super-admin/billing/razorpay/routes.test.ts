import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

// Real config parsing for getRazorpayConfig() in the detail/overview routes.
vi.hoisted(() => {
  Object.assign(process.env, {
    RAZORPAY_MODE: 'test',
    BILLING_ENV: 'dev',
    RAZORPAY_KEY_ID: 'rzp_test_unit0000000000',
    RAZORPAY_KEY_SECRET: 'test_secret_0123456789abcdef',
    RAZORPAY_WEBHOOK_SECRET: 'w'.repeat(64),
    RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
  });
});

const state = vi.hoisted(() => ({
  superAdmin: true,
  passwordOk: true,
  twoFactor: false,
  deps: null as unknown,
  eventDeps: null as unknown,
  /** Every `.select()` the fake database saw, with its table. */
  selects: [] as { table: string; columns: string }[],
  tables: {} as Record<string, object[]>,
  rpc: vi.fn(),
  deliver: vi.fn(async () => ({ sent: 0 })),
}));

// after() needs a live request scope; collect the callbacks instead.
const afterCallbacks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
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

vi.mock('@/lib/auth/admin-client', () => {
  const table = (name: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    const rows = () => state.tables[name] ?? [];
    Object.assign(b, {
      select: (columns: string) => {
        state.selects.push({ table: name, columns });
        return b;
      },
      eq: chain,
      in: chain,
      not: chain,
      or: chain,
      is: chain,
      ilike: chain,
      order: chain,
      range: chain,
      limit: chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: rows(),
          error: null,
          count: rows().length,
        }).then(ok, fail),
    });
    return b;
  };
  return {
    supabaseAdmin: () => ({
      from: table,
      rpc: (...a: unknown[]) => state.rpc(...a),
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

vi.mock('@/lib/billing/razorpay/runtime', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay/runtime')>()),
  getBillingDeps: () => state.deps,
}));

vi.mock('@/lib/billing/razorpay/jobs', () => ({
  getEventDeps: () => state.eventDeps,
  deliverBillingEmails: (...a: unknown[]) =>
    (state.deliver as (...x: unknown[]) => unknown)(...a),
}));

import { __resetRateLimitForTests } from '@/lib/rate-limit';
import {
  ACCOUNT_ID,
  makeClient,
  makeConfig,
  makeDb,
  makeRazorpaySubscription,
  makeRow,
} from '@/lib/billing/razorpay/__fixtures__/factories';
import { makeEventDeps } from '@/lib/billing/razorpay/__fixtures__/phase3';
import { RazorpayApiError } from '@/lib/billing/razorpay/client';
import { GET as listDisputes } from './disputes/route';
import { GET as listInvoices } from './invoices/route';
import { GET as overview } from './overview/route';
import { GET as listRuns, POST as reconcile } from './reconcile/route';
import { GET as listRefunds } from './refunds/route';
import { POST as cancel } from './subscriptions/[id]/cancel/route';
import { GET as detail } from './subscriptions/[id]/route';
import { POST as sync } from './subscriptions/[id]/sync/route';
import { GET as listSubscriptions } from './subscriptions/route';
import { GET as listTransactions } from './transactions/route';
import { POST as retry } from './webhook-events/[id]/retry/route';
import { GET as listWebhookEvents } from './webhook-events/route';

const ORIGIN = 'https://app.test';
const BASE = '/api/super-admin/billing/razorpay';
const SUB_ID = '33333333-3333-4333-8333-333333333333';
const EVT_ID = '44444444-4444-4444-8444-444444444444';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function get(path: string) {
  return new Request(`${ORIGIN}${BASE}${path}`, {
    headers: { host: 'app.test' },
  });
}

function post(
  path: string,
  body: unknown = {},
  origin: string | null = ORIGIN
) {
  return new Request(`${ORIGIN}${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'app.test',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

const CANCEL_BODY = {
  password: 'pw',
  reason: 'Customer asked by email',
  confirm: true,
};

let db: ReturnType<typeof makeDb>;
let client: ReturnType<typeof makeClient>;
let events: ReturnType<typeof makeEventDeps>;

beforeEach(() => {
  __resetRateLimitForTests();
  state.superAdmin = true;
  state.passwordOk = true;
  state.twoFactor = false;
  state.selects = [];
  state.tables = {
    billing_subscriptions: [makeRow({ id: SUB_ID, status: 'cancelled' })],
    accounts: [
      {
        id: ACCOUNT_ID,
        name: 'Demo',
        subscription_ends_at: '2027-04-06T11:49:35.665Z',
      },
    ],
  };
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: 'audit-1', error: null });
  state.deliver.mockClear();
  afterCallbacks.length = 0;

  db = makeDb();
  client = makeClient();
  db.getSubscription.mockResolvedValue(
    makeRow({ id: SUB_ID, status: 'active' })
  );
  state.deps = { db, client, config: makeConfig() };
  events = makeEventDeps();
  state.eventDeps = events.deps;

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const GETS: [string, () => Promise<Response>][] = [
  ['subscriptions', () => listSubscriptions(get('/subscriptions'))],
  [
    'subscription detail',
    () => detail(get(`/subscriptions/${SUB_ID}`), ctx(SUB_ID)),
  ],
  ['transactions', () => listTransactions(get('/transactions'))],
  ['invoices', () => listInvoices(get('/invoices'))],
  ['refunds', () => listRefunds(get('/refunds'))],
  ['disputes', () => listDisputes(get('/disputes'))],
  ['webhook events', () => listWebhookEvents(get('/webhook-events'))],
  ['reconcile runs', () => listRuns(get('/reconcile'))],
  ['overview', () => overview(get('/overview'))],
];

const POSTS: [string, (origin: string | null) => Promise<Response>][] = [
  [
    'sync',
    (o) => sync(post(`/subscriptions/${SUB_ID}/sync`, {}, o), ctx(SUB_ID)),
  ],
  [
    'cancel',
    (o) =>
      cancel(
        post(`/subscriptions/${SUB_ID}/cancel`, CANCEL_BODY, o),
        ctx(SUB_ID)
      ),
  ],
  [
    'retry',
    (o) => retry(post(`/webhook-events/${EVT_ID}/retry`, {}, o), ctx(EVT_ID)),
  ],
  ['reconcile', (o) => reconcile(post('/reconcile', {}, o))],
];

function nothingCalled() {
  expect(state.rpc).not.toHaveBeenCalled();
  expect(client.cancelSubscription).not.toHaveBeenCalled();
  expect(client.fetchSubscription).not.toHaveBeenCalled();
  expect(db.getSubscription).not.toHaveBeenCalled();
  expect(db.markCancelRequested).not.toHaveBeenCalled();
  expect(events.store.startRun).not.toHaveBeenCalled();
  expect(afterCallbacks).toHaveLength(0);
}

describe('access', () => {
  it.each(GETS)('GET %s refuses a non-super-admin', async (_name, call) => {
    state.superAdmin = false;
    expect((await call()).status).toBe(403);
    nothingCalled();
  });

  it.each(POSTS)('POST %s refuses a non-super-admin', async (_name, call) => {
    state.superAdmin = false;
    expect((await call(ORIGIN)).status).toBe(403);
    nothingCalled();
  });

  it.each(POSTS)(
    'POST %s refuses a missing or foreign Origin and does nothing',
    async (_name, call) => {
      for (const origin of [null, 'https://evil.test']) {
        const res = await call(origin);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: 'Forbidden',
          code: 'bad_origin',
        });
      }
      nothingCalled();
    }
  );

  it('answers every list with no-store', async () => {
    for (const [, call] of GETS) {
      expect((await call()).headers.get('Cache-Control')).toBe('no-store');
    }
  });
});

describe('lists', () => {
  it('returns a page with account names', async () => {
    const res = await listSubscriptions(
      get('/subscriptions?mode=test&pageSize=10&sort=charge_at')
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      items: [{ id: SUB_ID, accountName: 'Demo', mode: 'test' }],
    });
  });

  it('never selects the webhook payload, in the list or the detail', async () => {
    state.tables.billing_webhook_events = [
      {
        id: EVT_ID,
        mode: 'test',
        provider_event_id: 'evt_Unit000001',
        event_type: 'subscription.charged',
        status: 'processed',
        received_at: '2026-10-21T06:00:00.000Z',
      },
    ];
    expect((await listWebhookEvents(get('/webhook-events'))).status).toBe(200);
    expect(
      (await detail(get(`/subscriptions/${SUB_ID}`), ctx(SUB_ID))).status
    ).toBe(200);

    const webhookSelects = state.selects.filter(
      (s) => s.table === 'billing_webhook_events'
    );
    expect(webhookSelects.length).toBe(2);
    for (const s of webhookSelects) {
      expect(s.columns).not.toMatch(/payload/);
      expect(s.columns).not.toMatch(/\*/);
    }
  });

  it('detail reports whether this server can act on the row', async () => {
    const res = await detail(get(`/subscriptions/${SUB_ID}`), ctx(SUB_ID));
    expect(await res.json()).toMatchObject({
      subscription: {
        id: SUB_ID,
        accountName: 'Demo',
        paidThrough: '2027-04-06T11:49:35.665Z',
      },
      canAct: true,
      configuredMode: 'test',
    });

    state.tables.billing_subscriptions = [];
    expect(
      (await detail(get(`/subscriptions/${SUB_ID}`), ctx(SUB_ID))).status
    ).toBe(404);
    expect(
      (await detail(get('/subscriptions/not-a-uuid'), ctx('not-a-uuid'))).status
    ).toBe(400);
  });

  it('overview reports the configured mode', async () => {
    state.rpc.mockResolvedValue({
      data: { subscriptions: { 'test:authenticated': 1 } },
      error: null,
    });
    const res = await overview(get('/overview'));
    expect(await res.json()).toMatchObject({
      configured: true,
      mode: 'test',
      overview: {
        subscriptions: { 'test:authenticated': 1 },
        webhooks: {},
        last_runs: {},
      },
    });
    expect(state.rpc).toHaveBeenCalledWith('billing_admin_overview', {});
  });
});

describe('POST cancel', () => {
  const call = (body: unknown = CANCEL_BODY) =>
    cancel(post(`/subscriptions/${SUB_ID}/cancel`, body), ctx(SUB_ID));

  it('refuses a wrong password before any Razorpay call', async () => {
    state.passwordOk = false;
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'invalid_password' });
    expect(client.cancelSubscription).not.toHaveBeenCalled();
    expect(db.getSubscription).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('asks for the 2FA code, and refuses a wrong one', async () => {
    state.twoFactor = true;
    expect(await (await call()).json()).toMatchObject({
      code: 'two_factor_code_required',
    });
    const res = await call({ ...CANCEL_BODY, code: '000000' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      code: 'invalid_two_factor_code',
    });
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('needs confirm: true and a reason of 5 to 500 characters', async () => {
    const noConfirm = await call({ ...CANCEL_BODY, confirm: 'yes' });
    expect(noConfirm.status).toBe(400);
    expect(await noConfirm.json()).toEqual({
      error: 'Please confirm that you want to cancel this AutoPay.',
      code: 'confirmation_required',
    });

    const short = await call({ ...CANCEL_BODY, reason: '  ab  ' });
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({
      error: 'Type a reason of at least 5 characters.',
      code: 'reason_required',
    });

    const long = await call({ ...CANCEL_BODY, reason: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect((await long.json()).code).toBe('reason_required');
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancels at Razorpay, records the admin, audits the reason and sends the email from after()', async () => {
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );

    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      alreadyCancelled: false,
      synced: true,
      subscription: { id: SUB_ID, status: 'cancelled', accountName: 'Demo' },
    });
    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Unit000001',
      false
    );
    expect(db.markCancelRequested).toHaveBeenCalledWith(SUB_ID, 'admin');
    expect(db.applySubscriptionSnapshot).toHaveBeenCalledWith(
      'test',
      expect.anything(),
      'admin'
    );
    expect(state.rpc).toHaveBeenCalledWith(
      'billing_admin_audit',
      expect.objectContaining({
        p_account_id: ACCOUNT_ID,
        p_billing_subscription_id: SUB_ID,
        p_actor: 'admin-1',
        p_note: expect.stringContaining('Reason: Customer asked by email'),
      })
    );

    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(state.deliver).toHaveBeenCalledWith(events.deps, { limit: 5 });
  });

  it('answers 502 on a Razorpay 5xx and records nothing', async () => {
    client.cancelSubscription.mockRejectedValue(
      new RazorpayApiError({
        status: 500,
        code: 'SERVER_ERROR',
        description: 'down',
      })
    );
    const res = await call();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('provider_error');
    expect(body.error).toContain('HTTP 500 SERVER_ERROR: down');
    expect(db.markCancelRequested).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it('refuses a test-mode row on a server set up for live mode', async () => {
    state.deps = {
      db,
      client,
      config: makeConfig({ mode: 'live', keyId: 'rzp_live_unit000000' }),
    };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('mode_unavailable');
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown subscription', async () => {
    db.getSubscription.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('allows 5 attempts per 15 minutes, counted before the password check', async () => {
    state.passwordOk = false;
    for (let i = 0; i < 5; i++) expect((await call()).status).toBe(401);
    state.passwordOk = true;
    expect((await call()).status).toBe(429);
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('POST sync', () => {
  const call = () => sync(post(`/subscriptions/${SUB_ID}/sync`), ctx(SUB_ID));

  it('refreshes from Razorpay and audits', async () => {
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'active' })
    );
    client.listSubscriptionInvoices.mockResolvedValue({
      entity: 'collection',
      count: 0,
      items: [],
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      applied: 0,
      subscription: { id: SUB_ID },
    });
    expect(client.listSubscriptionInvoices).toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith(
      'billing_admin_audit',
      expect.objectContaining({
        p_actor: 'admin-1',
        p_note: expect.stringContaining('Synced from Razorpay'),
      })
    );
  });

  it('answers 404 and 409 without calling Razorpay', async () => {
    db.getSubscription.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);

    db.getSubscription.mockResolvedValueOnce(
      makeRow({
        id: SUB_ID,
        status: 'initiating',
        provider_subscription_id: null,
      })
    );
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('no_provider_id');
    expect(client.fetchSubscription).not.toHaveBeenCalled();
  });
});

describe('POST webhook retry', () => {
  const call = () =>
    retry(post(`/webhook-events/${EVT_ID}/retry`), ctx(EVT_ID));

  beforeEach(() => {
    state.tables.billing_webhook_events = [
      { id: EVT_ID, mode: 'test', status: 'dead', account_id: null },
    ];
  });

  it('re-queues with the operator and processes it from after()', async () => {
    state.rpc.mockResolvedValue({
      data: { outcome: 'requeued', id: EVT_ID, mode: 'test', account_id: null },
      error: null,
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'requeued', id: EVT_ID });
    expect(state.rpc).toHaveBeenCalledWith(
      'billing_admin_requeue_webhook_event',
      { p_id: EVT_ID, p_actor: 'admin-1' }
    );
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(events.store.claimWebhookEvents).toHaveBeenCalledWith(
      'test',
      1,
      EVT_ID
    );
  });

  it('refuses an event that is not failed or dead', async () => {
    state.rpc.mockResolvedValue({
      data: { outcome: 'not_retryable', status: 'processed' },
      error: null,
    });
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Only failed or dead events can be retried.',
      code: 'not_retryable',
    });
    expect(afterCallbacks).toHaveLength(0);
  });

  it('refuses an event from the other mode without touching it', async () => {
    state.tables.billing_webhook_events = [
      { id: EVT_ID, mode: 'live', status: 'dead', account_id: null },
    ];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('mode_unavailable');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown event', async () => {
    state.tables.billing_webhook_events = [];
    expect((await call()).status).toBe(404);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe('POST reconcile', () => {
  it('runs with scope admin and the operator, 3 per 10 minutes', async () => {
    const res = await reconcile(post('/reconcile'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      mode: 'test',
      errors: 0,
      subscriptions: { checked: 0 },
    });
    expect(events.store.startRun).toHaveBeenCalledWith(
      'test',
      'admin',
      'admin-1'
    );
    expect(state.deliver).toHaveBeenCalledWith(events.deps, { limit: 20 });

    expect((await reconcile(post('/reconcile'))).status).toBe(200);
    expect((await reconcile(post('/reconcile'))).status).toBe(200);
    expect((await reconcile(post('/reconcile'))).status).toBe(429);
    expect(events.store.startRun).toHaveBeenCalledTimes(3);
  });
});
