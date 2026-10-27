import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real config parsing for getRazorpayConfig() in the status route.
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

const h = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'member',
  accountId: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
  deps: null as unknown,
  state: null as unknown,
  pending: null as { id: string; status: string } | null,
  pendingLookups: [] as string[],
  checkoutDescription: null as string | null,
  // Localized pricing: what the server resolves for this workspace.
  pricing: {
    region: 'global',
    currency: 'INR',
    countryCode: null as string | null,
    source: 'fallback',
    reason: 'default',
  },
  ensurePlanQuotes: [] as Record<string, unknown>[],
}));
// The US catalogue used by the localized pricing cases.
const US_CYCLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
vi.mock('@/lib/billing/pricing/region-store', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/pricing/region-store')>()),
  getAccountPricingRegion: async () => h.pricing,
}));

// after() needs a live request scope; collect the callbacks instead.
const afterCallbacks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => ({}),
  MissingServerConfigError: class extends Error {},
}));

vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  getCurrentAccount: async () => ({
    accountId: h.accountId,
    userId: 'user-1',
    role: h.role,
    account: { id: h.accountId, name: 'Demo' },
  }),
}));

vi.mock('@/lib/subscription/guard', async (orig) => {
  const real = await orig<typeof import('@/lib/subscription/guard')>();
  const ctx = () => ({
    accountId: h.accountId,
    userId: 'user-1',
    role: h.role,
    account: { id: h.accountId, name: 'Demo' },
  });
  const ownerOnly = () => {
    if (h.role !== 'owner') {
      throw new real.BillingAccessError(
        'owner_only',
        'Only the workspace owner can manage the subscription'
      );
    }
  };
  return {
    ...real,
    requireBillingOwner: async () => {
      ownerOnly();
      return ctx();
    },
    requireBillingOwnerWithState: async () => {
      ownerOnly();
      return { ctx: ctx(), state: h.state };
    },
  };
});

vi.mock('@/lib/subscription/queries', async (orig) => {
  const real = await orig<typeof import('@/lib/subscription/queries')>();
  const { QUOTE } =
    await import('@/lib/billing/razorpay/__fixtures__/factories');
  return {
    ...real,
    getSubscriptionSettings: async () => ({
      payment_provider: 'manual_upi',
      razorpay_checkout_name: 'Replai',
      razorpay_checkout_description: h.checkoutDescription,
      autopay_consent_template: null,
      autopay_defer_summary_template: null,
      autopay_immediate_summary_template: null,
    }),
    getRegionSettings: async (_region: string, currency: string) => ({
      payment_provider: 'manual_upi',
      razorpay_checkout_name: 'Replai',
      razorpay_checkout_description: h.checkoutDescription,
      autopay_consent_template: null,
      autopay_defer_summary_template: null,
      autopay_immediate_summary_template: null,
      currency,
    }),
    // Mirrors the real region rule: a cycle prices only in its own region.
    resolveQuote: async (
      _planId: string,
      cycleId: string,
      pricing?: { region: string; currency: string }
    ) => {
      const region = pricing?.region ?? 'global';
      const cycleRegion =
        cycleId === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' ? 'US' : 'global';
      if (cycleRegion !== region) {
        throw new real.QuoteError(real.REGION_MISMATCH_MESSAGE);
      }
      return region === 'US'
        ? {
            ...QUOTE,
            cycleId,
            amount: 60,
            currency: pricing!.currency,
            region: 'US',
          }
        : { ...QUOTE, region: 'global' };
    },
    getPendingPaymentRequest: async (accountId: string) => {
      h.pendingLookups.push(accountId);
      return h.pending;
    },
  };
});

vi.mock('@/lib/billing/razorpay/plans', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay/plans')>()),
  ensureProviderPlan: async (input: { quote: Record<string, unknown> }) => {
    h.ensurePlanQuotes.push(input.quote);
    return {
      id: 'pp-1',
      provider_plan_id: 'plan_Unit000001',
    };
  },
}));

vi.mock('@/lib/billing/razorpay/runtime', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay/runtime')>()),
  getBillingDeps: () => h.deps,
}));

