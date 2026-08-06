// ============================================================
// Subscription reads — SERVER ONLY.
//
// !! This module uses the service-role client. Never import it from a
// !! client component. It bypasses RLS by design.
//
// Why service role: the catalogue tables (`subscription_settings`,
// `billing_cycles`, `subscription_plans`, `subscription_plan_prices`)
// have RLS enabled with NO client policies — verified empirically that
// `anon` and `authenticated` read zero rows from them. That is what
// makes the server the single authority on price: a client cannot read
// the catalogue, so it cannot fabricate an `expected_amount`. Every
// read of that data therefore has to happen here.
//
// All amounts pass through `toAmount` because PostgREST serialises
// NUMERIC as a STRING ("1000.00") to avoid float precision loss.
// Skipping the coercion makes arithmetic silently concatenate.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { addDuration, resolveCycleDuration } from './status';
import { toAmount, toNullableAmount } from './plans';
import type {
  AccountOwnerContact,
  AccountSubscriptionRow,
  BillingCycle,
  PaymentRequest,
  PlansBundle,
  PublicSubscriptionSettings,
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionPlanPrice,
  SubscriptionSettings,
} from './types';
import type { SubscriptionGateConfig } from './status';

/**
 * Fallback settings used when the singleton row is missing — a fresh
 * database where migration 050's seed didn't run, or a row deleted by
 * hand. Returning defaults rather than throwing keeps the CRM usable
 * (billing simply behaves as unconfigured) instead of 500-ing every
 * page in the app.
 *
 * `upi_id` stays null so the payment screen refuses to render a QR
 * rather than generating one that pays nobody.
 */
export const FALLBACK_SETTINGS: PublicSubscriptionSettings = {
  id: '',
  is_enabled: true,
  trial_days: 14,
  grace_days: 0,
  upi_id: null,
  upi_payee_name: null,
  currency: 'INR',
  page_heading: 'Choose Your Plan',
  page_subheading: null,
  cycle_hint: null,
  selected_plan_label: 'Selected Plan',
  total_label: 'Total',
  save_label: 'Save',
  continue_label: 'Continue to Payment',
  equals_label: 'Equals',
  payment_heading: 'Complete your payment',
  payment_instructions: null,
  submit_button_label: 'I have paid - submit details',
  pending_review_message: null,
  support_note: null,
  trial_banner_template: '{days} days left in your free trial',
  trial_banner_cta: 'Upgrade',
  expired_heading: null,
  free_plan_label: 'Free Plan',
  free_plan_subtitle: 'You are on a free trial',
  member_blocked_heading: 'This workspace needs an active subscription',
  member_blocked_body: null,
  member_blocked_note: null,
  member_blocked_contact_label: 'Email account owner',
  member_blocked_show_owner_contact: true,
};

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

/**
 * Read the settings singleton. Never throws — falls back to
 * {@link FALLBACK_SETTINGS} so a missing/unreadable row degrades the
 * billing UI instead of taking down the app.
 */
export async function getSubscriptionSettings(): Promise<PublicSubscriptionSettings> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('subscription_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[subscription] settings read failed:', error.message);
    return FALLBACK_SETTINGS;
  }
  if (!data) return FALLBACK_SETTINGS;

  const row = data as SubscriptionSettings;
  // Spread over the fallback so a column added by a later migration
  // that hasn't reached this environment yet still resolves.
  return { ...FALLBACK_SETTINGS, ...row };
}

/**
 * The two-field slice the access gate needs. Separate from
 * {@link getSubscriptionSettings} so the gate can stay cheap — it runs
 * on effectively every authenticated request.
 */
