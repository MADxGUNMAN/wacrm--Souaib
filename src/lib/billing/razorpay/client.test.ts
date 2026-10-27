import { describe, expect, it, vi } from 'vitest';

import { RazorpayApiError, RazorpayClient } from './client';

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeClient(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = new RazorpayClient({
    keyId: 'rzp_test_abc',
    keySecret: 'shhh_secret',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
  });
  return { client, calls, sleep };
}

describe('RazorpayClient', () => {
  it('sends Basic auth and JSON, and returns the parsed body', async () => {
    const { client, calls } = makeClient([
      json(200, { id: 'sub_123', status: 'created' }),
    ]);
    const sub = await client.createSubscription({
      plan_id: 'plan_1',
      total_count: 12,
      customer_notify: 1,
    });
    expect(sub.id).toBe('sub_123');
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/subscriptions');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      'Basic ' + Buffer.from('rzp_test_abc:shhh_secret').toString('base64')
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      plan_id: 'plan_1',
      total_count: 12,
      customer_notify: 1,
    });
  });

  it('retries a GET on 429 and 5xx, honouring Retry-After', async () => {
    const { client, sleep } = makeClient([
      json(
        429,
        {
          error: {
            code: 'BAD_REQUEST_ERROR',
            description: 'Too many requests',
          },
        },
        { 'retry-after': '2' }
      ),
      json(502, {
        error: { code: 'SERVER_ERROR', description: 'bad gateway' },
      }),
      json(200, { id: 'sub_123' }),
    ]);
    await expect(client.fetchSubscription('sub_123')).resolves.toMatchObject({
      id: 'sub_123',
    });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0][0]).toBe(2000);
  });

  it('retries a POST only on 429, never on 5xx or a network failure', async () => {
    const rateLimited = makeClient([
      json(429, { error: { description: 'Too many requests' } }),
      json(200, { id: 'plan_1' }),
    ]);
    await expect(
      rateLimited.client.createPlan({
        period: 'daily',
        interval: 30,
        item: { name: 'x', amount: 1, currency: 'INR' },
      })
    ).resolves.toMatchObject({ id: 'plan_1' });

    const serverError = makeClient([
      json(500, { error: { code: 'SERVER_ERROR', description: 'oops' } }),
    ]);
    await expect(
      serverError.client.createPlan({
        period: 'daily',
        interval: 30,
        item: { name: 'x', amount: 1, currency: 'INR' },
      })
    ).rejects.toMatchObject({ status: 500 });
    expect(serverError.sleep).not.toHaveBeenCalled();

    const network = makeClient([new TypeError('fetch failed')]);
    await expect(
      network.client.cancelSubscription('sub_1', false)
    ).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(network.sleep).not.toHaveBeenCalled();
  });

  it('gives up after the retry budget', async () => {
    const { client, sleep } = makeClient([
      json(503, {}),
      json(503, {}),
      json(503, {}),
    ]);
    await expect(client.fetchPayment('pay_1')).rejects.toBeInstanceOf(
      RazorpayApiError
    );
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('recognises Razorpay "not found" and "already cancelled" 400s (seen in Phase 0)', async () => {
    const missing = makeClient([
      json(400, {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The ID provided is invalid or could not be found.',
        },
      }),
    ]);
    const err = await missing.client
      .fetchSubscription('sub_0000000000000X')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RazorpayApiError);
    expect((err as RazorpayApiError).isNotFound).toBe(true);
    expect((err as RazorpayApiError).isAlreadyInState).toBe(false);

    const twice = makeClient([
      json(400, {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Subscription is not cancellable in cancelled status.',
          field: 'status',
        },
      }),
    ]);
    const err2 = await twice.client
      .cancelSubscription('sub_1', false)
      .catch((e: unknown) => e);
    expect((err2 as RazorpayApiError).isAlreadyInState).toBe(true);
    expect((err2 as RazorpayApiError).field).toBe('status');
  });

  it('builds invoice list queries and encodes ids', async () => {
    const { client, calls } = makeClient([
      json(200, { entity: 'collection', count: 0, items: [] }),
      json(200, { id: 'x' }),
    ]);
    await client.listSubscriptionInvoices('sub_TqQrSZl9fuHjgT', { count: 10 });
    expect(calls[0].url).toBe(
      'https://api.razorpay.com/v1/invoices?subscription_id=sub_TqQrSZl9fuHjgT&count=10'
    );
    await client.fetchPayment('pay_1/../x');
    // Path segment encoded; card details expanded inline (one call).
    expect(calls[1].url).toBe(
      'https://api.razorpay.com/v1/payments/pay_1%2F..%2Fx?expand%5B%5D=card'
    );
  });

  it('updates payment notes with a PATCH carrying only notes', async () => {
    const { client, calls } = makeClient([
      json(200, { id: 'pay_123', notes: { product: 'Replai' } }),
    ]);
    await client.updatePaymentNotes('pay_123', { product: 'Replai' });
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/payments/pay_123');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      notes: { product: 'Replai' },
    });
  });

  it('retries a notes PATCH on 429 but not on a 5xx', async () => {
    const limited = makeClient([
      json(429, { error: { description: 'Too many requests' } }),
      json(200, { id: 'pay_1' }),
    ]);
    await expect(
      limited.client.updatePaymentNotes('pay_1', { product: 'Replai' })
    ).resolves.toMatchObject({ id: 'pay_1' });

    const broken = makeClient([
      json(500, { error: { code: 'SERVER_ERROR', description: 'oops' } }),
    ]);
    await expect(
      broken.client.updatePaymentNotes('pay_1', { product: 'Replai' })
    ).rejects.toMatchObject({ status: 500 });
    expect(broken.sleep).not.toHaveBeenCalled();
  });

  it('never includes the secret in an error message', async () => {
    const { client } = makeClient([
      json(401, {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Authentication failed',
        },
      }),
    ]);
    const err = await client.fetchPlan('plan_1').catch((e: unknown) => e);
    expect(String(err)).not.toContain('shhh_secret');
  });
});
