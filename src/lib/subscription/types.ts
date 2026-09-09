// ============================================================
// Subscription + payment domain types (migration 050).
//
// These mirror the DB rows one-for-one. Anything derived (days left,
// per-month equivalents, savings) lives in `status.ts` / `plans.ts`
// so the row shapes here stay a faithful description of storage.
// ============================================================

/**
 * Lifecycle state stored on `accounts.subscription_status`.
 *
 *  - `trialing` — inside the free trial window
 *  - `active`   — a super admin approved a payment (or granted access
 *                 manually); `subscription_ends_at` is the deadline
 *  - `expired`  — trial or subscription lapsed; the CRM is blocked
 *  - `none`     — billing not applicable. Never written by the app;
 *                 an operator escape hatch for internal / demo /
 *                 grandfathered accounts that should never be gated.
 */
export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'none';

/** Review state of a submitted UPI payment. */
export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

/** Audit-trail event kinds written to `subscription_events`. */
export type SubscriptionEventType =
  | 'trial_started'
  | 'trial_extended'
  | 'payment_submitted'
  | 'payment_approved'
  | 'payment_rejected'
  | 'subscription_activated'
  | 'subscription_extended'
  | 'subscription_revoked'
  | 'subscription_expired';

// ============================================================
// Catalogue
// ============================================================

/**
 * Singleton config row. Holds the trial length, the UPI payee that
 * every generated QR pays, and every string rendered on
 * /upgrade-plan — so the whole page is admin-editable without a
 * deploy.
 */
export interface SubscriptionSettings {
  id: string;
  /** Master switch. When false nothing is gated and no trial UI shows. */
  is_enabled: boolean;
  trial_days: number;
  /** Days of access granted past the end date before blocking. */
  grace_days: number;

  upi_id: string | null;
  upi_payee_name: string | null;
  currency: string;

  page_heading: string;
  page_subheading: string | null;
  cycle_hint: string | null;
  selected_plan_label: string;
  total_label: string;
  save_label: string;
  continue_label: string;
  equals_label: string;

  // ---- Day-based pricing display (migration 055) ----
  /** Suffix after the big per-day figure, e.g. '/ day'. */
  per_day_label: string | null;
  /**
   * The line under the headline. Supports `{total}` and `{days}`, e.g.
   * '= {total} for {days} days' -> '= ₹900 for 30 days'.
   */
  price_equals_template: string | null;
  /** Heading above the ONE shared feature list below the cards. */
  features_heading: string | null;
  features_subheading: string | null;

  // ---- Custom / enquiry card (migration 055) ----
  // Not a billing cycle: it has no price or duration and cannot be
  // bought, so modelling it as a sellable cycle would force a special
  // case through every pricing and activation path.
  show_custom_plan: boolean;
  custom_plan_label: string | null;
  /** Shown where a price would be, e.g. "Let's talk". */
  custom_plan_price_text: string | null;
  custom_plan_body: string | null;
  custom_plan_cta_text: string | null;
  custom_plan_cta_link: string | null;
  /**
   * Bullet points for the Custom card. Raw JSONB in the SAME shape as
   * `SubscriptionPlan.features`, so it goes through
   * `normalisePlanFeatures` before rendering rather than needing a
   * second parser.
   */
  custom_plan_features: unknown;

  payment_heading: string;
  payment_instructions: string | null;
  submit_button_label: string;
  pending_review_message: string | null;
  support_note: string | null;

  /** Contains a literal `{days}` placeholder. See `formatTrialBanner`. */
  trial_banner_template: string;
  trial_banner_cta: string;
  expired_heading: string | null;
  free_plan_label: string;
  free_plan_subtitle: string;

