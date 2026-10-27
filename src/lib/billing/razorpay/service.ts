// ============================================================
// Razorpay checkout service — the orchestration behind the billing
// routes (plan sections 3.3, 3.4, 3.6 and 7.2).
//
// Dependency-injected (`BillingDeps`) so every path is unit-tested with a
// fake database and a fake Razorpay client; the routes wire in the real
// ones. Rules this file enforces:
//
//   - The server alone decides plan, amount, currency, start date and the
//     account. A browser sends a plan id and a cycle id, nothing else.
//   - A checkout claim is taken in the database BEFORE Razorpay is called,
//     so double clicks and second tabs reuse one provider subscription.
//   - The Checkout signature is checked against OUR stored subscription
//     id, never the one the browser echoes back.
//   - Nothing here grants access directly. Access changes only inside
//     billing_apply_payment, and only for a captured payment on a paid
//     invoice of our subscription with the expected amount.
// ============================================================

import { randomUUID } from 'node:crypto';

import { fillTemplate } from '@/lib/subscription/copy';
import type { SubscriptionState } from '@/lib/subscription/status';
import { formatPlanAmount } from '@/lib/billing/money-format';
import {
  computeFirstCharge,
  computeTotalCount,
  type FirstCharge,
} from './checkout';
import { RazorpayApiError, type RazorpayClient } from './client';
import { isAccountAllowed, type RazorpayConfig } from './config';
import type { ApplyResult, BillingDb } from './db';
import { formatBillingDate } from './format';
import {
  toInvoiceSnapshot,
  toPaymentSnapshot,
  toSubscriptionSnapshot,
  toUnixSeconds,
} from './mapping';
import { toMinor } from './money';
import { ensurePaymentNotesSafely } from './payment-notes';
import { verifyCheckoutSignature } from './signature';
import type {
  BillingIntent,
  BillingProviderPlanRow,
  BillingSubscriptionRow,
} from './types';
import { buildAutopayView, REPLACEABLE, type AutopayView } from './view';

export type RazorpayClientLike = Pick<
  RazorpayClient,
  | 'createSubscription'
  | 'fetchSubscription'
  | 'cancelSubscription'
  | 'fetchPayment'
  | 'fetchInvoice'
  | 'listSubscriptionInvoices'
  | 'updatePaymentNotes'
>;

export interface BillingDeps {
  db: BillingDb;
  client: RazorpayClientLike;
  config: RazorpayConfig;
  now?: () => Date;
}

export class BillingServiceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'BillingServiceError';
  }
}

/** How long an unauthorised Razorpay subscription can be authorised. */
export const CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Re-read Razorpay at most this often per subscription when polling. */
export const STATUS_REFRESH_MS = 30_000;

const NON_TERMINAL: ReadonlySet<string> = new Set([
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
]);

export interface CheckoutQuote {
  planId: string;
  planName: string;
  cycleId: string;
  cycleLabel: string;
  cycleMonths: number;
  cycleDurationDays: number | null;
  amount: number;
  currency: string;
}

export interface CheckoutCopy {
  business: string;
  consentTemplate: string | null;
  deferTemplate: string | null;
  immediateTemplate: string | null;
}

export interface CheckoutDisplay {
  /** authorise = AutoPay set up now, first charge later; pay_now = charged today. */
  mode: 'authorise' | 'pay_now';
  intent: BillingIntent;
  planName: string;
  cycleLabel: string;
  durationDays: number;
  amount: number;
  amountMinor: number;
  currency: string;
  /** When the first real charge happens (today for pay_now). */
  firstChargeAt: string;
  /** pay_now only: access this payment buys, from today. */
  accessUntil: string | null;
  summary: string;
  consent: string;
  /** Card verification note for a deferred start (Phase 0: ₹5, refunded). */
  verificationNote: string | null;
}

const DEFAULT_CONSENT =
  'I authorise {business} to charge {amount} every {days} days, starting {first_charge_date}, using the payment method I choose, until I cancel.';
const DEFAULT_DEFER =
  'No charge today. A small card verification is refunded automatically. Your first charge of {amount} is on {first_charge_date}, then every {days} days until you cancel.';
const DEFAULT_IMMEDIATE =
  'You pay {amount} today for {days} days of access, then {amount} every {days} days until you cancel.';