export async function getGateConfig(): Promise<SubscriptionGateConfig> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('subscription_settings')
    .select('is_enabled, grace_days')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // Fail OPEN on a settings read error. A transient DB blip must not
    // lock every customer out of the CRM — far worse than briefly
    // letting a lapsed account through. The super admin can still
    // revoke access explicitly, and the UI gate re-checks.
    if (error) {
      console.error('[subscription] gate config read failed:', error.message);
    }
    return { is_enabled: true, grace_days: 0 };
  }

  return {
    is_enabled: data.is_enabled ?? true,
    grace_days: data.grace_days ?? 0,
  };
}

// ------------------------------------------------------------
// Catalogue
// ------------------------------------------------------------

function normaliseCycle(row: Record<string, unknown>): BillingCycle {
  return {
    id: String(row.id),
    cycle_key: String(row.cycle_key),
    label: String(row.label),
    unit_label: (row.unit_label as string | null) ?? null,
    months: Number(row.months ?? 0),
    duration_days: row.duration_days == null ? null : Number(row.duration_days),
    discount_label: (row.discount_label as string | null) ?? null,
    is_default: Boolean(row.is_default),
    is_visible: Boolean(row.is_visible),
    position: Number(row.position ?? 0),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function normalisePrice(row: Record<string, unknown>): SubscriptionPlanPrice {
  return {
    id: String(row.id),
    plan_id: String(row.plan_id),
    cycle_id: String(row.cycle_id),
    amount: toAmount(row.amount),
    compare_at_amount: toNullableAmount(row.compare_at_amount),
    is_visible: Boolean(row.is_visible),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

/**
 * Everything /upgrade-plan needs, in one round trip.
 *
 * `includeHidden` is for the super admin editor, which must see plans
 * and cycles the public page omits. Customer-facing callers must leave
 * it false — that filtering is the whole point of keeping these tables
 * server-only.
 */
export async function getPlansBundle(
  options: { includeHidden?: boolean } = {},
): Promise<PlansBundle> {
  const { includeHidden = false } = options;
  const admin = supabaseAdmin();

  const [settings, cyclesRes, plansRes, pricesRes] = await Promise.all([
    getSubscriptionSettings(),
    includeHidden
      ? admin.from('billing_cycles').select('*').order('position')
      : admin
          .from('billing_cycles')
          .select('*')
          .eq('is_visible', true)
          .order('position'),
    includeHidden
      ? admin.from('subscription_plans').select('*').order('position')
      : admin
          .from('subscription_plans')
          .select('*')
          .eq('is_visible', true)
          .order('position'),
    admin.from('subscription_plan_prices').select('*'),
  ]);

  if (cyclesRes.error) {
    console.error('[subscription] cycles read failed:', cyclesRes.error.message);
  }
  if (plansRes.error) {
    console.error('[subscription] plans read failed:', plansRes.error.message);
  }
  if (pricesRes.error) {
    console.error('[subscription] prices read failed:', pricesRes.error.message);
  }

  return {
    settings,
    cycles: (cyclesRes.data ?? []).map((r) =>
      normaliseCycle(r as Record<string, unknown>),
    ),
    plans: (plansRes.data ?? []) as SubscriptionPlan[],
    prices: (pricesRes.data ?? []).map((r) =>
      normalisePrice(r as Record<string, unknown>),
    ),
  };
}

// ------------------------------------------------------------
// Server-authoritative quote
// ------------------------------------------------------------

export interface ResolvedQuote {
  planId: string;
  planName: string;
  cycleId: string;
  cycleLabel: string;
  cycleMonths: number;
  cycleDurationDays: number | null;
  amount: number;
  currency: string;
}

export class QuoteError extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = 'QuoteError';
  }
}

/**
 * Resolve (planId, cycleId) into the price and duration to charge.
 *
 * This is THE pricing authority. The client sends only two ids; the
 * amount, plan name, cycle label, and duration all come from the
 * database at call time. Consequences that matter:
 *
 *   - Editing a price in the super admin panel changes the very next
 *     QR generated, with no cache to bust.
 *   - A tampered request body cannot buy a plan below its list price.
 *   - Hidden plans/cycles are rejected, so an id scraped from an older
 *     page can't be used to purchase a withdrawn tier.
 */
export async function resolveQuote(
  planId: string,
  cycleId: string,
): Promise<ResolvedQuote> {
  const admin = supabaseAdmin();

  const [planRes, cycleRes, priceRes, settings] = await Promise.all([
    admin
      .from('subscription_plans')
      .select('id, name, is_visible')
      .eq('id', planId)
      .maybeSingle(),
    admin
      .from('billing_cycles')
      .select('id, label, months, duration_days, is_visible')
      .eq('id', cycleId)
      .maybeSingle(),
    admin
      .from('subscription_plan_prices')
      .select('amount, is_visible')
      .eq('plan_id', planId)
      .eq('cycle_id', cycleId)
      .maybeSingle(),
    getSubscriptionSettings(),
  ]);

  const plan = planRes.data;
  const cycle = cycleRes.data;
  const price = priceRes.data;

  // Deliberately identical messages for "missing" and "hidden" — no
  // need to tell a prober which plan ids exist.
  if (!plan || !plan.is_visible) {
    throw new QuoteError('That plan is not available');
  }
  if (!cycle || !cycle.is_visible) {
    throw new QuoteError('That billing cycle is not available');
  }
  if (!price || !price.is_visible) {
    throw new QuoteError(
      `${plan.name} is not available on the ${cycle.label} cycle`,
    );
  }

  const amount = toAmount(price.amount);
  if (!(amount > 0)) {
    // A zero/negative price would produce a QR for ₹0, which UPI apps
    // either reject or silently treat as "enter your own amount" —
    // exactly the ambiguity manual verification cannot resolve.
    throw new QuoteError(
      `${plan.name} has no valid price configured for ${cycle.label}`,
    );
  }

  return {
    planId: plan.id,
    planName: plan.name,
    cycleId: cycle.id,
    cycleLabel: cycle.label,
    cycleMonths: Number(cycle.months ?? 0),
    cycleDurationDays: cycle.duration_days == null ? null : Number(cycle.duration_days),
    amount,
    currency: settings.currency || 'INR',
  };
}

/** Preview the window a quote would grant, for the confirmation UI. */
export function previewQuoteWindow(
  quote: Pick<ResolvedQuote, 'cycleMonths' | 'cycleDurationDays'>,
  from: Date = new Date(),
): Date {
  return addDuration(
    from,
    resolveCycleDuration({
      months: quote.cycleMonths,
      duration_days: quote.cycleDurationDays,
    }),
  );
}

// ------------------------------------------------------------
// Account state
// ------------------------------------------------------------

// Must stay a single `as const` literal, NOT a concatenation. supabase-js
// parses the select string at the type level to infer the row shape; a
// `string`-typed variable collapses that inference to GenericStringError
// and the result is no longer assignable to AccountSubscriptionRow.
const ACCOUNT_SUBSCRIPTION_COLUMNS =
  'subscription_status, trial_started_at, trial_ends_at, subscription_plan_id, subscription_plan_name, subscription_cycle_label, subscription_started_at, subscription_ends_at, subscription_note' as const;

export async function getAccountSubscription(
  accountId: string,
): Promise<AccountSubscriptionRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('accounts')
    .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
    .eq('id', accountId)
    .maybeSingle();

  if (error) {
    console.error('[subscription] account read failed:', error.message);
    return null;
  }
  return (data as AccountSubscriptionRow) ?? null;
}

/**
 * The account owner's name + email, for the member-blocked screen.
 *
 * Resolved via `accounts.owner_user_id` -> that user's profile. Account
 * members can already read every profile row in their account under the
 * existing `profiles_select` policy, so surfacing this exposes nothing
 * new — it just saves the client a lookup and a join it would have to
 * get right.
 */
export async function getAccountOwnerContact(
  accountId: string,
): Promise<AccountOwnerContact | null> {
  const admin = supabaseAdmin();

  const { data: account, error: accountErr } = await admin
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle();

  if (accountErr || !account?.owner_user_id) {
    if (accountErr) {
      console.error('[subscription] owner lookup failed:', accountErr.message);
    }
    return null;
  }

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('user_id, full_name, email')
    .eq('user_id', account.owner_user_id)
    .maybeSingle();

  if (profileErr || !profile) {
    if (profileErr) {
      console.error('[subscription] owner profile failed:', profileErr.message);
    }
    // Owner user exists but has no profile row — return the id alone so
    // the screen can still say "contact your owner" without a name.
    return {
      user_id: account.owner_user_id,
      full_name: null,
      email: null,
    };
  }

  return {
    user_id: profile.user_id,
    full_name: profile.full_name ?? null,
    email: profile.email ?? null,
  };
}

// ------------------------------------------------------------
// Payment requests
// ------------------------------------------------------------

function normalisePaymentRequest(row: Record<string, unknown>): PaymentRequest {
  return {
    ...(row as unknown as PaymentRequest),
    expected_amount: toAmount(row.expected_amount),
    paid_amount: toAmount(row.paid_amount),
  };
}

/** Most recent submission for an account, whatever its status. */
export async function getLatestPaymentRequest(
  accountId: string,
): Promise<PaymentRequest | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('payment_requests')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[subscription] payment request read failed:', error.message);
    return null;
  }
  return data ? normalisePaymentRequest(data as Record<string, unknown>) : null;
}

