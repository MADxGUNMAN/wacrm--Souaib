import type { AccountRole } from '@/lib/auth/roles';
export type { AccountRole };
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import type { ContentType } from '@/lib/whatsapp/content-types';
import type { ContactSource } from '@/lib/contacts/contact-source';

export type {
  InteractiveMessagePayload,
  InteractiveButtonsPayload,
  InteractiveListPayload,
  InteractiveButton,
  InteractiveListRow,
  InteractiveListSection,
} from '@/lib/whatsapp/interactive';

export type { ContentType };
export { CONTENT_TYPES, CONTENT_TYPE_SET } from '@/lib/whatsapp/content-types';

export interface MemberPermissions {
  [key: string]: boolean | undefined;
  inbox: boolean;
  dashboard: boolean;
  contacts: boolean;
  pipelines: boolean;
  broadcasts: boolean;
  automations: boolean;
  settings: boolean;
  settings_whatsapp?: boolean;
  settings_templates?: boolean;
  settings_quick_replies?: boolean;
  settings_fields?: boolean;
  settings_deals?: boolean;
  settings_members?: boolean;
  settings_api?: boolean;
  /**
   * Usage alerts (migration 079). Owner-only by default — see
   * `OWNER_ONLY_SETTINGS_SECTIONS` in `@/lib/auth/roles`, which is what
   * makes "absent" mean DENY for this key instead of the usual allow.
   */
  settings_alerts?: boolean;
  /**
   * Opt-in/opt-out keywords (migration 20260831000000). Read-only for
   * members: the panel's write path is owner-only in the route AND in RLS,
   * so this key controls visibility, not editing.
   *
   * Absent means ALLOW (the usual default) — the keywords are not
   * sensitive, and an agent knowing that STOP unsubscribes people is
   * useful context.
   */
  settings_opt_out?: boolean;
}

export const DEFAULT_MEMBER_PERMISSIONS: MemberPermissions = {
  inbox: true,
  dashboard: false,
  contacts: false,
  pipelines: false,
  broadcasts: false,
  automations: false,
  settings: false,
  settings_whatsapp: true,
  settings_templates: true,
  settings_quick_replies: true,
  settings_fields: true,
  settings_deals: true,
  settings_members: false,
  settings_api: false,
  settings_alerts: false,
  settings_opt_out: true,
};

export const PERMISSION_ITEMS: {
  key: keyof MemberPermissions;
  label: string;
  desc: string;
}[] = [
  {
    key: 'inbox',
    label: 'Inbox',
    desc: 'Access messaging conversations and reply to leads',
  },
  {
    key: 'contacts',
    label: 'Contacts',
    desc: 'View, add, and manage customer profiles and tags',
  },
  {
    key: 'pipelines',
    label: 'Pipelines',
    desc: 'Manage deal stages and move lead cards',
  },
  {
    key: 'broadcasts',
    label: 'Broadcasts',
    desc: 'Create and send bulk template campaigns',
  },
  {
    key: 'automations',
    label: 'Automations',
    desc: 'Configure chatbot workflows and auto-replies',
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    desc: 'View analytics and workspace performance metrics',
  },
  {
    key: 'settings',
    label: 'Settings',
    desc: 'Manage WhatsApp numbers, integrations, and templates',
  },
];

