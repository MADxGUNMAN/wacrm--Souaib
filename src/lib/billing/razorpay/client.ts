// ============================================================
// Razorpay REST client — SERVER ONLY.
//
// A typed fetch wrapper for the dozen endpoints billing needs, instead of
// the `razorpay` SDK, so request shapes stay explicit and there is no new
// dependency (plan section 7.1).
//
// Behaviour learned in Phase 0 (docs/razopay/phase-0-razorpay-setup-report.md):
//   - Razorpay answers 429 after a short burst of requests. GETs retry on
//     429/5xx/network errors with backoff; POSTs retry ONLY on 429, which
//     means the request was rejected before processing.
//   - An unknown id is a 400 "The ID provided is invalid or could not be
//     found", not a 404. `isNotFound` recognises both.
//   - Cancelling an already-cancelled subscription is a 400 "not
//     cancellable in cancelled status". `isAlreadyInState` recognises it
//     so cancel paths can stay idempotent.
// The key secret is only ever placed in the Authorization header.
// ============================================================

import type {
  RazorpayCard,
  RazorpayCollection,
  RazorpayDispute,
  RazorpayInvoice,
  RazorpayPayment,
  RazorpayPeriod,
  RazorpayPlan,
  RazorpayRefund,
  RazorpaySubscription,
} from './types';

const BASE_URL = 'https://api.razorpay.com/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

export class RazorpayApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly field: string | null;
  readonly reason: string | null;
  constructor(input: {
    status: number;
    code?: string | null;
    description?: string | null;
    field?: string | null;
    reason?: string | null;
  }) {
    super(input.description || `Razorpay request failed (${input.status})`);
    this.name = 'RazorpayApiError';
    this.status = input.status;
    this.code = input.code ?? null;
    this.field = input.field ?? null;
    this.reason = input.reason ?? null;
  }

  get isNotFound(): boolean {
    return (
      this.status === 404 ||
      (this.status === 400 &&
        /could not be found|does not exist/i.test(this.message))
    );
  }

  /** e.g. "Subscription is not cancellable in cancelled status." */
  get isAlreadyInState(): boolean {
    return (
      this.status === 400 &&
      /not cancellable in (cancelled|completed|expired) status/i.test(
        this.message
      )
    );
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

export interface RazorpayClientOptions {
  keyId: string;
  keySecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Max retries after the first attempt. */
  retries?: number;
  /** Injected for tests so backoff does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

type Query = Record<string, string | number | undefined>;

export class RazorpayClient {
  readonly #auth: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(opts: RazorpayClientOptions) {
    this.#auth =
      'Basic ' +
      Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString('base64');
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#retries = opts.retries ?? 2;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    query?: Query
  ): Promise<T> {
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));

    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.#fetch(url, {
          method,
          headers: {
            Authorization: this.#auth,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.#timeoutMs),
          cache: 'no-store',
        });
      } catch (err) {
        // Network failure or timeout. A POST may or may not have been
        // processed, so only GETs are retried here.
        const apiErr = new RazorpayApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          description:
            err instanceof Error
              ? `Could not reach Razorpay: ${err.name}`
              : 'Could not reach Razorpay',
        });
        if (method === 'GET' && attempt < this.#retries) {
          await this.#sleep(this.#backoff(attempt, null));
          attempt += 1;
          continue;
        }
        throw apiErr;
      }

      if (res.ok) return (await res.json()) as T;

      const payload = (await res.json().catch(() => null)) as {
        error?: Record<string, string | null>;
      } | null;
      const e = payload?.error ?? {};
      const apiErr = new RazorpayApiError({
        status: res.status,
        code: e.code ?? null,
        description: e.description ?? null,
        field: e.field ?? null,
        reason: e.reason ?? null,
      });
      const retryable =
        res.status === 429 || (method === 'GET' && res.status >= 500);
      if (retryable && attempt < this.#retries) {
        await this.#sleep(
          this.#backoff(attempt, res.headers.get('retry-after'))
        );
        attempt += 1;
        continue;
      }
      throw apiErr;
    }
  }

  #backoff(attempt: number, retryAfter: string | null): number {
    const header = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(header) && header > 0)
      return Math.min(header * 1000, 10_000);
    const base = 500 * 2 ** attempt;
    return base + Math.floor(Math.random() * 250);
  }

  // ---- Plans ----
  createPlan(input: {
    period: RazorpayPeriod;
    interval: number;
    item: {
      name: string;
      amount: number;
      currency: string;
      description?: string;
    };
    notes?: Record<string, string>;
  }): Promise<RazorpayPlan> {
    return this.request('POST', '/plans', input);
  }

  fetchPlan(id: string): Promise<RazorpayPlan> {
    return this.request('GET', `/plans/${encodeURIComponent(id)}`);
  }

  // ---- Subscriptions ----
  createSubscription(input: {
    plan_id: string;
    total_count: number;
    quantity?: number;
    start_at?: number;
    expire_by?: number;
    customer_notify?: 0 | 1;
    notes?: Record<string, string>;
  }): Promise<RazorpaySubscription> {
    return this.request('POST', '/subscriptions', input);
  }

  fetchSubscription(id: string): Promise<RazorpaySubscription> {
    return this.request('GET', `/subscriptions/${encodeURIComponent(id)}`);
  }

  cancelSubscription(
    id: string,
    atCycleEnd: boolean
  ): Promise<RazorpaySubscription> {
    return this.request(
      'POST',
      `/subscriptions/${encodeURIComponent(id)}/cancel`,
      {
        cancel_at_cycle_end: atCycleEnd ? 1 : 0,
      }
    );
  }

  listSubscriptions(query: {
    plan_id?: string;
    from?: number;
    to?: number;
    count?: number;
    skip?: number;
  }): Promise<RazorpayCollection<RazorpaySubscription>> {
    return this.request('GET', '/subscriptions', undefined, query);
  }

  // ---- Invoices ----
  listSubscriptionInvoices(
    subscriptionId: string,
    query: { count?: number; skip?: number } = {}
  ): Promise<RazorpayCollection<RazorpayInvoice>> {
    return this.request('GET', '/invoices', undefined, {
      subscription_id: subscriptionId,
      ...query,
    });
  }

  fetchInvoice(id: string): Promise<RazorpayInvoice> {
    return this.request('GET', `/invoices/${encodeURIComponent(id)}`);
  }

  // ---- Payments ----
  /** `expand[]=card` returns network/type/last4 inline (no extra call). */
  fetchPayment(id: string): Promise<RazorpayPayment> {
    return this.request(
      'GET',
      `/payments/${encodeURIComponent(id)}`,
      undefined,
      {
        'expand[]': 'card',
      }
    );
  }

  /**
   * Update a Payment: Razorpay accepts only `notes` here (the description
   * is fixed once paid). The notes object is replaced as a whole, so
   * callers send the merged set. Not retried on 5xx, like a POST.
   */
  updatePaymentNotes(
    id: string,
    notes: Record<string, string>
  ): Promise<RazorpayPayment> {
    return this.request('PATCH', `/payments/${encodeURIComponent(id)}`, {
      notes,
    });
  }

  fetchPaymentCard(id: string): Promise<RazorpayCard> {
    return this.request('GET', `/payments/${encodeURIComponent(id)}/card`);
  }

  // ---- Refunds and disputes (created in the Dashboard; read here) ----
  fetchRefund(id: string): Promise<RazorpayRefund> {
    return this.request('GET', `/refunds/${encodeURIComponent(id)}`);
  }

  fetchDispute(id: string): Promise<RazorpayDispute> {
    return this.request('GET', `/disputes/${encodeURIComponent(id)}`);
  }
}