  // ---- Trial-first onboarding (migration 20260824030000) ----
  // A new signup now picks a term BEFORE reaching the CRM, and may take
  // the free trial instead of paying immediately. These are the strings
  // that flow makes visible.
  /**
   * Master switch for the whole trial-first presentation: the two badges
   * on each plan card and the "Start with trial" button. FALSE leaves
   * `trial_days` alone but sells the plans as pay-now only.
   */
  show_trial_badges: boolean;
  /**
   * Badge on every plan card. Supports `{days}`, filled from
   * `trial_days` — see `formatTrialBadge`.
   *
   * Templated rather than literal on purpose: a hardcoded "14 days free
   * trial" becomes a lie the moment an operator changes `trial_days` two
   * tabs away, and it would be a lie directly next to the buy button.
   */
  trial_badge_template: string;
  /** Second badge: selecting a plan does not charge anything. */
  no_card_label: string;
  /** Secondary CTA beside "Continue to payment". */
  trial_cta_label: string;
  /** Optional small print under the two CTAs. */
  trial_cta_note: string | null;

  // ---- The chosen-but-unpaid plan card in Settings -> Billing ----
  upcoming_plan_label: string;
  upcoming_unpaid_label: string;
  pay_now_label: string;
  change_plan_label: string;

  // ---- member-blocked screen (migration 052) ----
  // Only the owner can pay, so blocked non-owner members get their own
  // screen instead of an unusable pricing page. These support the
  // `{account_name}` / `{owner_name}` / `{owner_email}` / `{plan_name}`
  // / `{expired_on}` placeholders — see `fillTemplate` in copy.ts.
  member_blocked_heading: string;
  member_blocked_body: string | null;
  member_blocked_note: string | null;
  member_blocked_contact_label: string;
  /** When false, the owner's name/email are withheld from the screen. */
  member_blocked_show_owner_contact: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * A duration option on the /upgrade-plan toggle.
 *
 * `months` is preferred over `duration_days` because it yields
 * calendar-accurate expiry. `duration_days` exists for cycles that
 * aren't whole months; when both are set, days wins (see
 * `resolveCycleDuration`).
 */
