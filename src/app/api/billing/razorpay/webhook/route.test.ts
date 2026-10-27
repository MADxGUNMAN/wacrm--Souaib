import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: unknown[]) => unknown>;

const WEBHOOK_SECRET = 'w'.repeat(64);

vi.hoisted(() => {
  Object.assign(process.env, {
    RAZORPAY_MODE: 'test',
    BILLING_ENV: 'dev',
    RAZORPAY_KEY_ID: 'rzp_test_unit0000000000',
    RAZORPAY_KEY_SECRET: 'test_secret_0123456789abcdef',
    RAZORPAY_WEBHOOK_SECRET: 'w'.repeat(64),
    RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
    AUTOMATION_CRON_SECRET: 'c'.repeat(64),
  });
});

const h = vi.hoisted(() => ({
  after: [] as (() => Promise<unknown> | unknown)[],
  insert: null as unknown as AnyMock,
  process: null as unknown as AnyMock,
  deliver: null as unknown as AnyMock,
  reconcile: null as unknown as AnyMock,
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (cb: () => unknown) => {
    h.after.push(cb);
  },
}));

vi.mock('@/lib/billing/razorpay/store', () => ({
  createBillingStore: () => ({
    insertWebhookEvent: (...a: unknown[]) => h.insert(...a),
  }),
}));

vi.mock('@/lib/billing/razorpay/jobs', () => ({
  getEventDeps: () => ({ fake: true }),
  deliverBillingEmails: (...a: unknown[]) => h.deliver(...a),
}));

vi.mock('@/lib/billing/razorpay/events', () => ({
  processDueWebhookEvents: (...a: unknown[]) => h.process(...a),
}));

vi.mock('@/lib/billing/razorpay/reconcile', () => ({
  runReconciliation: (...a: unknown[]) => h.reconcile(...a),
}));

import { signWebhook } from '@/lib/billing/razorpay/signature';
import { GET as cron } from '../../cron/route';
import { POST as webhook } from './route';

const BODY = JSON.stringify({
  entity: 'event',
  account_id: 'acc_Merchant0001',
  event: 'subscription.authenticated',
  contains: ['subscription'],
  created_at: 1792562755,
  payload: {
    subscription: {
      entity: { id: 'sub_TqTtwUDRjijZys', status: 'authenticated' },
    },
  },
});

function req(body: string, headers: Record<string, string> = {}) {
  return new Request(
    'https://devcrm.example.com/api/billing/razorpay/webhook',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    }
  );
}

beforeEach(() => {
  h.after = [];
  h.insert = vi.fn(async () => ({ id: 'evt-row-1' }));
  h.process = vi.fn(async () => ({ claimed: 1 }));
  h.deliver = vi.fn(async () => ({ sent: 0 }));
  h.reconcile = vi.fn(async () => ({
    events: {},
    subscriptions: {},
    notifications: null,
    purged: null,
    errors: [],
  }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/billing/razorpay/webhook', () => {
  it('rejects a missing or wrong signature with 400 and stores nothing', async () => {
    for (const sig of [
      undefined,
      'f'.repeat(64),
      signWebhook(BODY, 'another_secret_value_123'),
    ]) {
      const res = await webhook(
        req(BODY, sig ? { 'x-razorpay-signature': sig } : {})
      );
      expect(res.status).toBe(400);
    }
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.after).toHaveLength(0);
  });

  it('verifies the exact bytes: a re-serialised body fails', async () => {
    const sig = signWebhook(BODY, WEBHOOK_SECRET);
    const reformatted = JSON.stringify(JSON.parse(BODY), null, 2);
    const res = await webhook(
      req(reformatted, { 'x-razorpay-signature': sig })
    );
    expect(res.status).toBe(400);
  });

  it('stores a verified event, answers 200, and processes it after the response', async () => {
    const res = await webhook(
      req(BODY, {
        'x-razorpay-signature': signWebhook(BODY, WEBHOOK_SECRET),
        'x-razorpay-event-id': 'evt_Unit0000001',
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: false });
    expect(h.insert).toHaveBeenCalledWith({
      mode: 'test',
      provider_event_id: 'evt_Unit0000001',
      event_type: 'subscription.authenticated',
      entity_ids: { subscription: 'sub_TqTtwUDRjijZys' },
      provider_created_at: new Date(1792562755 * 1000).toISOString(),
      payload: JSON.parse(BODY),
    });
    // Nothing processed inside the request.
    expect(h.process).not.toHaveBeenCalled();
    expect(h.after).toHaveLength(1);
    await h.after[0]();
    expect(h.process).toHaveBeenCalledWith(
      { fake: true },
      { limit: 1, id: 'evt-row-1' }
    );
    expect(h.deliver).toHaveBeenCalled();
  });

  it('answers 200 to a redelivery without processing it again', async () => {
    h.insert.mockResolvedValue(null);
    const res = await webhook(
      req(BODY, {
        'x-razorpay-signature': signWebhook(BODY, WEBHOOK_SECRET),
        'x-razorpay-event-id': 'evt_Unit0000001',
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(h.after).toHaveLength(0);
  });

  it('falls back to a body hash when the event id header is missing or odd', async () => {
    await webhook(
      req(BODY, {
        'x-razorpay-signature': signWebhook(BODY, WEBHOOK_SECRET),
        'x-razorpay-event-id': 'x',
      })
    );
    expect(
      (h.insert.mock.calls[0][0] as { provider_event_id: string })
        .provider_event_id
    ).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('rejects a signed body that is not an event', async () => {
    const body = '{"hello":"world"}';
    const res = await webhook(
      req(body, { 'x-razorpay-signature': signWebhook(body, WEBHOOK_SECRET) })
    );
    expect(res.status).toBe(400);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('answers 500 when the event cannot be stored, so Razorpay retries', async () => {
    h.insert.mockRejectedValue(new Error('db down'));
    const res = await webhook(
      req(BODY, { 'x-razorpay-signature': signWebhook(BODY, WEBHOOK_SECRET) })
    );
    expect(res.status).toBe(500);
  });

  it('refuses oversized bodies before verifying', async () => {
    const res = await webhook(
      req(BODY, { 'content-length': String(1024 * 1024) })
    );
    expect(res.status).toBe(413);
  });
});

describe('GET /api/billing/cron', () => {
  const cronReq = (secret?: string) =>
    new Request('http://localhost:3000/api/billing/cron', {
      headers: secret ? { 'x-cron-secret': secret } : {},
    });

  it('requires the cron secret', async () => {
    expect((await cron(cronReq())).status).toBe(401);
    expect((await cron(cronReq('c'.repeat(63)))).status).toBe(401);
    expect(h.reconcile).not.toHaveBeenCalled();
  });

  it('runs reconciliation and returns counts for cron.log', async () => {
    const res = await cron(cronReq('c'.repeat(64)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ mode: 'test', errors: 0 });
    expect(h.reconcile).toHaveBeenCalledTimes(1);
  });
});