export { formatBillingDate };

function durationOf(quote: CheckoutQuote): number {
  const days = quote.cycleDurationDays;
  if (!days || !Number.isInteger(days) || days < 7) {
    throw new BillingServiceError(
      'unsupported_cycle',
      'AutoPay is available for day-based billing terms of 7 days or more.',
      400
    );
  }
  return days;
}

export function buildCheckoutDisplay(input: {
  quote: CheckoutQuote;
  first: FirstCharge;
  copy: CheckoutCopy;
  now: Date;
}): CheckoutDisplay {
  const { quote, first, copy, now } = input;
  const durationDays = durationOf(quote);
  const currency = quote.currency.toUpperCase();
  const amountMinor = toMinor(quote.amount, currency);
  const firstChargeAt = first.startAt ?? now;
  const accessUntil = first.startAt
    ? null
    : new Date(now.getTime() + durationDays * 86_400_000);
  const vars = {
    business: copy.business,
    amount: formatPlanAmount(quote.amount, currency),
    days: durationDays,
    first_charge_date: formatBillingDate(firstChargeAt),
    access_until: accessUntil ? formatBillingDate(accessUntil) : null,
  };
  const deferred = first.startAt !== null;
  return {
    mode: deferred ? 'authorise' : 'pay_now',
    intent: first.intent,
    planName: quote.planName,
    cycleLabel: quote.cycleLabel,
    durationDays,
    amount: quote.amount,
    amountMinor,
    currency,
    firstChargeAt: firstChargeAt.toISOString(),
    accessUntil: accessUntil ? accessUntil.toISOString() : null,
    summary: fillTemplate(
      deferred
        ? (copy.deferTemplate ?? DEFAULT_DEFER)
        : (copy.immediateTemplate ?? DEFAULT_IMMEDIATE),
      vars
    ),
    consent: fillTemplate(copy.consentTemplate ?? DEFAULT_CONSENT, vars),
    verificationNote: deferred
      ? currency === 'INR'
        ? 'Cards: Razorpay charges ₹5 to verify the card and refunds it automatically.'
        : 'Cards: Razorpay makes a small verification charge and refunds it automatically.'
      : null,
  };
}

function assertCheckoutAllowed(
  deps: BillingDeps,
  accountId: string,
  state: SubscriptionState
): void {
  if (!isAccountAllowed(deps.config, accountId)) {
    throw new BillingServiceError(
      'account_not_allowed',
      'Online payment is not available for this workspace yet. Please contact support.',
      403
    );
  }
  if (state.billingDisabled || state.status === 'none') {
    throw new BillingServiceError(
      'billing_not_required',
      'This workspace does not need a subscription.',
      409
    );
  }
}

export function previewCheckout(
  deps: BillingDeps,
  input: {
    accountId: string;
    state: SubscriptionState;
    quote: CheckoutQuote;
    copy: CheckoutCopy;
  }
): CheckoutDisplay {
  assertCheckoutAllowed(deps, input.accountId, input.state);
  const now = deps.now?.() ?? new Date();
  const first = computeFirstCharge({ state: input.state, now });
  return buildCheckoutDisplay({
    quote: input.quote,
    first,
    copy: input.copy,
    now,
  });
}

export interface CheckoutStart {
  keyId: string;
  subscriptionId: string;
  display: CheckoutDisplay;
  /** True when an existing unauthorised subscription was reopened. */
  reused: boolean;
}

/**
 * Before cancelling an unauthorised subscription we are replacing, ask
 * Razorpay what it really is: the customer may have just authorised it in
 * another tab. Cancelling a live mandate by mistake would be far worse
 * than refusing this checkout.
 */
async function supersede(
  deps: BillingDeps,
  row: BillingSubscriptionRow
): Promise<'superseded' | 'is_live'> {
  const pid = row.provider_subscription_id;
  const now = deps.now?.() ?? new Date();
  if (pid) {
    const current = await deps.client.fetchSubscription(pid);
    if (
      current.status !== 'created' &&
      current.status !== 'cancelled' &&
      current.status !== 'expired'
    ) {
      await deps.db.applySubscriptionSnapshot(
        deps.config.mode,
        toSubscriptionSnapshot(current, now),
        'checkout'
      );
      return 'is_live';
    }
    if (current.status === 'created') {
      try {
        await deps.client.cancelSubscription(pid, false);
      } catch (err) {
        if (!(
          err instanceof RazorpayApiError &&
          (err.isAlreadyInState || err.isNotFound)
        ))
          throw err;
      }
    }
  }
  await deps.db.markSuperseded(row.id);
  return 'superseded';
}