export interface BillingCycle {
  id: string;
  cycle_key: string;
  label: string;
  /** Price suffix, e.g. '/quarter'. */
  unit_label: string | null;
  months: number;
  duration_days: number | null;
  /** Pill shown beside the label on the toggle, e.g. '10%'. */
  discount_label: string | null;
  is_default: boolean;
  /**
   * Marks the cycle we steer customers towards. Kept separate from
   * `discount_label` so an operator never has to choose between showing
   * a saving and showing a recommendation — a cycle can carry both.
   */
  is_recommended: boolean;
  /** Badge text when recommended, e.g. 'Recommended'. */
  recommended_label: string | null;
  is_visible: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * One entry in a plan's feature list. The DB accepts bare strings too
 * (`["Feature A"]`); `normalisePlanFeatures` widens both shapes to
 * this interface so the UI only handles one.
 */
export interface PlanFeature {
  label: string;
  /**
   * Renders bold — used for the "All Growth Features +" lead-in that
   * introduces an inherited tier.
   */
  emphasis?: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  /** Raw JSONB. Pass through `normalisePlanFeatures` before rendering. */
  features: unknown;
  features_heading: string | null;
  is_highlighted: boolean;
  highlight_label: string | null;
  cta_text: string | null;
  is_visible: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlanPrice {
  id: string;
  plan_id: string;
  cycle_id: string;
  /** NUMERIC(12,2) — PostgREST returns it as a string. Coerce on read. */
  amount: number;
  compare_at_amount: number | null;
  /**
   * Display override for the per-day headline. NULL means derive it from
   * `amount / cycle.duration_days`, which is the norm — the override
   * exists only so an awkward division (950 / 30 = 31.67) can be shown
   * as a round number without changing what is actually charged.
   */
  per_day_amount: number | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Payments
// ============================================================

export interface PaymentRequest {
  id: string;
  account_id: string;
  user_id: string | null;

  plan_id: string | null;
  cycle_id: string | null;
  /** Denormalised so a receipt survives the plan being renamed/deleted. */
  plan_name_snapshot: string;
  cycle_label_snapshot: string;
  cycle_months: number | null;
  cycle_duration_days: number | null;

  /** Server-computed from the live price. Never client input. */
  expected_amount: number;
  /** Self-reported by the payer, so the admin can spot a mismatch. */
  paid_amount: number;
  currency: string;

  transaction_ref: string;
  payer_name: string;
  payer_mobile: string;
  payer_upi_id: string | null;
  payer_bank: string | null;
  paid_at: string | null;
  payment_method: string;
  reference_note: string | null;
  payer_note: string | null;
  screenshot_url: string | null;

  status: PaymentRequestStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  activated_from: string | null;
  activated_until: string | null;

  created_at: string;
  updated_at: string;
}

export interface SubscriptionEvent {
  id: string;
  account_id: string;
  event_type: SubscriptionEventType;
  from_status: SubscriptionStatus | null;
  to_status: SubscriptionStatus | null;
  ends_at: string | null;
  plan_name: string | null;
  cycle_label: string | null;
  amount: number | null;
  payment_request_id: string | null;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
}

// ============================================================
// Customer-facing billing history
//
// These two shapes are the ONLY ones that may cross to a customer's
// browser, and they are narrow on purpose. `payment_requests` and
// `subscription_events` both hold operator-only columns, and the
// audit trail in particular is service-role-only with zero RLS
// policies precisely because it was built as an internal tool.
//
// Excluded deliberately, in both shapes:
//   reviewed_by_user_id / actor_user_id — internal ids, and naming a
//     platform admin to a customer leaks staff identity
//   subscription_events.note — free text one operator writes for
//     another ("comped, complained on WhatsApp"); NOT customer copy.
//     `payment_requests.review_note` IS customer copy and is kept.
//   from_status / to_status — internal state machine values; the
//     customer gets a plain-language label instead
// ============================================================

/** One submitted payment, as its payer may see it. */
export interface CustomerPaymentRecord {
  id: string;
  /** Short human reference for support conversations, e.g. "A1B2C3D4". */
  reference: string;
  planName: string;
  cycleLabel: string;
  /** Price in force when this was submitted. */
  expectedAmount: number;
  /** What the payer reported transferring. */
  paidAmount: number;
  currency: string;
  transactionRef: string;
  payerName: string;
  payerUpiId: string | null;
  payerBank: string | null;
  /** When the payer says the transfer happened. */
  paidAt: string | null;
  status: PaymentRequestStatus;
  /** The reviewing admin's message TO the customer. */
  reviewNote: string | null;
  reviewedAt: string | null;
  /** Access window this payment bought, once approved. */
  activatedFrom: string | null;
  activatedUntil: string | null;
  createdAt: string;
}

/**
 * A change to the plan that did NOT come from one of the customer's own
 * payments — trial start, an extension granted by support, an expiry.
 *
 * Payment-derived events are excluded at the query level rather than
 * here, so the payments list stays the single place a receipt appears.
 */
export interface CustomerPlanActivity {
  id: string;
  eventType: SubscriptionEventType;
  planName: string | null;
  cycleLabel: string | null;
  /** Which window moved. Null on rows written before migration 081. */
  windowKind: 'paid' | 'trial' | null;
  durationDays: number | null;
  durationMonths: number | null;
  /** Access end date after this change. */
  endsAt: string | null;
  createdAt: string;
}

/** One page of results plus what the pager needs to render itself. */
export interface CustomerHistoryPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** Rows matching the query, across all pages. */
  total: number;
  totalPages: number;
}

/** Everything the Billing & plan history section renders. */
export interface BillingHistoryPayload {
  payments: CustomerHistoryPage<CustomerPaymentRecord>;
  activity: CustomerHistoryPage<CustomerPlanActivity>;
  /**
   * Computed over EVERY payment, never over the current page — a "total
   * paid" that changed when you clicked to page 2 would be a bug, and a
   * subtle one, because each individual page total looks plausible.
   */
  summary: {
    /**
     * Lifetime approved spend, split BY CURRENCY. A single total would
     * be wrong the moment an account has paid in two currencies, and
     * `subscription_settings.currency` is admin-editable at any time,
     * so historical rows genuinely can disagree.
     */
    totalsByCurrency: { currency: string; amount: number }[];
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
  };
}

// ============================================================
// Account-side view
// ============================================================

/**
 * The subscription columns on `accounts`. Kept as its own interface
 * because Proxy selects exactly this subset (folded into the
 * ban-check query) and nothing more.
 */
/**
 * Minimal owner identity for the member-blocked screen, so a member
 * knows who to chase. Sourced from the owner's `profiles` row, which
 * account members can already read under the `profiles_select` policy —
 * this exposes nothing new.
 */
export interface AccountOwnerContact {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export interface AccountSubscriptionRow {
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_plan_id: string | null;
  subscription_plan_name: string | null;
  subscription_cycle_label: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  subscription_note: string | null;

