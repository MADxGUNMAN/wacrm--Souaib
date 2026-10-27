// ============================================================
// Which purchase flow does THIS account get on THIS deployment?
//
// Decided on the server, per request, and sent to the browser as a fact.
// The routes enforce the same answer, so a browser cannot pick a flow.
//
//   Razorpay not configured here   -> manual UPI (production today)
//   dev override = manual_upi      -> manual UPI for every account here
//   test mode                      -> Razorpay only for allowlisted
//                                     accounts, whatever the DB flag says
//   live mode with a pilot list    -> Razorpay only for pilot accounts
//   live mode                      -> the dev override if set, else the
//                                     DB flag decides
//
// Why test mode ignores `subscription_settings.payment_provider`: dev and
// production share one database, so flipping that flag to try Razorpay on
// dev would switch real customers in production at the same moment. On
// dev the allowlist and BILLING_PROVIDER_OVERRIDE (Phase 6, read only when
// BILLING_ENV=dev) are the switch; the flag is only ever flipped for the
// live cutover (Phase 7). An override of `razorpay` in test mode means the
// same as no override: a non-allowlisted account can never get Razorpay.
// ============================================================

import { isAccountAllowed, type RazorpayConfig } from './config';

export type PaymentProvider = 'manual_upi' | 'razorpay';

export function resolvePaymentProvider(input: {
  settingsProvider: string | null | undefined;
  config: RazorpayConfig | null;
  accountId: string;
}): PaymentProvider {
  const { config, accountId } = input;
  if (!config) return 'manual_upi';
  const override = config.providerOverride ?? null;
  if (override === 'manual_upi') return 'manual_upi';
  if (config.mode === 'test') {
    return isAccountAllowed(config, accountId) ? 'razorpay' : 'manual_upi';
  }
  if (config.livePilotAccountIds) {
    return config.livePilotAccountIds.has(accountId.toLowerCase())
      ? 'razorpay'
      : 'manual_upi';
  }
  return (override ?? input.settingsProvider) === 'razorpay'
    ? 'razorpay'
    : 'manual_upi';
}

/**
 * Can accounts on this deployment still start a manual UPI payment?
 *   open     every account can (production today)
 *   partial  some accounts are on Razorpay (test allowlist, live pilot)
 *   retired  every account is on Razorpay, the manual list is history
 * Drives the super-admin Manual payments tab label and notice only.
 */
export type ManualIntake = 'open' | 'partial' | 'retired';

export function resolveManualIntake(input: {
  settingsProvider: string | null | undefined;
  config: RazorpayConfig | null;
}): ManualIntake {
  const { config } = input;
  if (!config) return 'open';
  const override = config.providerOverride ?? null;
  if (override === 'manual_upi') return 'open';
  if (config.mode === 'test') return 'partial';
  if (config.livePilotAccountIds) return 'partial';
  return (override ?? input.settingsProvider) === 'razorpay'
    ? 'retired'
    : 'open';
}