/**
 * Cancel a halted or paused mandate so a new checkout can take its
 * place (plan section 4, rows 11 and 24). Only when Razorpay itself still
 * reports it halted or paused: if a card change or a resume brought it
 * back to life, that state is applied and nothing is cancelled.
 */
async function replaceStoppedMandate(
  deps: BillingDeps,
  row: BillingSubscriptionRow
): Promise<'replaced' | 'is_live'> {
  const pid = row.provider_subscription_id;
  if (!pid) return 'is_live';
  const now = deps.now?.() ?? new Date();
  const current = await deps.client.fetchSubscription(pid);
  if (current.status !== 'halted' && current.status !== 'paused') {
    await deps.db.applySubscriptionSnapshot(
      deps.config.mode,
      toSubscriptionSnapshot(current, now),
      'checkout'
    );
    return current.status === 'cancelled' ||
      current.status === 'completed' ||
      current.status === 'expired'
      ? 'replaced'
      : 'is_live';
  }
  try {
    await deps.client.cancelSubscription(pid, false);
  } catch (err) {
    if (!(
      err instanceof RazorpayApiError &&
      (err.isAlreadyInState || err.isNotFound)
    ))
      throw err;
  }
  await deps.db.markCancelRequested(row.id, 'customer');
  await syncSubscription(deps, pid, 'customer');
  return 'replaced';
}

