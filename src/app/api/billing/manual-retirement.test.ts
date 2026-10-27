import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Razorpay Phase 6: the manual UPI routes answer 410 once the account's
// purchase flow is Razorpay AutoPay, and keep working everywhere else.
// Real config parsing (getRazorpayConfig reads process.env per call), so
// each case sets the env it describes.

const DEMO = 'c1db92d7-7ae4-44ac-aae7-b62e152b0341';
const OTHER = '11111111-1111-4111-8111-111111111111';

const TEST_ENV = {
  RAZORPAY_MODE: 'test',
  BILLING_ENV: 'dev',
  RAZORPAY_KEY_ID: 'rzp_test_unit0000000000',
  RAZORPAY_KEY_SECRET: 'test_secret_0123456789abcdef',
  RAZORPAY_WEBHOOK_SECRET: 'w'.repeat(64),
  RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS: DEMO,
  BILLING_PROVIDER_OVERRIDE: '',
};

const h = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'member',
  accountId: 'c1db92d7-7ae4-44ac-aae7-b62e152b0341',
  fromTables: [] as string[],
  settingsReads: 0,
  quoteCalls: 0,
  pricing: { region: 'global', currency: 'INR' } as {
    region: string;
    currency: string;
  },
  qrGenerated: 0,
}));
vi.mock('@/lib/billing/pricing/region-store', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/pricing/region-store')>()),
  getAccountPricingRegion: async () => ({
    ...h.pricing,
    countryCode: null,
    source: 'fallback',
    reason: 'default',
  }),
}));
vi.mock('@/lib/subscription/upi', async (orig) => {
  const real = await orig<typeof import('@/lib/subscription/upi')>();
  return {
    ...real,
    generateQrSvg: async (uri: string) => {
      h.qrGenerated += 1;
      return real.generateQrSvg(uri);
    },
  };
});

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: () => {},
}));

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      h.fromTables.push(table);
      throw new Error(`unexpected write to ${table}`);
    },
  }),
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
  return {
    ...real,
    requireBillingOwner: async () => {
      if (h.role !== 'owner') {
        throw new real.BillingAccessError(
          'owner_only',
          'Only the workspace owner can manage the subscription'
        );
      }
      return {
        accountId: h.accountId,
        userId: 'user-1',
        role: h.role,
        account: { id: h.accountId, name: 'Demo' },
      };
    },
  };
});

vi.mock('@/lib/subscription/queries', async (orig) => {
  const real = await orig<typeof import('@/lib/subscription/queries')>();
  const { QUOTE } =
    await import('@/lib/billing/razorpay/__fixtures__/factories');
  return {
    ...real,
    getSubscriptionSettings: async () => {
      h.settingsReads += 1;
      // The shared DB flag stays manual_upi (as in production today).
      return { payment_provider: 'manual_upi', upi_id: null };
    },
    resolveQuote: async (
      _p: string,
      _c: string,
      pricing?: { region: string; currency: string }
    ) => {
      h.quoteCalls += 1;
      return { ...QUOTE, currency: pricing?.currency ?? 'INR' };
    },
    getRegionSettings: async () => ({ upi_id: 'pay@bank' }),
    getPendingPaymentRequest: async () => null,
    listPaymentRequestsForAccount: async () => [],
  };
});

import { __resetRateLimitForTests } from '@/lib/rate-limit';
import { QUOTE } from '@/lib/billing/razorpay/__fixtures__/factories';
import { GET as history, POST as submit } from './payment-requests/route';
import { GET as upiQr } from './upi-qr/route';

function setEnv(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

function submitRequest(body: unknown = { nonsense: true }) {
  return new Request('https://app.test/api/billing/payment-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function qrRequest() {
  return new Request(
    `https://app.test/api/billing/upi-qr?planId=${QUOTE.planId}&cycleId=${QUOTE.cycleId}`
  );
}

beforeEach(() => {
  __resetRateLimitForTests();
  h.role = 'owner';
  h.accountId = DEMO;
  h.fromTables = [];
  h.settingsReads = 0;
  h.quoteCalls = 0;
  h.pricing = { region: 'global', currency: 'INR' };
  h.qrGenerated = 0;
  setEnv(TEST_ENV);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('manual UPI retirement (410 manual_payments_retired)', () => {
  it('refuses a manual submission from an account on Razorpay, storing nothing', async () => {
    const res = await submit(submitRequest());
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.code).toBe('manual_payments_retired');
    expect(body.error).toContain('replaced by AutoPay');
    expect(h.fromTables).toEqual([]);
    expect(h.quoteCalls).toBe(0);
  });

  it('refuses the QR for an account on Razorpay before any price lookup', async () => {
    const res = await upiQr(qrRequest());
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe('manual_payments_retired');
    expect(h.quoteCalls).toBe(0);
  });

  it('BILLING_PROVIDER_OVERRIDE=manual_upi on dev restores the manual flow', async () => {
    vi.stubEnv('BILLING_PROVIDER_OVERRIDE', 'manual_upi');
    const res = await submit(submitRequest());
    // Reaches validation of the (deliberately bad) form instead of 410.
    expect(res.status).toBe(400);
    const qr = await upiQr(qrRequest());
    expect(qr.status).not.toBe(410);
    expect(h.quoteCalls).toBe(1);
  });

  it('is never retired where Razorpay is not configured (production today)', async () => {
    for (const k of Object.keys(TEST_ENV)) vi.stubEnv(k, '');
    const res = await submit(submitRequest());
    expect(res.status).toBe(400);
    const qr = await upiQr(qrRequest());
    expect(qr.status).not.toBe(410);
    expect(h.quoteCalls).toBe(1);
    // No Razorpay config: the retirement check does not even read settings.
    expect(h.settingsReads).toBe(1); // the QR route's own read
  });

  it('is not retired for an account outside the test allowlist', async () => {
    h.accountId = OTHER;
    const res = await submit(submitRequest());
    expect(res.status).toBe(400);
    const qr = await upiQr(qrRequest());
    expect(qr.status).not.toBe(410);
  });

  it('never builds a UPI QR for a non-INR price (409 manual_upi_inr_only)', async () => {
    vi.stubEnv('BILLING_PROVIDER_OVERRIDE', 'manual_upi');
    h.pricing = { region: 'US', currency: 'USD' };
    const res = await upiQr(qrRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('manual_upi_inr_only');
    expect(body.error).toBe(
      'UPI payments are available in INR only. Please use card AutoPay for this plan.'
    );
    expect(h.qrGenerated).toBe(0);
  });

  it('keeps payment history readable for an account on Razorpay', async () => {
    const res = await history();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [] });
  });

  it('a member still gets the owner-only 403 before any provider lookup', async () => {
    h.role = 'member';
    const res = await submit(submitRequest());
    expect(res.status).toBe(403);
    const qr = await upiQr(qrRequest());
    expect(qr.status).toBe(403);
    expect(h.settingsReads).toBe(0);
  });
});
