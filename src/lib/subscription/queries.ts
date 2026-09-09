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
  CustomerHistoryPage,
  CustomerPaymentRecord,
  CustomerPlanActivity,
  PaymentRequest,
  PlansBundle,
  PublicSubscriptionSettings,
  SelectedPlanSummary,
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
  per_day_label: '/ day',
  price_equals_template: '= {total} for {days} days',
  features_heading: 'Every plan includes everything',
  features_subheading: null,
  show_custom_plan: false,
  custom_plan_label: 'Custom',
  custom_plan_price_text: null,
  custom_plan_body: null,
  custom_plan_cta_text: null,
  custom_plan_cta_link: null,
  custom_plan_features: [],
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
  show_trial_badges: true,
  trial_badge_template: '{days} days free trial',
  no_card_label: 'No card or payment required',
  trial_cta_label: 'Start with trial',
  trial_cta_note: null,
  upcoming_plan_label: 'Upcoming plan',
  upcoming_unpaid_label: 'Not paid',
  pay_now_label: 'Pay now',
  change_plan_label: 'Change plan',
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
    is_recommended: Boolean(row.is_recommended),
    recommended_label: (row.recommended_label as string | null) ?? null,
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
    per_day_amount: toNullableAmount(row.per_day_amount),
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
  options: { includeHidden?: boolean } = {}
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
    console.error(
      '[subscription] cycles read failed:',
      cyclesRes.error.message
    );
  }
  if (plansRes.error) {
    console.error('[subscription] plans read failed:', plansRes.error.message);
  }
  if (pricesRes.error) {
    console.error(
      '[subscription] prices read failed:',
      pricesRes.error.message
    );
  }

  return {
    settings,
    cycles: (cyclesRes.data ?? []).map((r) =>
      normaliseCycle(r as Record<string, unknown>)
    ),
    plans: (plansRes.data ?? []) as SubscriptionPlan[],
    prices: (pricesRes.data ?? []).map((r) =>
      normalisePrice(r as Record<string, unknown>)
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
  cycleId: string
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
      `${plan.name} is not available on the ${cycle.label} cycle`
    );
  }

  const amount = toAmount(price.amount);
  if (!(amount > 0)) {
    // A zero/negative price would produce a QR for ₹0, which UPI apps
    // either reject or silently treat as "enter your own amount" —
    // exactly the ambiguity manual verification cannot resolve.
    throw new QuoteError(
      `${plan.name} has no valid price configured for ${cycle.label}`
    );
  }

  return {
    planId: plan.id,
    planName: plan.name,
    cycleId: cycle.id,
    cycleLabel: cycle.label,
    cycleMonths: Number(cycle.months ?? 0),
    cycleDurationDays:
      cycle.duration_days == null ? null : Number(cycle.duration_days),
    amount,
    currency: settings.currency || 'INR',
  };
}

