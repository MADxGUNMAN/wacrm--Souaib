// ============================================================
// Billing database access — SERVER ONLY (service role).
//
// Every write goes through the SECURITY DEFINER functions from migration
// 20261021010000, which lock the account row and apply state in one
// transaction. This module only adds typed wrappers and a few reads, and
// exposes them as `BillingDb` so the service layer can be unit-tested
// with an in-memory fake.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { firstAppliedChargeAtBySubscription } from './payment-details';
import type {
  BillingSubscriptionRow,
  InvoiceSnapshot,
  PaymentSnapshot,
  RazorpayMode,
  SubscriptionSnapshot,
} from './types';

export type ClaimOutcome =
  | 'claimed'
  | 'reuse'
  | 'in_progress'
  | 'autopay_exists'
  | 'supersede_required'
  | 'account_not_found';

export interface ClaimResult {
  outcome: ClaimOutcome;
  subscription?: BillingSubscriptionRow;
}

/**
 * billing_attach_provider_subscription: `not_initiating` means our claim
 * was released (stale) before Razorpay answered.
 */
export interface AttachResult {
  outcome: 'attached' | 'not_initiating';
  subscription?: BillingSubscriptionRow;
}

export interface ApplyResult {
  outcome: string;
  [key: string]: unknown;
}

export interface ClaimInput {
  account_id: string;
  mode: RazorpayMode;
  env: string;
  checkout_id: string;
  provider_plan_row: string | null;
  provider_plan_id: string;
  plan_id: string | null;
  cycle_id: string | null;
  plan_name: string;
  cycle_label: string;
  duration_days: number;
  amount_minor: number;
  currency: string;
  intent: string;
  start_at: string | null;
  created_by: string | null;
}

export interface PaymentNoteContext {
  accountId: string;
  workspace: string | null;
  /** Of the linked subscription row. */
  env: string;
  mode: string;
  planName: string | null;
  cycleLabel: string | null;
  /** Razorpay ids (sub_..., inv_...). */
  subscriptionId: string | null;
  invoiceId: string | null;
  kind: string | null;
  createdAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  firstAppliedChargeAt: string | null;
}