export const SETTINGS_SUB_ITEMS: {
  key: string;
  label: string;
  desc: string;
  defaultVal: boolean;
}[] = [
  {
    key: 'settings_whatsapp',
    label: 'WhatsApp Configuration',
    desc: 'Manage WABA numbers, credentials, and connection status',
    defaultVal: true,
  },
  {
    key: 'settings_templates',
    label: 'Message Templates',
    desc: 'Create, edit, submit, and sync WhatsApp message templates',
    defaultVal: true,
  },
  {
    key: 'settings_quick_replies',
    label: 'Quick Replies',
    desc: 'Manage canned responses for inbox agents',
    defaultVal: true,
  },
  {
    key: 'settings_fields',
    label: 'Fields & Tags',
    desc: 'Configure custom contact attributes and conversation labels',
    defaultVal: true,
  },
  {
    key: 'settings_deals',
    label: 'Deals & Currency',
    desc: 'Configure CRM deal stages and default currency',
    defaultVal: true,
  },
  {
    key: 'settings_members',
    label: 'Team Members',
    desc: 'View team roster and member access',
    defaultVal: false,
  },
  {
    key: 'settings_api',
    label: 'API Keys & Webhooks',
    desc: 'Manage developer tokens and webhook endpoints',
    defaultVal: false,
  },
  {
    key: 'settings_alerts',
    label: 'Usage Alerts',
    desc: 'Set the weekly or monthly message budget and who gets warned',
    defaultVal: false,
  },
  {
    key: 'settings_opt_out',
    label: 'Opt-in / Opt-out',
    desc: 'View the STOP/START keywords and confirmation wording (owner-only to edit)',
    defaultVal: true,
  },
];

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  /**
   * Legacy free-form role column from migration 001. Never read
   * by the app since 017_account_sharing.sql introduced the typed
   * `account_role` enum. Flagged for removal in a later cleanup
   * migration — kept on the type so existing destructures don't
   * break.
   */
  role: string;
  /**
   * Opted-in beta feature keys for this account. The column survives
   * for future beta gates; no current feature reads it (Flows was
   * the last user and went to soft-GA in PR #134). Defaults to `[]`
   * for every profile; toggled per-account via a direct UPDATE on
   * the `profiles` row.
   */
  beta_features?: string[];
  /**
   * Account this profile is a member of. Added by
   * `017_account_sharing.sql`; NOT NULL in the DB post-backfill.
   * Optional on the type only because older serialised payloads
   * (cached client state, test fixtures) may not have it yet.
   */
  account_id?: string;
  /**
   * Caller's role within their account. Source of truth for every
   * role-gated UI / API check — call `hasMinRole` from
   * `@/lib/auth/roles` rather than comparing this string directly.
   */
  account_role?: AccountRole;
  permissions?: MemberPermissions | null;
  /** Platform-level super admin flag. When true, the user can
   *  access `/super-admin` routes for CMS management and platform
   *  analytics. Set directly in the database — not editable from
   *  the app UI. */
  is_super_admin?: boolean;
  created_at: string;
}

// ============================================================
// Account-sharing entities (017_account_sharing.sql)
// ============================================================

