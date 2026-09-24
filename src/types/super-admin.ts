// ============================================================
// Super Admin TypeScript interfaces.
//
// Covers all data structures used by the super admin panel:
// - Platform metrics (fn_platform_metrics RPC)
// - Account summaries (v_platform_accounts_summary view)
// - Account deep dive (fn_account_deep_dive RPC)
// - Signup growth data (fn_signups_over_time RPC)
// - CMS content types (site_settings, landing_sections, etc.)
// ============================================================

import type { MemberPermissions } from '@/types';

// ============================================================
// Analytics
// ============================================================

export interface PlatformMetrics {
  total_accounts: number;
  total_users: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  messages_today: number;
  messages_7d: number;
  new_accounts_today: number;
  new_accounts_7d: number;
  new_accounts_30d: number;
  banned_accounts: number;
  total_contacts: number;
  total_broadcasts: number;
  total_automations: number;
  total_deals_value: number;
  connected_whatsapp: number;
  disconnected_whatsapp: number;
}

export interface AccountSummary {
  account_id: string;
  account_name: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  account_created_at: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
  /** Captured at signup. Null for accounts created before the field existed. */
  owner_phone: string | null;
  owner_avatar_url: string | null;
  member_count: number;
  contact_count: number;
  conversation_count: number;
  messages_30d: number;
  whatsapp_status: 'connected' | 'disconnected' | null;
  last_activity_at: string | null;
}

export interface AccountFilters {
  status?: 'all' | 'active' | 'inactive' | 'banned';
  whatsapp?: 'all' | 'connected' | 'disconnected';
  search?: string;
  sortBy?: 'newest' | 'oldest' | 'most_active' | 'most_members';
}

export interface AccountMemberDetail {
  user_id: string;
  full_name: string;
  email: string;
  /**
   * E.164 contact number captured at signup. Super-admin surfaces only —
   * no tenant-facing screen renders it. Null for members who predate the
   * field or who an admin created directly (they never saw the form).
   */
  phone: string | null;
  avatar_url: string | null;
  account_role: 'owner' | 'member';
  permissions: MemberPermissions | null;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
  is_online: boolean;
}

export interface AccountDeepDive {
  account: {
    id: string;
    name: string;
    is_banned: boolean;
    banned_at: string | null;
    banned_reason: string | null;
    created_at: string;
    updated_at: string;
  };
  members: AccountMemberDetail[];
  stats: {
    contact_count: number;
    conversation_count: number;
    active_conversations: number;
    messages_total: number;
    messages_30d: number;
    active_automations: number;
    total_automations: number;
    /** Broadcasts that reached `status = 'sent'`. Delivery only. */
    broadcasts_sent: number;
    /**
     * Every broadcast the tenant created, whatever the outcome.
     *
     * This is what the header shows, not `broadcasts_sent` — the tenant's own
     * Broadcasts page lists every run, so a header tile counting only sent
     * ones disagrees with it (verified: an account with 4 broadcasts, 1
     * failed, would have read 3).
     */
    broadcasts_total: number;
    templates_total: number;
    /** Templates Meta has approved, i.e. the ones actually usable. */
    templates_approved: number;
    deals_open_value: number;
    deals_open_count: number;
  };
  whatsapp_config: SuperAdminWhatsAppConfig | null;
}

/**
 * The WhatsApp connection as `fn_account_deep_dive` actually returns it.
 *
 * Deliberately NOT the app-wide `WhatsAppConfig`. That type declares
 * `access_token: string`, which the RPC omits on purpose (migration 078 exists
 * because `row_to_json(wc.*)` was shipping the encrypted token and the webhook
 * verify token to the browser), and it lacks half the operational columns the
 * RPC does return. Reusing it meant the fields present were untyped and the one
 * field typed as required was absent.
 *
 * Everything here is safe to send to a super-admin browser: identifiers,
 * timestamps and Meta's own state. No secrets.
 */