/**
 * The account's open submission, if any. Drives the "under review"
 * state on the payment screen and blocks duplicate submissions (the DB
 * also enforces this with a partial unique index — this is the friendly
 * check that produces a readable error instead of a 23505).
 */
export async function getPendingPaymentRequest(
  accountId: string,
): Promise<PaymentRequest | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('payment_requests')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    console.error('[subscription] pending request read failed:', error.message);
    return null;
  }
  return data ? normalisePaymentRequest(data as Record<string, unknown>) : null;
}

export async function listPaymentRequestsForAccount(
  accountId: string,
  limit = 20,
): Promise<PaymentRequest[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('payment_requests')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[subscription] payment history read failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => normalisePaymentRequest(r as Record<string, unknown>));
}

// ------------------------------------------------------------
// Audit trail
// ------------------------------------------------------------

export interface SubscriptionEventInput {
  accountId: string;
  eventType: SubscriptionEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  endsAt?: Date | string | null;
  planName?: string | null;
  cycleLabel?: string | null;
  amount?: number | null;
  paymentRequestId?: string | null;
  actorUserId?: string | null;
  note?: string | null;
}

/**
 * Append to the audit trail.
 *
 * Fire-and-forget by design: a failed audit write must never abort the
 * business action that succeeded (activating a paid subscription is far
 * more important than logging that we did). Failures are logged loudly
 * so they surface in monitoring instead of vanishing.
 */
export async function logSubscriptionEvent(
  input: SubscriptionEventInput,
): Promise<void> {
  const admin = supabaseAdmin();
  const endsAt =
    input.endsAt instanceof Date
      ? input.endsAt.toISOString()
      : (input.endsAt ?? null);

  const { error } = await admin.from('subscription_events').insert({
    account_id: input.accountId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    ends_at: endsAt,
    plan_name: input.planName ?? null,
    cycle_label: input.cycleLabel ?? null,
    amount: input.amount ?? null,
    payment_request_id: input.paymentRequestId ?? null,
    actor_user_id: input.actorUserId ?? null,
    note: input.note ?? null,
  });

  if (error) {
    console.error(
      `[subscription] audit write failed (${input.eventType} on ${input.accountId}):`,
      error.message,
    );
  }
}

export async function listSubscriptionEvents(
  accountId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('subscription_events')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[subscription] event history read failed:', error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}