function describe(err: unknown): string {
  if (err instanceof RazorpayApiError)
    return `Razorpay ${err.status} ${err.code ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : 'Unknown error';
}

/**
 * Razorpay refused the currency or an international payment. Localized
 * pricing must fail closed here: never retry in INR, tell the customer
 * plainly, and keep Razorpay's text in `last_error` for support.
 */
export function isCurrencyRejection(err: unknown): boolean {
  if (!(err instanceof RazorpayApiError)) return false;
  const text = `${err.code ?? ''} ${err.field ?? ''} ${err.reason ?? ''} ${err.message}`;
  return /currenc|international/i.test(text);
}

function currencyNotSupported(currency: string): BillingServiceError {
  return new BillingServiceError(
    'currency_not_supported',
    `Payments in ${currency.toUpperCase()} are not available right now. Please contact support.`,
    409
  );
}

export async function startCheckout(
  deps: BillingDeps,
  input: {
    accountId: string;
    userId: string;
    state: SubscriptionState;
    quote: CheckoutQuote;
    copy: CheckoutCopy;
    ensurePlan: () => Promise<BillingProviderPlanRow>;
  }
): Promise<CheckoutStart> {
  assertCheckoutAllowed(deps, input.accountId, input.state);
  const now = deps.now?.() ?? new Date();
  const first = computeFirstCharge({ state: input.state, now });
  const display = buildCheckoutDisplay({
    quote: input.quote,
    first,
    copy: input.copy,
    now,
  });
  let plan: BillingProviderPlanRow;
  try {
    plan = await input.ensurePlan();
  } catch (err) {
    if (isCurrencyRejection(err)) throw currencyNotSupported(display.currency);
    throw err;
  }

  const result = (
    row: BillingSubscriptionRow,
    reused: boolean
  ): CheckoutStart => {
    if (!row.provider_subscription_id) {
      throw new BillingServiceError(
        'checkout_in_progress',
        'Checkout is still being prepared. Please try again.',
        409
      );
    }
    return {
      keyId: deps.config.keyId,
      subscriptionId: row.provider_subscription_id,
      display,
      reused,
    };
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const checkoutId = randomUUID();
    const claim = await deps.db.claimCheckout({
      account_id: input.accountId,
      mode: deps.config.mode,
      env: deps.config.env,
      checkout_id: checkoutId,
      provider_plan_row: plan.id,
      provider_plan_id: plan.provider_plan_id,
      plan_id: input.quote.planId,
      cycle_id: input.quote.cycleId,
      plan_name: input.quote.planName,
      cycle_label: input.quote.cycleLabel,
      duration_days: display.durationDays,
      amount_minor: display.amountMinor,
      currency: display.currency,
      intent: first.intent,
      start_at: first.startAt ? first.startAt.toISOString() : null,
      created_by: input.userId,
    });

    switch (claim.outcome) {
      case 'account_not_found':
        throw new BillingServiceError(
          'account_not_found',
          'Workspace not found.',
          404
        );
      case 'autopay_exists': {
        // A mandate that has stopped (halted) or is paused will not
        // charge. The customer is choosing to pay here, so replace it,
        // after confirming at Razorpay that it really is still stopped.
        const live = claim.subscription;
        if (live && REPLACEABLE.has(live.status)) {
          if ((await replaceStoppedMandate(deps, live)) === 'replaced') {
            continue;
          }
        }
        throw new BillingServiceError(
          'autopay_exists',
          'AutoPay is already set up for this workspace.',
          409
        );
      }
      case 'in_progress':
        throw new BillingServiceError(
          'checkout_in_progress',
          'Checkout is already being prepared in another tab. Please try again in a moment.',
          409
        );
      case 'reuse':
        return result(claim.subscription!, true);
      case 'supersede_required': {
        const outcome = await supersede(deps, claim.subscription!);
        if (outcome === 'is_live') {
          throw new BillingServiceError(
            'autopay_exists',
            'AutoPay is already set up for this workspace.',
            409
          );
        }
        continue;
      }
      case 'claimed': {
        const row = claim.subscription!;
        let created;
        try {
          created = await deps.client.createSubscription({
            plan_id: plan.provider_plan_id,
            total_count: computeTotalCount(
              display.durationDays,
              first.startAt,
              now
            ),
            quantity: 1,
            ...(first.startAt
              ? { start_at: toUnixSeconds(first.startAt) }
              : {}),
            expire_by: toUnixSeconds(
              new Date(now.getTime() + CHECKOUT_EXPIRY_MS)
            ),
            customer_notify: 1,
            notes: {
              account_id: input.accountId,
              checkout_id: row.checkout_id,
              env: deps.config.env,
              intent: first.intent,
            },
          });
        } catch (err) {
          // Razorpay's own wording is kept on the row for support.
          await deps.db.markCreateFailed(row.id, describe(err));
          if (isCurrencyRejection(err)) {
            throw currencyNotSupported(display.currency);
          }
          throw new BillingServiceError(
            'provider_error',
            'Razorpay could not start the checkout. Please try again in a minute.',
            502
          );
        }
        const attached = await deps.db.attachProviderSubscription(
          row.id,
          toSubscriptionSnapshot(created, now)
        );
        if (attached.outcome !== 'attached' || !attached.subscription) {
          // Our claim was released as stale while Razorpay was answering.
          // Do not leave an orphan that a customer could authorise.
          await deps.client
            .cancelSubscription(created.id, false)
            .catch(() => undefined);
          throw new BillingServiceError(
            'checkout_in_progress',
            'Checkout took too long. Please try again.',
            409
          );
        }
        return result(attached.subscription, false);
      }
      default:
        throw new BillingServiceError(
          'checkout_failed',
          'Could not start checkout.',
          500
        );
    }
  }
  throw new BillingServiceError(
    'checkout_in_progress',
    'Checkout is busy. Please try again.',
    409
  );
}

export async function syncSubscription(
  deps: BillingDeps,
  providerSubscriptionId: string,
  source: string
): Promise<ApplyResult> {
  const now = deps.now?.() ?? new Date();
  const sub = await deps.client.fetchSubscription(providerSubscriptionId);
  return deps.db.applySubscriptionSnapshot(
    deps.config.mode,
    toSubscriptionSnapshot(sub, now),
    source
  );
}

export async function syncPayment(
  deps: BillingDeps,
  providerPaymentId: string,
  providerSubscriptionId: string,
  source: string
): Promise<ApplyResult> {
  const payment = await deps.client.fetchPayment(providerPaymentId);
  const invoice = payment.invoice_id
    ? await deps.client.fetchInvoice(payment.invoice_id)
    : null;
  const res = await deps.db.applyPayment(
    deps.config.mode,
    toPaymentSnapshot(payment, providerSubscriptionId),
    invoice ? toInvoiceSnapshot(invoice) : null,
    source
  );
  // Best effort, after the payment is applied; never throws.
  await ensurePaymentNotesSafely(deps, payment);
  return res;
}

export interface VerifyResult {
  subscription: ApplyResult;
  payment: ApplyResult;
  row: BillingSubscriptionRow | null;
}

export async function verifyCheckout(
  deps: BillingDeps,
  input: {
    accountId: string;
    paymentId: unknown;
    signature: unknown;
    clientSubscriptionId: unknown;
  }
): Promise<VerifyResult> {
  const row = await deps.db.getLatestSubscription(
    input.accountId,
    deps.config.mode
  );
  const pid = row?.provider_subscription_id;
  if (!row || !pid || !NON_TERMINAL.has(row.status)) {
    throw new BillingServiceError(
      'no_checkout',
      'There is no open checkout for this workspace.',
      404
    );
  }
  if (
    input.clientSubscriptionId !== undefined &&
    input.clientSubscriptionId !== null &&
    input.clientSubscriptionId !== pid
  ) {
    throw new BillingServiceError(
      'subscription_mismatch',
      'This payment does not belong to the current checkout.',
      400
    );
  }
  const ok = verifyCheckoutSignature({
    paymentId: input.paymentId,
    subscriptionId: pid,
    signature: input.signature,
    keySecret: deps.config.keySecret,
  });
  if (!ok) {
    throw new BillingServiceError(
      'invalid_signature',
      'We could not verify this payment response.',
      400
    );
  }
  const subscription = await syncSubscription(deps, pid, 'checkout');
  const payment = await syncPayment(
    deps,
    input.paymentId as string,
    pid,
    'checkout'
  );
  // After a card change the newest payment is on the new card; show it.
  await deps.db.refreshMethodSummary(row.id);
  return { subscription, payment, row: await deps.db.getSubscription(row.id) };
}

export function shouldRefresh(row: BillingSubscriptionRow, now: Date): boolean {
  if (!row.provider_subscription_id || !NON_TERMINAL.has(row.status))
    return false;
  if (!row.last_synced_at) return true;
  return (
    now.getTime() - new Date(row.last_synced_at).getTime() > STATUS_REFRESH_MS
  );
}

/**
 * Re-read a subscription and its recent invoices from Razorpay and apply
 * anything we have not applied yet. Used by status polling now and by the
 * reconciliation job in Phase 3, so a missing webhook cannot leave a paid
 * customer blocked.
 */
export async function refreshSubscription(
  deps: BillingDeps,
  row: BillingSubscriptionRow,
  source = 'reconciliation'
): Promise<{ applied: number }> {
  const pid = row.provider_subscription_id;
  if (!pid) return { applied: 0 };
  await syncSubscription(deps, pid, source);
  const invoices = await deps.client.listSubscriptionInvoices(pid, {
    count: 5,
  });
  let applied = 0;
  for (const invoice of invoices.items ?? []) {
    if (!invoice.payment_id) continue;
    if (await deps.db.isPaymentApplied(deps.config.mode, invoice.payment_id))
      continue;
    const payment = await deps.client.fetchPayment(invoice.payment_id);
    const res = await deps.db.applyPayment(
      deps.config.mode,
      toPaymentSnapshot(payment, pid),
      toInvoiceSnapshot(invoice),
      source
    );
    await ensurePaymentNotesSafely(deps, payment);
    if (res.outcome === 'granted') applied += 1;
  }
  return { applied };
}

export async function loadAutopayView(
  db: BillingDb,
  row: BillingSubscriptionRow | null,
  now: Date = new Date()
): Promise<AutopayView | null> {
  if (!row) return null;
  const [currentCyclePaid, lastFailure] = await Promise.all([
    db.isCurrentCyclePaid(row.id, now),
    row.status === 'pending' ||
    row.status === 'halted' ||
    row.status === 'created'
      ? db.getLastFailedPayment(row.id)
      : Promise.resolve(null),
  ]);
  return buildAutopayView(row, { currentCyclePaid, lastFailure });
}