export interface SuperAdminWhatsAppConfig {
  id: string;
  account_id: string;
  user_id: string | null;
  /** Meta asset id. NEVER render this as a phone number. */
  phone_number_id: string;
  /** The real number, in Meta's formatting. Null until first sync. */
  display_phone_number: string | null;
  /** Business name Meta shows customers. */
  verified_name: string | null;
  waba_id: string | null;
  /** Our own flag: 'connected' | 'disconnected'. Not Meta's phone status. */
  status: string | null;
  connected_at: string | null;
  /** How they connected: 'embedded_signup' | 'manual'. */
  connection_source: string | null;
  /** Which API surface: 'cloud_api' | 'coexistence'. */
  connection_mode: string | null;
  /** First proof a Coexistence pairing is live (an `smb_message_echoes`). */
  coexistence_detected_at: string | null;
  /** Last successful `POST /{phone_number_id}/register`. */
  registered_at: string | null;
  /** Last successful `POST /{waba_id}/subscribed_apps`. Null = no webhooks. */
  subscribed_apps_at: string | null;
  last_registration_error: string | null;
  /** Meta's raw disconnect event, e.g. PARTNER_REMOVED. */
  disconnect_event: string | null;
  /** Meta's raw reason, e.g. PRIMARY_INACTIVITY. */
  disconnect_reason: string | null;
  disconnected_at: string | null;
  /** Null means no known expiry (a permanent system-user token). */
  token_expires_at: string | null;
  /** When template analytics were confirmed on. Null = never. */
  insights_enabled_at: string | null;
  /** Whether a two-step PIN is stored. The PIN itself is never sent. */
  has_two_step_pin: boolean;
}

/**
 * Live Meta state for one account, from
 * `GET /api/super-admin/accounts/{id}/whatsapp-health`.
 *
 * Separate from the deep-dive payload because it costs several Meta round
 * trips and needs the account's decrypted token, so the page renders without
 * it and fills this in afterwards.
 */
export interface SuperAdminWhatsAppHealth {
  /** Null when the account has no connection, or Meta could not be reached. */
  phone: {
    display_phone_number: string | null;
    verified_name: string | null;
    /** GREEN | YELLOW | RED | UNKNOWN */
    quality_rating: string | null;
    /** Meta's phone status, e.g. CONNECTED | PENDING | FLAGGED. */
    status: string | null;
    name_status: string | null;
    code_verification_status: string | null;
    platform_type: string | null;
    /** True when the number is also live on the WhatsApp Business app. */
    is_on_biz_app: boolean | null;
  } | null;
  waba: {
    name: string | null;
    account_review_status: string | null;
    business_verification_status: string | null;
    /** Meta's own insights flag, which can disagree with our stored one. */
    is_enabled_for_insights: boolean | null;
    currency: string | null;
    timezone_id: string | null;
  } | null;
  /** Meta's messaging verdict plus every reason it is not fully available. */
  sending: {
    readiness: 'available' | 'limited' | 'blocked' | 'unknown';
    /**
     * Meta's payment verdict — NOT "a card exists".
     *
     * There is no public Graph field for whether a payment method is
     * attached, so this reports whether Meta is currently raising a
     * payment-related blocker. `no_issue` means Meta is not complaining,
     * which is the strongest honest claim available.
     */
    payment: 'action_required' | 'no_issue' | 'unknown';
    verification:
      'verified' | 'pending' | 'rejected' | 'not_started' | 'unknown';
    /** Every blocker/limitation Meta reported, grouped by subject. */
    issues: {
      subject: string;
      description: string;
      solution: string | null;
      severity: 'blocked' | 'limited';
      code: number | null;
    }[];
  };
  /**
   * Whether OUR app is subscribed to this WABA's webhooks, per Meta.
   *
   * Asked of Meta rather than read from `whatsapp_config.subscribed_apps_at`,
   * which only records calls we made and is null on every account that
   * connected before that column was written. Null means we could not ask —
   * deliberately distinct from `false`, which would otherwise raise a false
   * "inbound messages are being lost" alarm on a healthy account.
   */
  webhook_subscribed: boolean | null;
  limits: {
    /** Messaging tier label, e.g. "1,000 / 24h". */
    messaging: string | null;
    /** Throughput level, e.g. STANDARD. */
    throughput: string | null;
    /** Display-name review verdict, human-readable. */
    nameReview: { label: string; detail: string | null } | null;
  };
  /** Set when Meta could not be reached at all; everything above is null. */
  error: string | null;
  /** When this snapshot was taken. */
  checked_at: string;
}

export interface SignupDataPoint {
  date: string;
  new_accounts: number;
  new_users: number;
}

// ============================================================
// Health Dashboard
// ============================================================