export interface BillingDb {
  claimCheckout(input: ClaimInput): Promise<ClaimResult>;
  attachProviderSubscription(
    id: string,
    snapshot: SubscriptionSnapshot
  ): Promise<AttachResult>;
  markCreateFailed(id: string, error: string): Promise<void>;
  markSuperseded(id: string): Promise<void>;
  applySubscriptionSnapshot(
    mode: RazorpayMode,
    snapshot: SubscriptionSnapshot,
    source: string
  ): Promise<ApplyResult>;
  applyPayment(
    mode: RazorpayMode,
    payment: PaymentSnapshot,
    invoice: InvoiceSnapshot | null,
    source: string
  ): Promise<ApplyResult>;
  /** Newest subscription for the account in this mode that a customer may see. */
  getLatestSubscription(
    accountId: string,
    mode: RazorpayMode
  ): Promise<BillingSubscriptionRow | null>;
  getSubscription(id: string): Promise<BillingSubscriptionRow | null>;
  isPaymentApplied(
    mode: RazorpayMode,
    providerPaymentId: string
  ): Promise<boolean>;
  /** A captured, applied charge covers `now`. */
  isCurrentCyclePaid(subscriptionId: string, now: Date): Promise<boolean>;
  getLastFailedPayment(
    subscriptionId: string
  ): Promise<{ error_code: string | null; error_reason: string | null } | null>;
  getContact(userId: string): Promise<{
    name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  /**
   * What our notes on a Razorpay payment need, or null when the payment
   * is not in our billing tables (or has no subscription). The null is
   * what keeps another project's payments in a shared Razorpay test
   * account untouched.
   */
  getPaymentNoteContext(
    mode: RazorpayMode,
    providerPaymentId: string
  ): Promise<PaymentNoteContext | null>;
  /** Our stored Razorpay payment ids for a subscription, newest first. */
  listPaymentIdsForNotes(
    subscriptionId: string,
    limit: number
  ): Promise<string[]>;
  /**
   * Record who asked for an AutoPay to stop. Call only AFTER Razorpay has
   * accepted the cancel. First request wins.
   */
  markCancelRequested(
    id: string,
    by: 'customer' | 'admin' | 'provider' | 'system'
  ): Promise<void>;
  /** Show the newest successful payment's method (after a card change). */
  refreshMethodSummary(subscriptionId: string): Promise<void>;
}

const SUB_COLUMNS = '*';

/** Statuses hidden from customers (local terminal states). */
const HIDDEN = '(failed_to_create,superseded,expired)';

export class BillingDbError extends Error {
  readonly status = 500 as const;
  constructor(message: string) {
    super(message);
    this.name = 'BillingDbError';
  }
}

async function rpc<T>(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new BillingDbError(`${fn} failed: ${error.message}`);
  return data as T;
}

interface NoteContextRow {
  id: string;
  kind: string | null;
  account_id: string;
  subscription_id: string | null;
  granted_from: string | null;
  granted_until: string | null;
  access_applied_at: string | null;
  provider_created_at: string | null;
  created_at: string;
  invoice: OneOrMany<{
    provider_invoice_id: string | null;
    billing_start: string | null;
    billing_end: string | null;
  }>;
  subscription: OneOrMany<{
    provider_subscription_id: string | null;
    plan_name: string | null;
    cycle_label: string | null;
    env: string;
    mode: string;
  }>;
  account: OneOrMany<{ name: string | null }>;
}

type OneOrMany<T> = T | T[] | null;

/** PostgREST returns a to-one embed as an object, typed loosely as an array. */
function one<T>(value: OneOrMany<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Earliest applied charge per subscription, which is what tells a first
 * payment from a renewal. Empty input makes no query.
 */
export async function loadFirstAppliedChargeAt(
  admin: SupabaseClient,
  subscriptionIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(subscriptionIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await admin
    .from('billing_payments')
    .select('subscription_id, provider_created_at, created_at')
    .in('subscription_id', ids)
    .eq('kind', 'charge')
    .not('access_applied_at', 'is', null);
  if (error)
    throw new BillingDbError(`Could not read payments: ${error.message}`);
  return firstAppliedChargeAtBySubscription(
    (data ?? []) as Array<{
      subscription_id: string | null;
      provider_created_at: string | null;
      created_at: string;
    }>
  );
}

export function createBillingDb(
  admin: SupabaseClient = supabaseAdmin()
): BillingDb {
  return {
    claimCheckout: (input) =>
      rpc<ClaimResult>(admin, 'billing_claim_checkout', { p: input }),

    attachProviderSubscription: (id, snapshot) =>
      rpc<AttachResult>(admin, 'billing_attach_provider_subscription', {
        p_id: id,
        p: snapshot,
      }),

    markCreateFailed: async (id, error) => {
      await rpc(admin, 'billing_mark_create_failed', {
        p_id: id,
        p_error: error,
      });
    },

    markSuperseded: async (id) => {
      await rpc(admin, 'billing_mark_superseded', { p_id: id });
    },

    applySubscriptionSnapshot: (mode, snapshot, source) =>
      rpc<ApplyResult>(admin, 'billing_apply_subscription_snapshot', {
        p_mode: mode,
        p: snapshot,
        p_source: source,
      }),

    applyPayment: (mode, payment, invoice, source) =>
      rpc<ApplyResult>(admin, 'billing_apply_payment', {
        p_mode: mode,
        p_payment: payment,
        p_invoice: invoice,
        p_source: source,
      }),

    getLatestSubscription: async (accountId, mode) => {
      const { data, error } = await admin
        .from('billing_subscriptions')
        .select(SUB_COLUMNS)
        .eq('account_id', accountId)
        .eq('mode', mode)
        .not('status', 'in', HIDDEN)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error)
        throw new BillingDbError(
          `Could not read the subscription: ${error.message}`
        );
      return (data as BillingSubscriptionRow | null) ?? null;
    },

    getSubscription: async (id) => {
      const { data, error } = await admin
        .from('billing_subscriptions')
        .select(SUB_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error)
        throw new BillingDbError(
          `Could not read the subscription: ${error.message}`
        );
      return (data as BillingSubscriptionRow | null) ?? null;
    },

    isPaymentApplied: async (mode, providerPaymentId) => {
      const { data, error } = await admin
        .from('billing_payments')
        .select('access_applied_at')
        .eq('mode', mode)
        .eq('provider_payment_id', providerPaymentId)
        .maybeSingle();
      if (error)
        throw new BillingDbError(
          `Could not read the payment: ${error.message}`
        );
      return Boolean(
        (data as { access_applied_at: string | null } | null)?.access_applied_at
      );
    },

    isCurrentCyclePaid: async (subscriptionId, now) => {
      const { count, error } = await admin
        .from('billing_payments')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', subscriptionId)
        .not('access_applied_at', 'is', null)
        .gt('granted_until', now.toISOString());
      if (error)
        throw new BillingDbError(`Could not read payments: ${error.message}`);
      return (count ?? 0) > 0;
    },

    getLastFailedPayment: async (subscriptionId) => {
      const { data, error } = await admin
        .from('billing_payments')
        .select('error_code, error_reason')
        .eq('subscription_id', subscriptionId)
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error)
        throw new BillingDbError(`Could not read payments: ${error.message}`);
      return (
        (data as {
          error_code: string | null;
          error_reason: string | null;
        } | null) ?? null
      );
    },

    getContact: async (userId) => {
      const { data } = await admin
        .from('profiles')
        .select('full_name, email, phone')
        .eq('user_id', userId)
        .maybeSingle();
      const row = data as {
        full_name: string | null;
        email: string | null;
        phone: string | null;
      } | null;
      return {
        name: row?.full_name ?? null,
        email: row?.email ?? null,
        phone: row?.phone ?? null,
      };
    },

    getPaymentNoteContext: async (mode, providerPaymentId) => {
      const { data, error } = await admin
        .from('billing_payments')
        .select(
          'id, kind, account_id, subscription_id, granted_from, granted_until, access_applied_at, provider_created_at, created_at, invoice:billing_invoices(provider_invoice_id, billing_start, billing_end), subscription:billing_subscriptions(provider_subscription_id, plan_name, cycle_label, env, mode), account:accounts(name)'
        )
        .eq('mode', mode)
        .eq('provider_payment_id', providerPaymentId)
        .maybeSingle();
      if (error)
        throw new BillingDbError(
          `Could not read the payment: ${error.message}`
        );
      const row = data as unknown as NoteContextRow | null;
      const sub = one(row?.subscription);
      if (!row || !row.subscription_id || !sub) return null;
      const invoice = one(row.invoice);
      const first = await loadFirstAppliedChargeAt(admin, [
        row.subscription_id,
      ]);
      const applied = Boolean(row.access_applied_at);
      return {
        accountId: row.account_id,
        workspace: one(row.account)?.name ?? null,
        env: sub.env,
        mode: sub.mode,
        planName: sub.plan_name,
        cycleLabel: sub.cycle_label,
        subscriptionId: sub.provider_subscription_id,
        invoiceId: invoice?.provider_invoice_id ?? null,
        kind: row.kind,
        createdAt: row.provider_created_at ?? row.created_at,
        periodStart: applied
          ? row.granted_from
          : (invoice?.billing_start ?? null),
        periodEnd: applied ? row.granted_until : (invoice?.billing_end ?? null),
        firstAppliedChargeAt: first.get(row.subscription_id) ?? null,
      };
    },

    listPaymentIdsForNotes: async (subscriptionId, limit) => {
      const { data, error } = await admin
        .from('billing_payments')
        .select('provider_payment_id')
        .eq('subscription_id', subscriptionId)
        .neq('status', 'created')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error)
        throw new BillingDbError(`Could not read payments: ${error.message}`);
      return ((data ?? []) as Array<{ provider_payment_id: string }>).map(
        (r) => r.provider_payment_id
      );
    },

    markCancelRequested: async (id, by) => {
      await rpc(admin, 'billing_mark_cancel_requested', {
        p_id: id,
        p_by: by,
      });
    },

    refreshMethodSummary: async (subscriptionId) => {
      await rpc(admin, 'billing_refresh_method_summary', {
        p_subscription_id: subscriptionId,
      });
    },
  };
}