import { resolveSubscriptionState } from '@/lib/subscription/status';
import { __resetRateLimitForTests } from '@/lib/rate-limit';
import {
  KEY_SECRET,
  OTHER_ACCOUNT_ID,
  QUOTE,
  makeClient,
  makeConfig,
  makeDb,
  makeRazorpaySubscription,
  makeRow,
} from '@/lib/billing/razorpay/__fixtures__/factories';
import { signCheckout } from '@/lib/billing/razorpay/signature';
import { GET as preview, POST as checkout } from './checkout/route';
import { POST as cancel } from './cancel/route';
import { POST as paymentMethod } from './payment-method/route';
import { GET as status } from './status/route';
import { POST as verify } from './verify/route';

const ORIGIN = 'https://app.test';
const IDS = { planId: QUOTE.planId, cycleId: QUOTE.cycleId };

function post(path: string, body: unknown, origin: string | null = ORIGIN) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'app.test',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

let db: ReturnType<typeof makeDb>;
let client: ReturnType<typeof makeClient>;

beforeEach(() => {
  __resetRateLimitForTests();
  h.role = 'owner';
  h.accountId = 'c1db92d7-7ae4-44ac-aae7-b62e152b0341';
  h.pending = null;
  h.pendingLookups = [];
  h.checkoutDescription = null;
  h.pricing = {
    region: 'global',
    currency: 'INR',
    countryCode: null,
    source: 'fallback',
    reason: 'default',
  };
  h.ensurePlanQuotes = [];
  h.state = resolveSubscriptionState(
    {
      subscription_status: 'trialing',
      trial_ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    },
    { is_enabled: true, grace_days: 0 }
  );
  db = makeDb();
  client = makeClient();
  h.deps = { db, client, config: makeConfig() };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/billing/razorpay/checkout', () => {
  it('refuses a cross-site request before reading the session', async () => {
    const res = await checkout(
      post('/api/billing/razorpay/checkout', IDS, 'https://evil.test')
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('bad_origin');
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });

  it('refuses a request with no Origin header', async () => {
    const res = await checkout(
      post('/api/billing/razorpay/checkout', IDS, null)
    );
    expect(res.status).toBe(403);
  });

  it('refuses a member: only the owner can buy', async () => {
    h.role = 'member';
    const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('owner_only');
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });

  it('refuses an account that is not on the test allowlist', async () => {
    h.accountId = OTHER_ACCOUNT_ID;
    const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('provider_unavailable');
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed ids', async () => {
    const res = await checkout(
      post('/api/billing/razorpay/checkout', {
        planId: 'x',
        cycleId: QUOTE.cycleId,
      })
    );
    expect(res.status).toBe(400);
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });

  it('ignores anything else the browser sends: account, amount and dates come from the server', async () => {
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: makeRow({
        status: 'initiating',
        provider_subscription_id: null,
      }),
    });
    client.createSubscription.mockResolvedValue(makeRazorpaySubscription());
    db.attachProviderSubscription.mockResolvedValue({
      outcome: 'attached',
      subscription: makeRow(),
    });

    const res = await checkout(
      post('/api/billing/razorpay/checkout', {
        ...IDS,
        accountId: OTHER_ACCOUNT_ID,
        amount: 1,
        start_at: 0,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      keyId: 'rzp_test_unit0000000000',
      subscriptionId: 'sub_Unit000001',
      reused: false,
      checkout: {
        name: 'Replai',
        prefill: { name: 'Demo Owner', email: 'owner@example.com' },
      },
    });
    expect(db.claimCheckout.mock.calls[0][0]).toMatchObject({
      account_id: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
      amount_minor: 99000,
      created_by: 'user-1',
    });
    const params = client.createSubscription.mock.calls[0][0];
    expect(params).not.toHaveProperty('amount');
    expect(params.start_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  describe('payment details passed to Checkout', () => {
    async function start() {
      db.claimCheckout.mockResolvedValue({
        outcome: 'claimed',
        subscription: makeRow({
          status: 'initiating',
          provider_subscription_id: null,
        }),
      });
      client.createSubscription.mockResolvedValue(makeRazorpaySubscription());
      db.attachProviderSubscription.mockResolvedValue({
        outcome: 'attached',
        subscription: makeRow(),
      });
      const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
      expect(res.status).toBe(200);
      return (await res.json()).checkout;
    }

    it('names the plan and cycle when no description is set', async () => {
      expect((await start()).description).toBe(
        'Replai plan · Monthly · AutoPay'
      );
    });

    it('ignores the legacy "Replai subscription" default', async () => {
      h.checkoutDescription = 'Replai subscription';
      expect((await start()).description).toBe(
        'Replai plan · Monthly · AutoPay'
      );
    });

    it('keeps a custom description as a prefix', async () => {
      h.checkoutDescription = 'Acme Ltd';
      expect((await start()).description).toBe(
        'Acme Ltd · Replai plan · Monthly · AutoPay'
      );
    });

    it('sends our payment notes for the setup check of a deferred start', async () => {
      const notes = (await start()).notes;
      expect(notes).toMatchObject({
        product: 'Replai',
        workspace: 'Demo',
        account_id: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
        plan: 'Replai',
        billing_cycle: 'Monthly',
        charge_type: 'card_verification',
        subscription_id: 'sub_Unit000001',
        env: 'dev',
        mode: 'test',
      });
      expect(notes).not.toHaveProperty('period_start');
      expect(notes).not.toHaveProperty('invoice_id');
    });

    it('prefills the owner phone when one is stored', async () => {
      db.getContact.mockResolvedValue({
        name: 'Demo Owner',
        email: 'owner@example.com',
        phone: '+919876543210',
      });
      expect((await start()).prefill).toEqual({
        name: 'Demo Owner',
        email: 'owner@example.com',
        contact: '+919876543210',
      });
    });

    it.each([null, 'not a phone'])(
      'leaves contact out when the stored phone is %s',
      async (phone) => {
        db.getContact.mockResolvedValue({
          name: 'Demo Owner',
          email: 'owner@example.com',
          phone,
        });
        const prefill = (await start()).prefill;
        expect(prefill).not.toHaveProperty('contact');
      }
    );
  });
});

describe('localized pricing at checkout', () => {
  const US_PRICING = {
    region: 'US',
    currency: 'USD',
    countryCode: 'US',
    source: 'phone',
    reason: 'phone_match',
  };
  function claimOk() {
    db.claimCheckout.mockResolvedValue({
      outcome: 'claimed',
      subscription: makeRow({
        status: 'initiating',
        provider_subscription_id: null,
      }),
    });
    client.createSubscription.mockResolvedValue(makeRazorpaySubscription());
    db.attachProviderSubscription.mockResolvedValue({
      outcome: 'attached',
      subscription: makeRow(),
    });
  }

  it('charges a US owner the US price in USD, minor units, with a US plan', async () => {
    h.pricing = US_PRICING;
    claimOk();
    const res = await checkout(
      post('/api/billing/razorpay/checkout', {
        planId: QUOTE.planId,
        cycleId: US_CYCLE,
        // Ignored: currency and amount always come from the server.
        currency: 'INR',
        amount: 1,
      })
    );
    expect(res.status).toBe(200);
    expect(db.claimCheckout.mock.calls[0][0]).toMatchObject({
      cycle_id: US_CYCLE,
      amount_minor: 6000,
      currency: 'USD',
    });
    expect(h.ensurePlanQuotes).toEqual([
      expect.objectContaining({ region: 'US', currency: 'USD', amount: 60 }),
    ]);
    expect((await res.json()).display).toMatchObject({
      currency: 'USD',
      amountMinor: 6000,
    });
  });

  it('refuses a Global cycle id from a US owner', async () => {
    h.pricing = US_PRICING;
    const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(
      'not available for your workspace'
    );
    expect(db.claimCheckout).not.toHaveBeenCalled();
  });

  it('keeps a Global owner on INR 990 (99000 paise)', async () => {
    claimOk();
    const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
    expect(res.status).toBe(200);
    expect(db.claimCheckout.mock.calls[0][0]).toMatchObject({
      amount_minor: 99000,
      currency: 'INR',
    });
    expect(h.ensurePlanQuotes[0]).toMatchObject({ region: 'global' });
  });

  it('previews USD for a US owner', async () => {
    h.pricing = US_PRICING;
    const res = await preview(
      new Request(
        `${ORIGIN}/api/billing/razorpay/checkout?planId=${QUOTE.planId}&cycleId=${US_CYCLE}`
      )
    );
    expect(res.status).toBe(200);
    const { display } = await res.json();
    expect(display).toMatchObject({ currency: 'USD', amount: 60 });
    expect(display.verificationNote).not.toContain('₹');
  });
});

describe('GET /api/billing/razorpay/checkout (preview)', () => {
  it('returns the summary and consent without creating anything', async () => {
    const res = await preview(
      new Request(
        `${ORIGIN}/api/billing/razorpay/checkout?planId=${QUOTE.planId}&cycleId=${QUOTE.cycleId}`
      )
    );
    expect(res.status).toBe(200);
    const { display } = await res.json();
    expect(display.mode).toBe('authorise');
    expect(display.consent).toContain('I authorise Replai');
    expect(db.claimCheckout).not.toHaveBeenCalled();
    expect(client.createSubscription).not.toHaveBeenCalled();
  });

  it('refuses the preview while a manual UPI payment is under review (Phase 6)', async () => {
    h.pending = { id: 'pr-1', status: 'pending' };
    const res = await preview(
      new Request(
        `${ORIGIN}/api/billing/razorpay/checkout?planId=${QUOTE.planId}&cycleId=${QUOTE.cycleId}`
      )
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('manual_payment_pending');
    expect(body.error).toContain('still being reviewed');
    expect(h.pendingLookups).toEqual([h.accountId]);
  });
});

describe('Phase 6: checkout refuses an account with a pending manual UPI payment', () => {
  it('POST answers 409 before any claim or Razorpay call', async () => {
    h.pending = { id: 'pr-1', status: 'pending' };
    const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('manual_payment_pending');
    expect(h.pendingLookups).toEqual([h.accountId]);
    expect(db.claimCheckout).not.toHaveBeenCalled();
    expect(client.createSubscription).not.toHaveBeenCalled();
  });

  it('the provider check still comes first for a non-allowlisted account', async () => {
    h.accountId = OTHER_ACCOUNT_ID;
    h.pending = { id: 'pr-1', status: 'pending' };
    const res = await checkout(post('/api/billing/razorpay/checkout', IDS));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('provider_unavailable');
    expect(h.pendingLookups).toEqual([]);
  });
});

describe('POST /api/billing/razorpay/verify', () => {
  const paymentId = 'pay_Unit000001';

  it('refuses a cross-site request', async () => {
    const res = await verify(
      post('/api/billing/razorpay/verify', {}, 'https://evil.test')
    );
    expect(res.status).toBe(403);
  });

  it('refuses a member', async () => {
    h.role = 'member';
    const res = await verify(post('/api/billing/razorpay/verify', {}));
    expect(res.status).toBe(403);
  });

  it('rejects a forged signature and grants nothing', async () => {
    db.getLatestSubscription.mockResolvedValue(makeRow());
    const res = await verify(
      post('/api/billing/razorpay/verify', {
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: 'sub_Unit000001',
        razorpay_signature: signCheckout(
          paymentId,
          'sub_Unit000001',
          'not_the_key_secret_at_all'
        ),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_signature');
    expect(db.applyPayment).not.toHaveBeenCalled();
  });

  it('accepts a valid signature and reports the server-side outcome', async () => {
    db.getLatestSubscription.mockResolvedValue(makeRow());
    db.getSubscription.mockResolvedValue(makeRow({ status: 'authenticated' }));
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'authenticated' })
    );
    const { makeRazorpayPayment } =
      await import('@/lib/billing/razorpay/__fixtures__/factories');
    client.fetchPayment.mockResolvedValue(
      makeRazorpayPayment({ amount: 500, invoice_id: null })
    );
    db.applyPayment.mockResolvedValue({ outcome: 'recorded' });

    const res = await verify(
      post('/api/billing/razorpay/verify', {
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: 'sub_Unit000001',
        razorpay_signature: signCheckout(
          paymentId,
          'sub_Unit000001',
          KEY_SECRET
        ),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentOutcome).toBe('recorded');
    expect(body.autopay).toMatchObject({
      status: 'authenticated',
      hasMandate: true,
    });
  });
});

describe('GET /api/billing/razorpay/status', () => {
  it('answers from the database when it synced recently (no Razorpay call)', async () => {
    db.getLatestSubscription.mockResolvedValue(
      makeRow({
        status: 'authenticated',
        last_synced_at: new Date().toISOString(),
      })
    );
    const res = await status();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stale).toBe(false);
    expect(body.autopay.status).toBe('authenticated');
    expect(client.fetchSubscription).not.toHaveBeenCalled();
  });

  it('still answers, flagged stale, when Razorpay cannot be reached', async () => {
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'created', last_synced_at: null })
    );
    client.fetchSubscription.mockRejectedValue(new Error('network down'));
    const res = await status();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stale).toBe(true);
    expect(body.autopay.display.key).toBe('checkout_incomplete');
  });

  it('is readable by members', async () => {
    h.role = 'member';
    const res = await status();
    expect(res.status).toBe(200);
    expect((await res.json()).autopay).toBeNull();
  });
});

describe('POST /api/billing/razorpay/cancel', () => {
  it('refuses a cross-site request and a member', async () => {
    expect(
      (
        await cancel(
          post(
            '/api/billing/razorpay/cancel',
            { confirm: true },
            'https://evil.test'
          )
        )
      ).status
    ).toBe(403);
    h.role = 'member';
    const res = await cancel(
      post('/api/billing/razorpay/cancel', { confirm: true })
    );
    expect(res.status).toBe(403);
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('needs { confirm: true }', async () => {
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'authenticated' })
    );
    const res = await cancel(post('/api/billing/razorpay/cancel', {}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('confirmation_required');
    expect(client.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancels at Razorpay and returns the refreshed AutoPay state', async () => {
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'authenticated' })
    );
    db.getSubscription.mockResolvedValue(makeRow({ status: 'cancelled' }));
    client.cancelSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );
    client.fetchSubscription.mockResolvedValue(
      makeRazorpaySubscription({ status: 'cancelled' })
    );

    const res = await cancel(
      post('/api/billing/razorpay/cancel', { confirm: true })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      synced: true,
      autopay: { status: 'cancelled', hasMandate: false },
    });
    expect(client.cancelSubscription).toHaveBeenCalledWith(
      'sub_Unit000001',
      false
    );
    expect(db.markCancelRequested).toHaveBeenCalledWith('row-1', 'customer');
  });

  it('is limited to 5 per hour per workspace', async () => {
    db.getLatestSubscription.mockResolvedValue(null);
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await cancel(post('/api/billing/razorpay/cancel', { confirm: true })))
          .status
      ).toBe(409);
    }
    expect(
      (await cancel(post('/api/billing/razorpay/cancel', { confirm: true })))
        .status
    ).toBe(429);
  });
});