export interface HealthMetrics {
  total_messages: number;
  messages_today: number;
  messages_7d: number;
  total_contacts: number;
  total_conversations: number;
  total_accounts: number;
  active_accounts: number;
  banned_accounts: number;
  total_ai_tokens: number;
  ai_requests_today: number;
  total_automation_runs: number;
  automation_runs_today: number;
  total_broadcasts: number;
  total_users: number;
  connected_whatsapp: number;
}

export interface MessageVolumePoint {
  date: string;
  count: number;
}

export interface ActivityLogEntry {
  type:
    | 'account_created'
    | 'broadcast_sent'
    | 'automation_triggered'
    | 'message_sent';
  description: string;
  account_name: string;
  timestamp: string;
}

export interface TableStat {
  table_name: string;
  row_count: number;
}

export interface HealthDashboardData {
  metrics: HealthMetrics;
  message_volume: MessageVolumePoint[];
  activity_feed: ActivityLogEntry[];
  table_stats: TableStat[];
}

// ============================================================
// Newsletter Subscribers
// ============================================================

export type NewsletterStatus =
  'pending' | 'confirmed' | 'bounced' | 'unsubscribed';

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: NewsletterStatus;
  confirm_token: string | null;
  email_sent: boolean;
  email_sent_at: string | null;
  confirmed_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// CMS Content Types
// ============================================================