  // ---- Chosen but NOT paid for (migration 20260824030000) ----
  //
  // Deliberately separate from `subscription_plan_id`, which is what the
  // account HOLDS. These record what it WANTS, so trial expiry can send
  // the customer to the right payment screen instead of a generic price
  // list, and Billing can show an unpaid upcoming plan.
  //
  // Both ids are needed to price anything, so a row with only one set is
  // treated everywhere as no selection at all.
  selected_plan_id: string | null;
  selected_cycle_id: string | null;
  plan_selected_at: string | null;
  /**
   * TRUE until this account has been through plan selection. Every
   * account that existed before the migration was backfilled to FALSE,
   * which is what keeps the new onboarding to new signups only.
   */
  plan_selection_required: boolean;
}

// ============================================================
// API payloads
// ============================================================

/** A plan with its price resolved for one specific cycle. */
export interface PlanWithPrice {
  plan: SubscriptionPlan;
  features: PlanFeature[];
  /** Absent when the admin hasn't priced this plan for this cycle. */
  price: SubscriptionPlanPrice | null;
}

/**
 * Everything /upgrade-plan needs, in one round trip. `settings` is the
 * client-safe projection — see `toPublicSettings`.
 */
export interface PlansBundle {
  settings: PublicSubscriptionSettings;
  cycles: BillingCycle[];
  plans: SubscriptionPlan[];
  prices: SubscriptionPlanPrice[];
}

/**
 * A plan the customer has chosen but not paid for, resolved for display.
 *
 * Only ever produced when the (plan, cycle) pair still exists and is
 * still priced — see `getSelectedPlan`. So a non-null value is always
 * safe to render a "Pay now" button against, and null genuinely means
 * "ask them to choose again".
 */
export interface SelectedPlanSummary {
  planId: string;
  planName: string;
  cycleId: string;
  cycleLabel: string;
  /** Coerced from PostgREST's NUMERIC-as-string. */
  amount: number;
  currency: string;
  selectedAt: string | null;
}

/**
 * Settings minus anything an end user has no business reading. Right
 * now that's only bookkeeping columns — the UPI id IS needed by the
 * payment screen, so it stays.
 */
export type PublicSubscriptionSettings = Omit<
  SubscriptionSettings,
  'created_at' | 'updated_at'
>;

/**
 * Server-authoritative quote for one (plan, cycle) pair. The amount
 * here is what the UPI QR encodes and what gets persisted as
 * `expected_amount` — the client never supplies it.
 */
export interface PaymentQuote {
  planId: string;
  planName: string;
  cycleId: string;
  cycleLabel: string;
  cycleMonths: number;
  cycleDurationDays: number | null;
  amount: number;
  currency: string;
  /** UPI deep link (`upi://pay?...`). */
  upiUri: string;
  /** Inline SVG markup for the QR. */
  qrSvg: string;
  upiId: string;
  payeeName: string;
  /** The `tn` note encoded in the QR; echoed back on submission. */
  referenceNote: string;
}