describe('POST /api/billing/razorpay/payment-method', () => {
  it('returns Checkout options for a card change, and changes nothing itself', async () => {
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'active', payment_method: 'card' })
    );
    const res = await paymentMethod(
      post('/api/billing/razorpay/payment-method', {})
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      action: 'card_change',
      keyId: 'rzp_test_unit0000000000',
      subscriptionId: 'sub_Unit000001',
      checkout: {
        name: 'Replai',
        description: 'Replai · Update AutoPay card',
        notes: {
          product: 'Replai',
          charge_type: 'card_verification',
          subscription_id: 'sub_Unit000001',
          plan: 'Replai',
          billing_cycle: 'Monthly',
        },
        prefill: { email: 'owner@example.com' },
      },
    });
    expect(client.cancelSubscription).not.toHaveBeenCalled();
    expect(db.applySubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it('prefills the owner phone for a card change only when it is valid', async () => {
    db.getLatestSubscription.mockResolvedValue(
      makeRow({ status: 'active', payment_method: 'card' })
    );
    db.getContact.mockResolvedValue({
      name: 'Demo Owner',
      email: 'owner@example.com',
      phone: '919876543210',
    });
    const body = await (
      await paymentMethod(post('/api/billing/razorpay/payment-method', {}))
    ).json();
    expect(body.checkout.prefill.contact).toBe('+919876543210');
  });

  it('refuses a member', async () => {
    h.role = 'member';
    expect(
      (await paymentMethod(post('/api/billing/razorpay/payment-method', {})))
        .status
    ).toBe(403);
  });
});