export interface NavLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export interface SiteSettings {
  id: string;
  site_name: string;
  tagline: string;
  site_description: string | null;
  logo_url: string | null;
  logo_dark_url?: string | null;
  favicon_url: string | null;
  full_logo_url?: string | null;
  meta_partner_badge_url?: string | null;
  /**
   * Landing hero background video (public S3 URL). Null/absent means the
   * hero renders on its static background, which is also the fallback while
   * the video loads. Desktop only - see HeroBackgroundVideo.
   */
  hero_video_url?: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  canonical_url: string | null;
  social_twitter: string | null;
  social_linkedin: string | null;
  social_github: string | null;
  social_instagram: string | null;
  social_youtube: string | null;
  support_email: string | null;
  sales_email: string | null;
  privacy_email: string | null;
  legal_email: string | null;
  copyright_text: string | null;
  show_social_icons: boolean;
  show_newsletter: boolean;
  no_index: boolean;
  json_ld_schema: string | null;
  header_links: NavLink[];
  footer_links: FooterColumn[];
  contact_notification_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface LandingSection {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  body_text: string | null;
  cta_primary_text: string | null;
  cta_primary_link: string | null;
  cta_secondary_text: string | null;
  cta_secondary_link: string | null;
  background_style: string | null;
  background_image_url: string | null;
  image_url: string | null;
  images: string[];
  images_secondary: string[];
  is_visible: boolean;
  position: number;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LandingFeature {
  id: string;
  icon_name: string;
  title: string;
  description: string;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandingTestimonial {
  id: string;
  quote: string;
  author_name: string;
  author_role: string | null;
  author_company: string | null;
  author_avatar_url: string | null;
  rating: number;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandingPricingTier {
  id: string;
  name: string;
  price_monthly: string | null;
  price_yearly: string | null;
  price_subtitle: string | null;
  features: string[];
  is_highlighted: boolean;
  highlight_label: string | null;
  cta_text: string | null;
  cta_link: string | null;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandingIntegration {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LegalPage {
  id: string;
  slug: string;
  title: string;
  content_markdown: string;
  is_published: boolean;
  last_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface LandingImage {
  id: string;
  image_key: string;
  url: string;
  alt_text: string;
  created_at: string;
  updated_at: string;
}

export interface LandingFaq {
  id: string;
  question: string;
  answer: string;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactPageSettings {
  id: string;
  heading: string;
  subheading: string;
  office_address: string | null;
  phone_number: string | null;
  email_address: string | null;
  working_hours: string | null;
  form_heading: string | null;
  form_subheading: string | null;
  map_embed_url: string | null;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Docs / resource centre (migration 054)
// ============================================================

/** Singleton copy for the public /docs page. */
export interface DocsPageSettings {
  id: string;
  eyebrow: string | null;
  heading: string;
  subheading: string | null;

  show_search: boolean;
  search_placeholder: string | null;

  /** Legal docs are read live from `legal_pages`, never copied here. */
  show_legal_section: boolean;
  legal_heading: string | null;
  legal_subheading: string | null;

  show_support_section: boolean;
  support_heading: string | null;
  support_body: string | null;
  support_cta_text: string | null;
  support_cta_link: string | null;

  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocsCategory {
  id: string;
  title: string;
  description: string | null;
  /** Lucide icon name, resolved through an allowlist in the component. */
  icon_name: string;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocsResource {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  href: string;
  icon_name: string | null;
  /** Small pill, e.g. "New", "Beta", "Owner only". */
  badge_label: string | null;
  is_external: boolean;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

/** A category with its resources attached, as the public page renders it. */
export interface DocsCategoryWithResources extends DocsCategory {
  resources: DocsResource[];
}

// ============================================================
// Billing / subscriptions (migrations 050-052)
// ============================================================

/**
 * A payment request as the review queue sees it: the stored row plus
 * fields the API derives or joins in.
 *
 * `amount_matches` / `amount_difference` are computed server-side so
 * every client agrees on the comparison — and so nobody re-derives it
 * from the PostgREST string form of NUMERIC and gets it wrong.
 */
export interface AdminPaymentRequest {
  id: string;
  account_id: string;
  user_id: string | null;

  plan_id: string | null;
  cycle_id: string | null;
  plan_name_snapshot: string;
  cycle_label_snapshot: string;
  cycle_months: number | null;
  cycle_duration_days: number | null;

  /** Price in force when the customer submitted. Server-derived. */
  expected_amount: number;
  /** What the payer says they transferred. */
  paid_amount: number;
  currency: string;
  /** True when expected and paid agree to within a paisa. */
  amount_matches: boolean;
  /** paid - expected. Negative means underpaid. */
  amount_difference: number;

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

  status: 'pending' | 'approved' | 'rejected';
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  activated_from: string | null;
  activated_until: string | null;

  created_at: string;
  updated_at: string;

  // ---- joined context ----
  account_name: string | null;
  account_subscription_status: string | null;
  account_subscription_ends_at: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
}

/**
 * One row of the subscriber list.
 *
 * `storedStatus` vs `liveStatus` is the important distinction: nothing
 * flips the stored column when a date passes, so `liveStatus` (derived
 * from the timestamps) is what the UI must display.
 */
export interface SubscriberRow {
  accountId: string;
  accountName: string;
  isBanned: boolean;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  /**
   * Shown in place of `ownerName` in the Subscribers table, where the
   * workspace name and owner name are almost always identical. `ownerName`
   * is still carried so search keeps matching on it.
   */
  ownerPhone: string | null;

  storedStatus: string;
  liveStatus: 'trialing' | 'active' | 'expired' | 'none';
  isBlocked: boolean;
  inGracePeriod: boolean;
  daysLeft: number | null;
  endsAt: string | null;

  planName: string | null;
  cycleLabel: string | null;
  trialEndsAt: string | null;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  note: string | null;
  pendingWindow?: {
    type: 'active' | 'trialing';
    startsAt: string;
    endsAt: string;
    /** Length of the queued window (`endsAt - startsAt`), not time until it ends. */
    durationDays: number;
  } | null;
}

export interface SubscriberCounts {
  total: number;
  trialing: number;
  active: number;
  expired: number;
  none: number;
  blocked: number;
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface IntegrationFeature {
  title: string;
  description: string;
  icon?: string;
}

export interface IntegrationStep {
  step_number: number;
  title: string;
  description: string;
}

export interface IntegrationFAQ {
  question: string;
  answer: string;
}

export interface IntegrationPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  badge_text: string;
  primary_cta_text: string;
  primary_cta_url: string;
  secondary_cta_text: string;
  secondary_cta_url: string;
  prerequisites: string[];
  features: IntegrationFeature[];
  how_it_works: IntegrationStep[];
  faqs: IntegrationFAQ[];
  privacy_markdown: string;
  terms_markdown: string;
  seo_meta_title: string;
  seo_meta_description: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Google Sheets add-on — Help & Support
//
// Three tables behind the add-on's Help & Support dialog:
//   sheets_addon_help_settings  singleton, all dialog copy
//   sheets_addon_help_links     rows, the Get Support / Resources buttons
//   sheets_addon_issue_reports  rows, reports submitted from the dialog
//
// The add-on ships NO fallback strings, so these rows are the only
// source of the text it renders. That is why every text field is a
// plain `string` and never `string | null`: the columns are NOT NULL
// DEFAULT '', and an empty string is meaningful (hide this section)
// rather than missing.
// ============================================================

/** Sections a help link can belong to. Mirrors the DB CHECK constraint. */
export type SheetsAddonHelpSection = 'support' | 'resources';

/**
 * Icon names the add-on dialog has inline SVG for. Deliberately a closed
 * set and not free text: the Apps Script dialog has no icon library, so
 * an unrecognised name would draw nothing at all.
 */
export type SheetsAddonHelpIcon =
  'whatsapp' | 'mail' | 'calendar' | 'book' | 'globe' | 'link';

/**
 * Lifecycle of a submitted report. Mirrors the DB CHECK constraint.
 *
 * Intentionally identical to `ContactSubmission['status']`. Two inboxes
 * in the same panel with different vocabularies and different transition
 * behaviour is its own source of operator error, so the add-on inbox
 * adopted the contact inbox's set rather than keeping its own
 * bug-tracker-shaped one (new / in_progress / resolved / closed).
 */
export type SheetsAddonReportStatus = 'new' | 'read' | 'replied' | 'archived';

/** Singleton row: every heading and block of copy the dialog renders. */
export interface SheetsAddonHelpSettings {
  id: string;

  dialog_title: string;
  dialog_subtitle: string;

  support_heading: string;
  resources_heading: string;

  /** Section holding the two actions that used to sit loose in the menu. */
  maintenance_heading: string;
  maintenance_description: string;
  reinstall_label: string;
  reinstall_description: string;
  disconnect_label: string;
  disconnect_description: string;

  reset_heading: string;
  reset_description: string;
  reset_button_label: string;
  /**
   * Second-step label for the arm/confirm reset. The add-on appends the
   * live rule count, so this reads as a verb phrase.
   */
  reset_confirm_label: string;

  report_heading: string;
  report_intro: string;
  report_placeholder: string;
  report_button_label: string;
  report_success_message: string;

  footer_text: string;
  footer_url: string;

  /**
   * Whole-section kill switches, separate from blanking the copy so a
   * section can be withdrawn and restored without retyping it.
   */
  is_report_enabled: boolean;
  is_reset_enabled: boolean;

  created_at: string;
  updated_at: string;
}

/** One button under Get Support or Resources. */
export interface SheetsAddonHelpLink {
  id: string;
  section: SheetsAddonHelpSection;
  label: string;
  description: string;
  /**
   * https://, mailto: or https://wa.me/ target. A blank value means
   * unconfigured — the public endpoint omits such rows, so an enabled
   * link with no URL can never reach the dialog as a dead button.
   */
  url: string;
  icon: SheetsAddonHelpIcon;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Payload shape returned by `GET /api/public/sheets-addon/help`.
 *
 * This is what the add-on consumes. Links arrive pre-split and
 * pre-filtered (enabled, non-blank URL, ordered) so the dialog does no
 * decision-making of its own.
 */
export interface SheetsAddonHelpContent {
  settings: SheetsAddonHelpSettings;
  support: SheetsAddonHelpLink[];
  resources: SheetsAddonHelpLink[];
}

/** One report submitted from the add-on dialog. */
export interface SheetsAddonIssueReport {
  id: string;
  message: string;
  /** Google account the add-on ran as — the only reliable way to reply. */
  reporter_email: string | null;
  /**
   * NULL when the submission carried no valid API key. Expected rather
   * than exceptional: a user who cannot connect their key is precisely
   * the person who needs to reach support.
   */
  account_id: string | null;
  /** Denormalised so the row stays readable after the account is deleted. */
  account_name: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  addon_version: string | null;
  status: SheetsAddonReportStatus;
  /** Operator-only. Never returned by a public endpoint. */
  admin_note: string | null;
  /** Abuse triage for an unauthenticated write, not analytics. */
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/** Tile counts above the Issue Reports inbox. */
export interface SheetsAddonReportCounts {
  new: number;
  read: number;
  replied: number;
  archived: number;
  total: number;
}

/**
 * One operator reply emailed back to a reporter.
 *
 * Mirrors the contact-submissions reply shape so the thread UI is the
 * same, with one addition: `sent_by_email` records which operator
 * actually sent it. `contact_replies` hardcodes 'Super Admin' and loses
 * that, which stops being acceptable as soon as there is more than one
 * person answering.
 */
export interface SheetsAddonIssueReply {
  id: string;
  subject: string;
  body: string;
  /** Display name shown in the thread. */
  sent_by: string;
  /** Audit only — never rendered. */
  sent_by_email: string | null;
  created_at: string;
}