export interface Account {
  id: string;
  name: string;
  /** auth.users.id of the immutable owner. */
  owner_user_id: string;
  /** When true, the account is suspended by a platform super admin. */
  is_banned?: boolean;
  banned_at?: string | null;
  banned_reason?: string | null;
  banned_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hydrated member row for the Settings → Members tab. Combines
 * the profile and its account_role for a single member of the
 * caller's account. Only two roles exist: owner and member.
 */
export interface AccountMember {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  permissions?: MemberPermissions | null;
  is_active: boolean;
  joined_at: string;
}

/**
 * Outstanding invite link row. `token_hash` is intentionally
 * absent — it lives only in the DB and on the server. The
 * plaintext token is returned once at creation time and surfaced
 * via the invite URL; never re-emitted.
 */
export interface AccountInvitation {
  id: string;
  account_id: string;
  /** Invites always create members — owner is never offered. */
  role: 'member';
  created_by_user_id: string | null;
  label: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
}

export interface Contact {
  /**
   * How this contact entered the CRM — see
   * `src/lib/contacts/contact-source.ts` for the display config and
   * migration `20260916120000_contact_source.sql` for the constraint.
   *
   * Typed as the union rather than `string` so a new value has to be added
   * to the config too, but read it through `getContactSource()` — the column
   * is NOT NULL in the database, yet a row selected by an older client, or
   * written by a newer deploy, can still surprise you.
   */
  source?: ContactSource;
  id: string;
  user_id: string;
  account_id: string;
  phone: string;
  /** Digits-only form of `phone`, generated by the DB (migration 022)
   *  and unique per account. Read-only. */
  phone_normalized?: string;
  /**
   * The SAVED name — what the operator owns. An inbound message fills this in
   * only while nobody has set it; once edited, it is never auto-changed. See
   * `resolveContactNameUpdate`.
   */
  name?: string;
  /**
   * The contact's own WhatsApp profile name. DISPLAY ONLY — shown as the
   * "~Souaib" suffix beside the saved name in the thread header and contact
   * sidebar, and never used for matching or as authority over `name`.
   * Null on rows predating migration 20260917160000.
   */
  wa_profile_name?: string | null;
  email?: string;
  company?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  /** Hydrated by queries that embed `contact_tags(tags(*))` (e.g. the
   *  Inbox conversation list, for tag filtering). Absent otherwise. */
  tags?: Tag[];
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag_id: string;
}

export interface CustomField {
  id: string;
  user_id: string;
  /** Tenancy key — NOT NULL since migration 017. */
  account_id: string;
  field_name: string;
  field_type: string;
  field_options?: Record<string, unknown>;
  field_key?: 'email' | 'company' | null;
  is_system?: boolean;
  visible?: boolean;
  created_at: string;
}

export interface ContactCustomValue {
  id: string;
  contact_id: string;
  custom_field_id: string;
  value?: string;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  user_id: string;
  note_text: string;
  created_at: string;
}

/**
 * A recorded marketing opt-out (migration 20260831000000).
 *
 * Keyed on `phone_normalized`, NOT `contact_id` — the phone is the
 * identity so an opt-out survives contact deletion and CSV re-import.
 * `contact_id` is audit convenience and may be null.
 *
 * Presence of a row suppresses MARKETING templates only; Utility and
 * Authentication sends are unaffected.
 */
export interface MarketingOptOut {
  id: string;
  account_id: string;
  /** Digits-only phone, mirroring `contacts.phone_normalized`. */
  phone_normalized: string;
  contact_id?: string | null;
  source:
    | 'customer_keyword'
    | 'customer_button'
    | 'meta_131050'
    | 'agent'
    | 'api'
    | 'import';
  opted_out_at: string;
  created_at: string;
}

/**
 * Per-account opt-in/opt-out settings row (migration 20260831000000).
 *
 * Keywords are stored UPPERCASE and matched case-insensitively against
 * the whole trimmed message. `is_active` gates whether keywords are
 * WATCHED — it does not release contacts who already opted out.
 *
 * The domain-shaped equivalent, with defaults applied, is `OptInOutConfig`
 * in `@/lib/whatsapp/marketing-opt-out`.
 */
export interface OptInOutSettings {
  id: string;
  account_id: string;
  created_by?: string | null;
  is_active: boolean;
  opt_out_keywords: string[];
  opt_in_keywords: string[];
  opt_out_response_message: string;
  opt_in_response_message: string;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus = 'open' | 'pending' | 'closed';

export interface Conversation {
  id: string;
  user_id: string;
  contact_id: string;
  status: ConversationStatus;
  assigned_agent_id?: string;
  last_message_text?: string;
  last_message_at?: string;
  /**
   * Newest NON-broadcast message on this conversation, and its preview.
   *
   * Null means the thread has only ever received bulk campaign sends, which
   * is how the Inbox's All chats view knows to leave it out — see
   * `isVisibleInAllChats`. Maintained by a database trigger (migration
   * 20260917140000), never written by application code: ten separate paths
   * write `last_message_*`, and a missed one here would silently hide a
   * conversation from the inbox.
   */
  last_direct_message_at?: string | null;
  last_direct_message_text?: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  /**
   * AI auto-reply state for this thread (migration 029 + 033):
   *  - `ai_autoreply_disabled` — the bot is paused here (a human took
   *    over, or the model handed off). Sticky until re-enabled.
   *  - `ai_reply_count` — how many times the bot has auto-replied,
   *    checked against the account's per-conversation cap.
   *  - `ai_handoff_summary` — short internal note the bot wrote when it
   *    handed off, shown to whoever takes the thread over.
   */
  ai_autoreply_disabled?: boolean;
  ai_reply_count?: number;
  ai_handoff_summary?: string | null;
  /**
   * Pinned message fields (Migration 077 / Phase 7)
   */
  pinned_message_id?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
}

// ============================================================
// Notifications (migration 027)
// ============================================================

export type NotificationType =
  | 'conversation_assigned'
  /** A message-usage threshold was crossed (migration 079). */
  | 'usage_threshold';

export interface Notification {
  id: string;
  account_id: string;
  /** Recipient — the agent this notification is for. */
  user_id: string;
  type: NotificationType;
  conversation_id?: string;
  contact_id?: string;
  /** Who triggered it. Null when an automation/system assigned it. */
  actor_user_id?: string;
  title: string;
  body?: string;
  /**
   * Where clicking should go, e.g. `/settings?tab=alerts` (migration 079).
   *
   * Null for conversation notifications, which route from
   * `conversation_id` instead. Before this existed, a notification with no
   * conversation was inert when clicked.
   */
  link?: string | null;
  read_at?: string;
  created_at: string;
}

/**
 * Who sent a message.
 *
 *   customer      — the person we are talking to
 *   agent         — a human on the team, through this CRM
 *   bot           — an automation, a flow, or the AI auto-reply
 *   business_app  — the business, but typed in the WhatsApp Business App
 *                   on a phone rather than here. Only possible on a
 *                   Coexistence number, where Meta mirrors phone-sent
 *                   messages to us (migration 069).
 *
 * `business_app` is OUTBOUND but has no CRM user behind it, so use
 * `isOutboundSender` from @/lib/messages/sender-type rather than
 * comparing against 'agent' and 'bot' by hand — that idiom was
 * duplicated in four components and each copy was a place to forget the
 * fourth value.
 */
export type SenderType = 'customer' | 'agent' | 'bot' | 'business_app';
export type MessageStatus =
  'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id?: string;
  content_type: ContentType;
  content_text?: string;
  media_url?: string;
  template_name?: string;
  message_id?: string;
  status: MessageStatus;
  created_at: string;
  /**
   * The broadcast campaign that produced this message, or null/undefined
   * for inbound, one-to-one, automation and flow messages.
   *
   * A campaign send is a real message in the customer's thread — same
   * bubble, same delivery ladder, same webhook — so it lives on this type
   * rather than in a parallel structure. This field is only the
   * attribution, and is what the Inbox's Broadcasts view filters on.
   */
  broadcast_id?: string | null;
  /**
   * Location structured fields (Phase 0/2)
   */
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_address?: string | null;
  /**
   * Contact cards raw payload (Phase 0/3)
   */
  contacts_payload?: Record<string, unknown>[] | null;
  /**
   * Per-status timestamps (Phase 0/1/7)
   */
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  /**
   * Media metadata (Phase 0/5)
   */
  media_mime_type?: string | null;
  media_filename?: string | null;
  /**
   * Re-send / forward provenance (Phase 0/6)
   */
  forwarded_from_message_id?: string | null;
  /**
   * Why this message failed — Meta's numeric code as text (e.g. '131042'
   * for a payment problem, '131047' for the 24-hour window), or a domain
   * code for non-Meta failures. Migration 073.
   */
  error_code?: string | null;
  /**
   * Meta's own wording for the failure, verbatim. Deliberately NOT
   * paraphrased: Meta reuses generic sentences across unrelated causes, so
   * rewording it is one more place for the real reason to be lost. Null
   * means no recorded reason — every successful message, plus failures
   * that predate migration 073 — and must never render as a blank error.
   */
  error_message?: string | null;
  /**
   * The full Meta error payload: subcode, fbtrace_id, error_data.details
   * and HTTP status. `fbtrace_id` is the value Meta asks for when you open
   * a Direct Support ticket. Migration 073.
   */
  error_details?: Record<string, unknown> | null;
  /**
   * Set when the sender edited this message. `content_text` holds the
   * LATEST version — the original is not kept, matching what WhatsApp
   * itself shows. Migration 069.
   */
  edited_at?: string | null;
  /**
   * Soft delete — set when the sender deleted this message for everyone.
   * The row survives so the thread can show a placeholder where it was;
   * hiding it entirely would silently reflow the conversation and dangle
   * any `reply_to_message_id` pointing at it. Migration 069.
   *
   * Anything rendering `content_text` MUST check this first: the text of
   * a deleted message is still in the column, and showing it would
   * display something the sender explicitly retracted.
   */
  deleted_at?: string | null;
  reply_to_message_id?: string;
  /**
   * Only set when `content_type === 'interactive'` — the stable id of
   * the button or list row the customer tapped. The Flows engine uses
   * this to route the next node; the inbox bubble uses it as a styling
   * cue (renders with a "↩ button reply" affordance).
   */
  interactive_reply_id?: string;
  /**
   * Structured payload of an OUTBOUND interactive message (reply
   * buttons or list) we sent. Lets the thread re-render the buttons /
   * rows, not just the body text. Only set when `content_type ===
   * 'interactive'` and `sender_type` is agent/bot. Migration 035.
   */
  interactive_payload?: InteractiveMessagePayload;
  /**
   * True when the AI auto-reply bot generated + sent this message (as
   * opposed to a human agent or a deterministic Flow/automation send,
   * which all share `sender_type='bot'`/`'agent'`). Drives the "AI"
   * badge in the inbox. Migration 033.
   */
  ai_generated?: boolean;
}

export type ReactionActor = 'customer' | 'agent';

export interface MessageReaction {
  id: string;
  message_id: string;
  conversation_id: string;
  actor_type: ReactionActor;
  actor_id?: string;
  emoji: string;
  created_at: string;
}

export interface WhatsAppConfig {
  id: string;
  user_id: string;
  phone_number_id: string;
  waba_id?: string;
  access_token: string;
  verify_token?: string;
  status: 'connected' | 'disconnected';
  connected_at?: string;
  /**
   * Set when POST /{phone_number_id}/register last succeeded. NULL
   * means the number was saved but never actually subscribed for
   * webhooks on Meta's side — inbound events will be silently lost.
   */
  registered_at?: string;
  /** Set when POST /{waba_id}/subscribed_apps last succeeded. */
  subscribed_apps_at?: string;
  /** Last error from /register; cleared on success. */
  last_registration_error?: string;
  /**
   * The actual WhatsApp number, verbatim from Meta. Migration 078.
   *
   * Meta sends two shapes and both are stored as-is: `'918588096070'` from
   * webhook metadata and `'+91 72020 72233'` from the phone-number node.
   * Render it through `formatDisplayPhoneNumber`, which handles either.
   *
   * NULL until the first sync from Meta (connect, an account-info fetch,
   * or any inbound webhook, all of which carry it). When it is null the UI
   * must say so; rendering `phone_number_id` in its place is the bug this
   * column exists to fix — that value is a Meta asset id, and prefixing it
   * with '+' made a 15-digit id look like a phone number.
   */
  display_phone_number?: string | null;
  /** Business display name Meta shows customers for this number. */
  verified_name?: string | null;
}

// Raw Meta status enum. We persist this verbatim from Meta (sync + webhook)
// rather than collapsing to a local TitleCase set — distinctions like
// PAUSED vs DISABLED vs IN_APPEAL drive the edit/resubmit/delete flows.
// DRAFT is the local-only state before the row is submitted to Meta.
export type MessageTemplateStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'PENDING_DELETION';

export type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example?: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
  | { type: 'COPY_CODE'; text: string; example: string }
  /**
   * Places a WhatsApp voice call to the business when tapped.
   *
   * Carries no configuration — the number called is the WABA's own. It
   * lives in this union rather than only in `MetaTemplateButton` because
   * it needs no send-time parameter, so the flat `buttons` cache can
   * represent it faithfully and every existing consumer handles it by
   * adding one case.
   *
   * Requires WhatsApp Business Calling to be enabled on the phone number;
   * without that the template is still approved and the button does
   * nothing.
   */
  | { type: 'VOICE_CALL'; text: string };

export interface TemplateSampleValues {
  body?: string[];
  header?: string[];
}

export interface MessageTemplate {
  id: string;
  user_id: string;
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language?: string;
  // ---- Flat columns: a DERIVED CACHE of `components`, not the truth.
  // Written only by deriveFlatColumns(). Kept because
  // template-row-guard.ts requires body_text and the broadcast engine
  // reads these on every send. See template-definition.ts.
  header_type?: 'text' | 'image' | 'video' | 'document' | 'location';
  header_content?: string;
  header_handle?: string;
  header_media_url?: string;
  body_text: string;
  footer_text?: string;
  buttons?: TemplateButton[];
  sample_values?: TemplateSampleValues;
  // ---- Source of truth (migration 061). Meta's components array,
  // verbatim. Typed as TemplateComponent[] via definitionFromRow();
  // left as unknown here so @/types stays dependency-free.
  components?: unknown;
  /** Which wizard flow built this — see TemplateType. */
  template_type?: string;
  /** POSITIONAL ({{1}}) or NAMED ({{order_id}}). */
  parameter_format?: 'POSITIONAL' | 'NAMED';
  /** Validity period in seconds; null uses Meta's default. */
  message_send_ttl_seconds?: number | null;
  /** Set when created from Meta's pre-approved Template Library. */
  library_template_name?: string | null;
  status?: MessageTemplateStatus;
  meta_template_id?: string;
  rejection_reason?: string;
  quality_score?: 'GREEN' | 'YELLOW' | 'RED';
  submission_error?: string;
  last_submitted_at?: string;
  created_at: string;
}

export interface Pipeline {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
  created_at: string;
}

export type DealStatus = 'open' | 'won' | 'lost';

export interface Deal {
  id: string;
  user_id: string;
  pipeline_id: string;
  stage_id: string;
  /**
   * Nullable after migration 004 — becomes NULL when the referenced
   * contact is deleted (ON DELETE SET NULL). History preserved.
   */
  contact_id: string | null;
  conversation_id?: string;
  assigned_to?: string;
  title: string;
  value: number;
  currency?: string;
  notes?: string;
  expected_close_date?: string;
  status?: DealStatus;
  created_at: string;
  updated_at?: string;
  contact?: Contact;
  stage?: PipelineStage;
  assignee?: Profile;
}

export type BroadcastStatus =
  'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
export type RecipientStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'replied'
  | 'failed'
  /**
   * Suppressed before sending because the contact opted out of marketing
   * (migration 20260831000000). Deliberately counted in NEITHER
   * `sent_count` nor `failed_count` by the aggregate trigger — a respected
   * opt-out is not a delivery failure.
   */
  | 'skipped';

export interface Broadcast {
  id: string;
  user_id: string;
  name: string;
  template_name: string;
  template_language: string;
  template_variables?: Record<string, unknown>;
  audience_filter?: Record<string, unknown>;
  scheduled_at?: string;
  status: BroadcastStatus;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  created_at: string;
  /**
   * Set when this broadcast is one run of a reusable {@link ApiCampaign}
   * rather than an ordinary dashboard send. NULL for everything sent
   * from the wizard. See migration `20260912100000_api_campaigns.sql`.
   */
  api_campaign_id?: string | null;
  /**
   * The campaign's name at the moment this run was created.
   *
   * Present on every run, and it OUTLIVES the campaign — `api_campaign_id`
   * is ON DELETE SET NULL, so this is the only thing that keeps a run
   * identifiable once its campaign is deleted. Treat a non-null value as
   * the definitive "this row is an API campaign run" marker; use
   * `api_campaign_id` only to decide whether the campaign is still there
   * to link to.
   */
  api_campaign_name?: string | null;
  /**
   * Labels for this run's positional body params, index-aligned with
   * each recipient's `send_params.params` — for a Google Sheets run,
   * the spreadsheet column headers.
   *
   * `null` means not recorded (any run predating migration
   * 20260915130000, or a caller that sent no `param_labels`), which is
   * deliberately distinct from `[]` — "this template takes no
   * variables". An empty string at position i is a literal variable,
   * which has no column to name.
   */
  variable_labels?: string[] | null;
  /**
   * Provenance of an externally triggered run, verbatim from the caller:
   * `{ kind, spreadsheet_id, sheet, rule_id, row }`. NULL for dashboard
   * broadcasts.
   */
  source_ref?: {
    kind?: string | null;
    spreadsheet_id?: string | null;
    sheet?: string | null;
    rule_id?: string | null;
    row?: number | string | null;
  } | null;
}

/** `active` accepts new runs; `paused` rejects them with `campaign_paused`. */
export type ApiCampaignStatus = 'active' | 'paused';

/**
 * A reusable, recipient-less campaign an external system (the Google
 * Sheets add-on, a customer's own backend) can trigger repeatedly via
 * `POST /api/v1/campaigns/{id}/send`.
 *
 * Deliberately just a name bound to a template — see plan §2.7. Each
 * trigger fire creates a real {@link Broadcast} row with
 * `api_campaign_id` set to this campaign's `id`; the campaign itself
 * never accumulates a recipient count or a terminal status.
 */
export interface ApiCampaign {
  id: string;
  account_id: string;
  created_by: string | null;
  name: string;
  template_name: string;
  template_language: string;
  status: ApiCampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  /**
   * Nullable after migration 004 — becomes NULL when the referenced
   * contact is deleted (ON DELETE SET NULL). History preserved; the
   * UI renders "Unknown" for orphaned rows.
   */
  contact_id: string | null;
  status: RecipientStatus;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  replied_at?: string;
  error_message?: string;
  /**
   * Meta's error code as text ('131049'), or a sentinel ('send_failed',
   * 'delivery_failed') when Meta reported a failure without one. The code
   * is what actually identifies a failure — Meta reuses the same generic
   * sentence across unrelated codes.
   */
  error_code?: string | null;
  /**
   * Verbatim Meta failure payload. `source` separates a send-time
   * rejection ('send_time') from a delivery failure Meta reported after
   * accepting the message ('status_webhook') — different causes, different
   * fixes.
   */
  error_details?: {
    code?: number | null;
    title?: string | null;
    raw_message?: string | null;
    details?: string | null;
    user_message?: string | null;
    href?: string | null;
    fbtrace_id?: string | null;
    source?: string | null;
  } | null;
  /**
   * Meta's message id, persisted when the broadcast send succeeds so
   * the webhook can mirror status updates back onto the recipient row.
   * Added in migration 003.
   */
  whatsapp_message_id?: string;
  /**
   * What this recipient was actually personalised with — the only durable
   * record of it. `params` are the positional body values ({{1}}, {{2}}…)
   * and are named by the parent run's {@link Broadcast.variable_labels}.
   *
   * Written for every send, not just scheduled ones, so "what exactly did
   * this person receive?" stays answerable. See migration
   * `20260910030000_broadcast_scheduling.sql`.
   */
  send_params?: {
    params?: string[];
    messageParams?: Record<string, unknown>;
  } | null;
  created_at: string;
  contact?: Contact;
}

// ============================================================
// Automations (migration 006)
// ============================================================

export type AutomationTriggerType =
  | 'new_message_received'
  | 'first_inbound_message'
  | 'keyword_match'
  | 'new_contact_created'
  | 'conversation_assigned'
  | 'tag_added'
  | 'time_based'
  /** Customer tapped a reply button / list row whose id matches; lets
   *  multi-step menus be chained across automations. */
  | 'interactive_reply';

export type AutomationStepType =
  | 'send_message'
  | 'send_buttons'
  | 'send_list'
  | 'send_template'
  | 'add_tag'
  | 'remove_tag'
  | 'assign_conversation'
  | 'update_contact_field'
  | 'create_deal'
  | 'wait'
  | 'condition'
  | 'send_webhook'
  | 'close_conversation';

export type AutomationLogStatus = 'success' | 'partial' | 'failed';

export interface KeywordMatchTriggerConfig {
  keywords: string[];
  match_type: 'exact' | 'contains';
  case_sensitive?: boolean;
}

export interface TagTriggerConfig {
  tag_id: string;
}

export interface TimeBasedTriggerConfig {
  /** Cron expression or simple HH:mm string; engine can accept either. */
  schedule: string;
  timezone?: string;
}

export interface InteractiveReplyTriggerConfig {
  /** Button / list-row ids to match, exact. Any one matching fires. */
  reply_ids: string[];
}

export type AutomationTriggerConfig =
  | Record<string, never>
  | KeywordMatchTriggerConfig
  | TagTriggerConfig
  | TimeBasedTriggerConfig
  | InteractiveReplyTriggerConfig
  | Record<string, unknown>;

export interface SendMessageStepConfig {
  text: string;
}

/**
 * `send_buttons` / `send_list` step configs carry the full interactive
 * payload (same shape stored on messages + quick replies). `kind` is
 * implied by the step_type but kept on the payload for a uniform shape.
 */
export type SendButtonsStepConfig = InteractiveMessagePayload;
export type SendListStepConfig = InteractiveMessagePayload;

export interface SendTemplateStepConfig {
  template_name: string;
  language?: string;
  variables?: Record<string, string>;
}

export interface TagStepConfig {
  tag_id: string;
}

export interface AssignConversationStepConfig {
  mode: 'specific' | 'round_robin';
  agent_id?: string;
}

export interface UpdateContactFieldStepConfig {
  /**
   * Either a built-in contact column (`name` | `email` | `company`) or a
   * custom field encoded as `custom:<custom_field_id>`. The `custom:` prefix
   * is how the engine distinguishes a `contact_custom_values` write from a
   * direct `contacts` column update. Older configs store the bare column name,
   * so this stays backward compatible.
   */
  field: string;
  /** Supports `{{ vars.* }}` / `{{ message.text }}` interpolation at runtime. */
  value: string;
}

export interface CreateDealStepConfig {
  pipeline_id: string;
  stage_id: string;
  title: string;
  value?: number;
}

export interface WaitStepConfig {
  amount: number;
  unit: 'minutes' | 'hours' | 'days';
}

export type ConditionSubject =
  'contact_field' | 'tag_presence' | 'message_content' | 'time_of_day';

export interface ConditionStepConfig {
  subject: ConditionSubject;
  /** e.g. field name, tag id, substring, or "HH:mm-HH:mm" depending on subject */
  operand?: string;
  /** For contact_field equals / message_content contains — comparison value */
  value?: string;
}

export interface SendWebhookStepConfig {
  url: string;
  headers?: Record<string, string>;
  body_template?: string;
}

export type AutomationStepConfig =
  | SendMessageStepConfig
  | SendButtonsStepConfig
  | SendListStepConfig
  | SendTemplateStepConfig
  | TagStepConfig
  | AssignConversationStepConfig
  | UpdateContactFieldStepConfig
  | CreateDealStepConfig
  | WaitStepConfig
  | ConditionStepConfig
  | SendWebhookStepConfig
  | Record<string, never>
  | Record<string, unknown>;

export interface Automation {
  id: string;
  /** Account tenancy key — every automation belongs to one account
   *  (migration 017 made the column NOT NULL). The engine looks up
   *  active automations by this field on inbound webhook events. */
  account_id: string;
  /** Original author. Used for log audit + outbound message
   *  sender-of-record, never for tenancy isolation. */
  user_id: string;
  name: string;
  description?: string;
  trigger_type: AutomationTriggerType;
  trigger_config: AutomationTriggerConfig;
  is_active: boolean;
  execution_count: number;
  last_executed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationStep {
  id: string;
  automation_id: string;
  parent_step_id?: string | null;
  branch?: 'yes' | 'no' | null;
  step_type: AutomationStepType;
  step_config: AutomationStepConfig;
  position: number;
  created_at: string;
}

export interface AutomationLogStepResult {
  step_id: string;
  step_type: AutomationStepType;
  status: 'success' | 'skipped' | 'failed';
  detail?: string;
}

export interface AutomationLog {
  id: string;
  automation_id: string;
  user_id: string;
  contact_id: string | null;
  trigger_event: string;
  steps_executed: AutomationLogStepResult[];
  status: AutomationLogStatus;
  error_message?: string | null;
  created_at: string;
  contact?: Contact;
}

// ============================================================
// Quick replies — reusable snippets (migration 035)
// ============================================================

export type QuickReplyKind = 'text' | 'interactive';

export interface QuickReply {
  id: string;
  /** Account tenancy key — shared across all members of the account. */
  account_id: string;
  /** Author / audit only. */
  user_id: string;
  title: string;
  kind: QuickReplyKind;
  /** Set when `kind === 'text'`. */
  content_text?: string | null;
  /** Set when `kind === 'interactive'`. */
  interactive_payload?: InteractiveMessagePayload | null;
  created_at: string;
  updated_at: string;
}
