// ============================================================
// Razorpay configuration — SERVER ONLY. Fails closed.
//
// Read from env at call time (not module load) so a misconfigured
// deployment answers "billing unavailable" on the billing routes instead
// of crashing every page, and so tests can pass their own env.
//
// The rules exist because dev and production share ONE database:
//   - the key prefix must match RAZORPAY_MODE (a test key in live mode, or
//     the reverse, is refused);
//   - test mode is refused when BILLING_ENV=prod, so test cards can never
//     buy real access in production;
//   - test mode REQUIRES an account allowlist, so a test checkout on dev
//     can only ever touch the accounts listed (the demo account);
//   - BILLING_PROVIDER_OVERRIDE (Phase 6) switches the purchase flow for
//     THIS deployment only, and is read only when BILLING_ENV=dev. It is
//     the dev switch that replaces flipping the shared DB flag. With
//     BILLING_ENV=prod it is ignored rather than refused, because a config
//     error would also stop the webhook processor.
// Error messages name the variable, never its value.
// ============================================================

import type { BillingEnv, RazorpayMode } from './types';

export class RazorpayConfigError extends Error {
  readonly status = 503 as const;
  constructor(message: string) {
    super(message);
    this.name = 'RazorpayConfigError';
  }
}

export interface RazorpayConfig {
  mode: RazorpayMode;
  env: BillingEnv;
  keyId: string;
  keySecret: string;
  /** Current webhook secret first, then the previous one during rotation. */
  webhookSecrets: string[];
  /** Required in test mode; empty set in live mode. */
  testAllowedAccountIds: ReadonlySet<string>;
  /** Optional live pilot: when set, only these accounts may check out. */
  livePilotAccountIds: ReadonlySet<string> | null;
  /**
   * Dev-only purchase-flow override (BILLING_PROVIDER_OVERRIDE). Always
   * null when BILLING_ENV=prod. Optional so older literals still compile.
   */
  providerOverride?: ProviderOverride | null;
  /**
   * Currencies Razorpay can charge on this deployment
   * (RAZORPAY_CHARGE_CURRENCIES). Always contains INR. Optional so older
   * literals still compile; read it through `chargeCurrenciesOf`.
   */
  chargeCurrencies?: ReadonlySet<string>;
}

export type ProviderOverride = 'manual_upi' | 'razorpay';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string {
  return (env[name] ?? '').trim();
}

function parseIdList(env: Env, name: string): Set<string> {
  const raw = read(env, name);
  const ids = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const id of ids) {
    if (!UUID.test(id))
      throw new RazorpayConfigError(
        `${name} must be a comma-separated list of account UUIDs`
      );
  }
  return new Set(ids);
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * RAZORPAY_CHARGE_CURRENCIES: comma list, case-insensitive. INR is always
 * present. Invalid tokens are dropped with a warning instead of throwing,
 * because a config error would also stop the webhook processor.
 */
export function parseChargeCurrencies(env: Env): Set<string> {
  const name = 'RAZORPAY_CHARGE_CURRENCIES';
  const out = new Set<string>(['INR']);
  for (const token of read(env, name).split(',')) {
    const code = token.trim().toUpperCase();
    if (!code) continue;
    if (CURRENCY_CODE.test(code)) out.add(code);
    else console.warn(`${name} contains an invalid currency code; ignored`);
  }
  return out;
}

const INR_ONLY: ReadonlySet<string> = new Set(['INR']);

/** The charge-currency set of a config; INR only when the field is absent. */
export function chargeCurrenciesOf(
  config: Pick<RazorpayConfig, 'chargeCurrencies'> | null | undefined
): ReadonlySet<string> {
  return config?.chargeCurrencies ?? INR_ONLY;
}

/** Parse and validate. Throws RazorpayConfigError on any problem. */
export function readRazorpayConfig(env: Env = process.env): RazorpayConfig {
  const mode = read(env, 'RAZORPAY_MODE');
  if (mode !== 'test' && mode !== 'live') {
    throw new RazorpayConfigError('RAZORPAY_MODE must be "test" or "live"');
  }

  const billingEnv = read(env, 'BILLING_ENV');
  if (billingEnv !== 'dev' && billingEnv !== 'prod') {
    throw new RazorpayConfigError('BILLING_ENV must be "dev" or "prod"');
  }
  if (mode === 'test' && billingEnv === 'prod') {
    throw new RazorpayConfigError(
      'RAZORPAY_MODE=test is refused when BILLING_ENV=prod'
    );
  }

  const keyId = read(env, 'RAZORPAY_KEY_ID');
  const expectedPrefix = mode === 'test' ? 'rzp_test_' : 'rzp_live_';
  if (!keyId.startsWith(expectedPrefix)) {
    throw new RazorpayConfigError(
      `RAZORPAY_KEY_ID does not match RAZORPAY_MODE=${mode}`
    );
  }

  const keySecret = read(env, 'RAZORPAY_KEY_SECRET');
  if (keySecret.length < 16) {
    throw new RazorpayConfigError(
      'RAZORPAY_KEY_SECRET is missing or too short'
    );
  }

  const webhookSecret = read(env, 'RAZORPAY_WEBHOOK_SECRET');
  if (webhookSecret.length < 16) {
    throw new RazorpayConfigError(
      'RAZORPAY_WEBHOOK_SECRET is missing or too short'
    );
  }
  const previous = read(env, 'RAZORPAY_WEBHOOK_SECRET_PREVIOUS');
  const webhookSecrets =
    previous && previous !== webhookSecret
      ? [webhookSecret, previous]
      : [webhookSecret];

  const testAllowed = parseIdList(env, 'RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS');
  if (mode === 'test' && testAllowed.size === 0) {
    throw new RazorpayConfigError(
      'RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS is required in test mode'
    );
  }

  const pilot = parseIdList(env, 'RAZORPAY_LIVE_PILOT_ACCOUNT_IDS');

  let providerOverride: ProviderOverride | null = null;
  if (billingEnv === 'dev') {
    const raw = read(env, 'BILLING_PROVIDER_OVERRIDE');
    if (raw === 'manual_upi' || raw === 'razorpay') providerOverride = raw;
    else if (raw) {
      throw new RazorpayConfigError(
        'BILLING_PROVIDER_OVERRIDE must be "manual_upi" or "razorpay"'
      );
    }
  }

  return {
    mode,
    env: billingEnv,
    keyId,
    keySecret,
    webhookSecrets,
    testAllowedAccountIds: mode === 'test' ? testAllowed : new Set(),
    livePilotAccountIds: mode === 'live' && pilot.size > 0 ? pilot : null,
    providerOverride,
    chargeCurrencies: parseChargeCurrencies(env),
  };
}

/** Config, or null when Razorpay is not (correctly) configured here. */
export function getRazorpayConfig(
  env: Env = process.env
): RazorpayConfig | null {
  try {
    return readRazorpayConfig(env);
  } catch {
    return null;
  }
}

export function isRazorpayConfigured(env: Env = process.env): boolean {
  return getRazorpayConfig(env) !== null;
}

/** May this account start a Razorpay checkout on this deployment? */
export function isAccountAllowed(
  config: RazorpayConfig,
  accountId: string
): boolean {
  const id = accountId.toLowerCase();
  if (config.mode === 'test') return config.testAllowedAccountIds.has(id);
  return config.livePilotAccountIds ? config.livePilotAccountIds.has(id) : true;
}