/** Preview the window a quote would grant, for the confirmation UI. */
export function previewQuoteWindow(
  quote: Pick<ResolvedQuote, 'cycleMonths' | 'cycleDurationDays'>,
  from: Date = new Date()
): Date {
  return addDuration(
    from,
    resolveCycleDuration({
      months: quote.cycleMonths,
      duration_days: quote.cycleDurationDays,
    })
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
  'subscription_status, trial_started_at, trial_ends_at, subscription_plan_id, subscription_plan_name, subscription_cycle_label, subscription_started_at, subscription_ends_at, subscription_note, selected_plan_id, selected_cycle_id, plan_selected_at, plan_selection_required' as const;

export async function getAccountSubscription(
  accountId: string
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
 * Rejection of an unusable plan choice.
 *
 * Its own class rather than reusing `SubscriptionMutationError`, which
 * lives in `activate.ts` — and `activate.ts` already imports from this
 * module, so borrowing it would make the two files circular. Carries a
 * numeric `status`, which is all `toBillingErrorResponse` needs to turn
 * it into a response with the message intact.
 */
export class PlanSelectionError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'PlanSelectionError';
  }
}

/**
 * A saved plan choice, resolved into the names and price the UI shows.
 *
 * Returns null unless BOTH ids are set AND both rows still exist AND the
 * pair is still priced. That last condition matters: an admin can delete
 * a cycle or unprice a plan after a customer chose it, and a "Pay now"
 * button that leads to an unpriceable quote is worse than no button —
 * the caller renders "choose a plan" instead, which is the truth.
 */
export async function getSelectedPlan(
  accountId: string
): Promise<SelectedPlanSummary | null> {
  const admin = supabaseAdmin();

  const { data: account } = await admin
    .from('accounts')
    .select('selected_plan_id, selected_cycle_id, plan_selected_at')
    .eq('id', accountId)
    .maybeSingle();

  const planId = account?.selected_plan_id as string | null | undefined;
  const cycleId = account?.selected_cycle_id as string | null | undefined;
  // Half a selection cannot be priced, so it is not a selection.
  if (!planId || !cycleId) return null;

  const [{ data: plan }, { data: cycle }, { data: price }] = await Promise.all([
    admin
      .from('subscription_plans')
      .select('id, name')
      .eq('id', planId)
      .maybeSingle(),
    admin
      .from('billing_cycles')
      .select('id, label, months, duration_days')
      .eq('id', cycleId)
      .maybeSingle(),
    admin
      .from('subscription_plan_prices')
      .select('amount, is_visible')
      .eq('plan_id', planId)
      .eq('cycle_id', cycleId)
      .maybeSingle(),
  ]);

  // The plan or cycle was deleted (both FKs are ON DELETE SET NULL, but
  // the row can also have been made invisible), or the pair was never
  // priced. Either way there is nothing to charge for.
  if (!plan || !cycle || !price || price.is_visible === false) return null;

  const settings = await getSubscriptionSettings();

  return {
    planId: plan.id as string,
    planName: plan.name as string,
    cycleId: cycle.id as string,
    cycleLabel: cycle.label as string,
    amount: toAmount(price.amount),
    currency: settings.currency,
    selectedAt: (account?.plan_selected_at as string | null) ?? null,
  };
}

/**
 * Record the plan a customer chose, without charging them.
 *
 * Called by both routes out of /upgrade-plan — "Continue to payment" and
 * "Start with trial" — because in both cases we now know what they want.
 * Storing it on the pay path too is what makes an abandoned checkout
 * recoverable: they land back on their chosen term rather than a blank
 * price list.
 *
 * Clearing `plan_selection_required` here (rather than on first
 * dashboard visit) is deliberate: the flag means "has not chosen yet",
 * and this is the moment that stops being true.
 *
 * Validates against the catalogue with the service role because the
 * catalogue tables are RLS-closed to clients — the browser cannot read a
 * price, so it must not be trusted to name a valid (plan, cycle) pair.
 */
export async function setSelectedPlan(
  accountId: string,
  planId: string,
  cycleId: string
): Promise<SelectedPlanSummary> {
  const admin = supabaseAdmin();

  const [{ data: plan }, { data: cycle }, { data: price }] = await Promise.all([
    admin
      .from('subscription_plans')
      .select('id, name, is_visible')
      .eq('id', planId)
      .maybeSingle(),
    admin
      .from('billing_cycles')
      .select('id, label, is_visible')
      .eq('id', cycleId)
      .maybeSingle(),
    admin
      .from('subscription_plan_prices')
      .select('amount, is_visible')
      .eq('plan_id', planId)
      .eq('cycle_id', cycleId)
      .maybeSingle(),
  ]);

  // Rejected rather than stored: a selection we cannot price would put a
  // dead "Pay now" button in Billing and a broken redirect at trial end.
  if (!plan || plan.is_visible === false) {
    throw new PlanSelectionError('That plan is not available.', 400);
  }
  if (!cycle || cycle.is_visible === false) {
    throw new PlanSelectionError('That billing term is not available.', 400);
  }
  if (!price || price.is_visible === false) {
    throw new PlanSelectionError(
      'That plan and billing term combination is not priced.',
      400
    );
  }

  const { error } = await admin
    .from('accounts')
    .update({
      selected_plan_id: planId,
      selected_cycle_id: cycleId,
      plan_selected_at: new Date().toISOString(),
      plan_selection_required: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (error) {
    throw new PlanSelectionError(
      `Could not save your plan choice: ${error.message}`,
      500
    );
  }

  const settings = await getSubscriptionSettings();

  return {
    planId: plan.id as string,
    planName: plan.name as string,
    cycleId: cycle.id as string,
    cycleLabel: cycle.label as string,
    amount: toAmount(price.amount),
    currency: settings.currency,
    selectedAt: new Date().toISOString(),
  };
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
  accountId: string
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
  accountId: string
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
  accountId: string
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

/**
 * Project a stored payment row down to what its payer may see.
 *
 * Shared by every customer-facing route that returns payments, so the
 * projection cannot drift between them. That matters more than the
 * duplication it saves: `payment_requests` carries
 * `reviewed_by_user_id`, and a second hand-written projection is
 * exactly how that ends up on the wire one day.
 */
export function toCustomerPaymentRecord(
  row: PaymentRequest
): CustomerPaymentRecord {
  return {
    id: row.id,
    // First segment of the UUID, uppercased. Enough to disambiguate a
    // customer's own handful of payments when they email support, and
    // it needs no extra column. Not shown as an invoice number, because
    // it is not sequential and pretending otherwise invites questions
    // about the gaps.
    reference: row.id.split('-')[0]?.toUpperCase() ?? row.id,
    planName: row.plan_name_snapshot,
    cycleLabel: row.cycle_label_snapshot,
    expectedAmount: row.expected_amount,
    paidAmount: row.paid_amount,
    currency: row.currency,
    transactionRef: row.transaction_ref,
    payerName: row.payer_name,
    payerUpiId: row.payer_upi_id,
    payerBank: row.payer_bank,
    paidAt: row.paid_at,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    activatedFrom: row.activated_from,
    activatedUntil: row.activated_until,
    createdAt: row.created_at,
  };
}

/** Page size for both customer history lists. */
export const CUSTOMER_HISTORY_PAGE_SIZE = 10;

/** Clamp a page number coming off a query string. */
function safePage(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * One page of this account's payments, newest first.
 *
 * Paged in the DATABASE with `count: 'exact'` + `.range()`, not by
 * fetching everything and slicing. The super-admin events route
 * over-fetches 1000 rows and pages in memory, but it has to — it filters
 * and text-searches after the query. Nothing here does, so there is no
 * reason to ship rows the customer will not see, and no silent ceiling
 * at row 1000.
 */
export async function listCustomerPaymentsPage(
  accountId: string,
  page: unknown = 1,
  pageSize: number = CUSTOMER_HISTORY_PAGE_SIZE
): Promise<CustomerHistoryPage<CustomerPaymentRecord>> {
  const admin = supabaseAdmin();
  const current = safePage(page);
  const from = (current - 1) * pageSize;

  const { data, error, count } = await admin
    .from('payment_requests')
    .select('*', { count: 'exact' })
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error('[subscription] payment page read failed:', error.message);
    return { items: [], page: current, pageSize, total: 0, totalPages: 1 };
  }

  const total = count ?? 0;
  return {
    items: (data ?? [])
      .map((r) => normalisePaymentRequest(r as Record<string, unknown>))
      .map(toCustomerPaymentRecord),
    page: current,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Lifetime payment totals for this account, across every page.
 *
 * A separate query rather than a sum over the current page, because the
 * summary must not move when the customer pages. Selects three columns
 * and no row bodies, so it stays cheap even on an account with a long
 * history.
 */
export async function getCustomerPaymentSummary(accountId: string): Promise<{
  totalsByCurrency: { currency: string; amount: number }[];
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
}> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('payment_requests')
    .select('status, paid_amount, currency')
    .eq('account_id', accountId);

  const empty = {
    totalsByCurrency: [],
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  };

  if (error) {
    console.error('[subscription] payment summary read failed:', error.message);
    return empty;
  }

  const totals = new Map<string, number>();
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const status = String(row.status);

    if (status === 'approved') approvedCount += 1;
    else if (status === 'pending') pendingCount += 1;
    else if (status === 'rejected') rejectedCount += 1;

    // Only APPROVED money counts toward a total paid. A pending row is
    // money the customer says they sent that nobody has verified, and a
    // rejected one is explicitly not revenue — including either would
    // show a figure the business does not agree with.
    if (status !== 'approved') continue;

    const currency = String(row.currency || 'INR');
    // PostgREST serialises NUMERIC as a string; `toAmount` is what stops
    // this addition silently concatenating.
    totals.set(
      currency,
      (totals.get(currency) ?? 0) + toAmount(row.paid_amount)
    );
  }

  return {
    totalsByCurrency: [...totals.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount),
    approvedCount,
    pendingCount,
    rejectedCount,
  };
}

/**
 * Plan changes the customer did NOT pay for directly: trial start,
 * support-granted time, expiry, a block.
 *
 * Two filters do the work, and both are deliberate:
 *
 *   1. An event-type allowlist. `payment_submitted` / `payment_approved`
 *      / `payment_rejected` are excluded because every one of them is
 *      already a row in the payments list — showing both would make one
 *      payment look like two events.
 *
 *   2. `payment_request_id IS NULL`. `subscription_activated` and
 *      `subscription_extended` are written BOTH when an admin approves a
 *      payment and when an admin comps time by hand; the event type
 *      alone cannot tell them apart. Keeping only the rows with no
 *      linked payment leaves exactly the changes that have no receipt,
 *      which is the whole point of this list.
 *
 * Service role because `subscription_events` has RLS on with no
 * policies — a client read returns nothing by design. Account scoping
 * is therefore this function's responsibility, not the database's.
 */
export async function listCustomerPlanActivity(
  accountId: string,
  page: unknown = 1,
  pageSize: number = CUSTOMER_HISTORY_PAGE_SIZE
): Promise<CustomerHistoryPage<CustomerPlanActivity>> {
  const CUSTOMER_VISIBLE_EVENTS: SubscriptionEventType[] = [
    'trial_started',
    'trial_extended',
    'subscription_activated',
    'subscription_extended',
    'subscription_revoked',
    'subscription_expired',
  ];

  const admin = supabaseAdmin();
  const current = safePage(page);
  const from = (current - 1) * pageSize;

  const { data, error, count } = await admin
    .from('subscription_events')
    // Column list, not `*`. An added operator-only column must not
    // silently start shipping to customers.
    .select(
      'id, event_type, plan_name, cycle_label, window_kind, duration_days, duration_months, ends_at, created_at',
      { count: 'exact' }
    )
    .eq('account_id', accountId)
    .in('event_type', CUSTOMER_VISIBLE_EVENTS)
    .is('payment_request_id', null)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error('[subscription] plan activity read failed:', error.message);
    return { items: [], page: current, pageSize, total: 0, totalPages: 1 };
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        eventType: row.event_type as SubscriptionEventType,
        planName: (row.plan_name as string | null) ?? null,
        cycleLabel: (row.cycle_label as string | null) ?? null,
        windowKind: (row.window_kind as 'paid' | 'trial' | null) ?? null,
        durationDays:
          row.duration_days == null ? null : Number(row.duration_days),
        durationMonths:
          row.duration_months == null ? null : Number(row.duration_months),
        endsAt: (row.ends_at as string | null) ?? null,
        createdAt: String(row.created_at ?? ''),
      };
    }),
    page: current,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listPaymentRequestsForAccount(
  accountId: string,
  limit = 20
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
  return (data ?? []).map((r) =>
    normalisePaymentRequest(r as Record<string, unknown>)
  );
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
  /**
   * How much time this event granted, as the operator requested it
   * (migration 081).
   *
   * Deliberately the REQUESTED duration, not the difference between the
   * old and new end dates: those diverge, because a renewal extends from
   * the existing end date while a lapsed account restarts from today. Only
   * this says what was actually chosen.
   */
  durationMonths?: number | null;
  durationDays?: number | null;
  /** The end date this event replaced, so the move reads on its own. */
  previousEndsAt?: Date | string | null;
  /**
   * Which window moved. `subscription_extended` cannot distinguish paid
   * time from trial days on its own, and they are separate fields in the
   * admin UI.
   */
  windowKind?: 'paid' | 'trial' | null;
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
  input: SubscriptionEventInput
): Promise<void> {
  const admin = supabaseAdmin();
  const iso = (v: Date | string | null | undefined): string | null =>
    v instanceof Date ? v.toISOString() : (v ?? null);

  const { error } = await admin.from('subscription_events').insert({
    account_id: input.accountId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    ends_at: iso(input.endsAt),
    plan_name: input.planName ?? null,
    cycle_label: input.cycleLabel ?? null,
    amount: input.amount ?? null,
    payment_request_id: input.paymentRequestId ?? null,
    actor_user_id: input.actorUserId ?? null,
    note: input.note ?? null,
    // Migration 081. Nullable throughout: an event that moves a date
    // without a duration (revoke, expire, an exact-date correction) has
    // none, and that absence is meaningful rather than missing data.
    duration_months: input.durationMonths ?? null,
    duration_days: input.durationDays ?? null,
    previous_ends_at: iso(input.previousEndsAt),
    window_kind: input.windowKind ?? null,
  });

  if (error) {
    console.error(
      `[subscription] audit write failed (${input.eventType} on ${input.accountId}):`,
      error.message
    );
  }
}

export async function listSubscriptionEvents(
  accountId: string,
  limit = 50
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
