// ============================================================
// Marketing opt-out — the single source of truth.
//
// Customers who cannot leave politely block the business instead, and
// blocks feed Meta's quality rating, which is what gets a number
// restricted. So suppression is account-health infrastructure.
//
// This module owns four things:
//   1. keyword matching  (pure, testable)
//   2. category gating   (pure, testable)
//   3. reading the per-account config
//   4. reading / writing the suppression list
//
// Every send path imports from here. There are five separate template
// send implementations in this codebase and none delegates to another,
// so one shared module is the only thing that keeps them agreeing about
// what "opted out" means.
//
// See docs/marketing-opt-out.md for the design and the phase plan.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { MetaApiError } from '@/lib/whatsapp/meta-api';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import {
  DEFAULT_OPT_IN_RESPONSE,
  DEFAULT_OPT_OUT_KEYWORDS,
  DEFAULT_OPT_IN_KEYWORDS,
  DEFAULT_OPT_OUT_RESPONSE,
  normalizeKeywordList,
} from '@/lib/whatsapp/opt-out-keywords';

/**
 * Keywords, payloads and matching live in `opt-out-keywords.ts` — pure
 * data and pure string logic, with no imports, so the Settings panel and
 * the template wizard can read them without dragging the Meta API layer
 * into the browser bundle.
 *
 * Re-exported here because twelve server-side modules already import
 * these names from this file. Server code may use either path; CLIENT
 * components must import from `opt-out-keywords.ts` directly.
 */
export {
  DEFAULT_OPT_IN_KEYWORDS,
  DEFAULT_OPT_IN_RESPONSE,
  DEFAULT_OPT_OUT_KEYWORDS,
  DEFAULT_OPT_OUT_RESPONSE,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_RESPONSE_MESSAGE_LENGTH,
  RESERVED_OPT_IN_PAYLOAD,
  RESERVED_OPT_OUT_PAYLOAD,
  SUGGESTED_OPT_IN_BUTTON_LABEL,
  SUGGESTED_OPT_IN_KEYWORDS,
  SUGGESTED_OPT_OUT_BUTTON_LABEL,
  SUGGESTED_OPT_OUT_KEYWORDS,
  isReservedOptInPayload,
  isReservedOptOutPayload,
  labelMatchesOptOutKeyword,
  matchesKeyword,
  normalizeInboundText,
  normalizeKeyword,
  normalizeKeywordList,
} from '@/lib/whatsapp/opt-out-keywords';

/**
 * Meta's code for "this customer opted out of marketing at the platform
 * level". Meta already knows; recording it locally stops us discovering
 * it again on every future broadcast.
 */
export const META_MARKETING_OPT_OUT_CODE = 131050;

/**
 * Every value the `marketing_opt_outs.source` CHECK constraint allows.
 *
 * Exported as an array so the reporting layer can tally each one without
 * hard-coding a second copy of the list that could fall out of step with
 * the migration.
 */
export const MARKETING_OPT_OUT_SOURCES = [
  'customer_keyword',
  'customer_button',
  'meta_131050',
  'agent',
  'api',
  'import',
] as const;

export type MarketingOptOutSource = (typeof MARKETING_OPT_OUT_SOURCES)[number];

export interface OptInOutConfig {
  /**
   * Whether inbound keywords are WATCHED.
   *
   * Deliberately not consulted by any enforcement function in this
   * module: contacts already on the suppression list stay suppressed
   * when this is false. Withdrawn consent is not restored by an admin
   * flipping a toggle.
   */
  isActive: boolean;
  optOutKeywords: string[];
  optInKeywords: string[];
  optOutResponseMessage: string;
  optInResponseMessage: string;
}

/** Used when an account has no `opt_in_out_configs` row yet. */
export const DEFAULT_OPT_IN_OUT_CONFIG: OptInOutConfig = {
  isActive: true,
  optOutKeywords: [...DEFAULT_OPT_OUT_KEYWORDS],
  optInKeywords: [...DEFAULT_OPT_IN_KEYWORDS],
  optOutResponseMessage: DEFAULT_OPT_OUT_RESPONSE,
  optInResponseMessage: DEFAULT_OPT_IN_RESPONSE,
};

/**
 * Category gating lives in `marketing-category.ts` — pure, so the
 * broadcast wizard can ask "does suppression apply to this template?" in
 * the browser without importing this module. Re-exported for the existing
 * server-side importers; client code must import from there.
 */
export {
  isMarketingCategory,
  isTemplateCategoryKnown,
  marketingSuppressionReason,
} from '@/lib/whatsapp/marketing-category';

// ============================================================
// Config
// ============================================================

interface OptInOutConfigRow {
  is_active?: boolean | null;
  opt_out_keywords?: string[] | null;
  opt_in_keywords?: string[] | null;
  opt_out_response_message?: string | null;
  opt_in_response_message?: string | null;
}

/** Row → domain shape, filling every field that is null/absent/empty. */
export function toOptInOutConfig(
  row: OptInOutConfigRow | null | undefined
): OptInOutConfig {
  if (!row) return { ...DEFAULT_OPT_IN_OUT_CONFIG };

  const optOutKeywords = normalizeKeywordList(row.opt_out_keywords ?? []);
  const optInKeywords = normalizeKeywordList(row.opt_in_keywords ?? []);

  return {
    isActive: row.is_active ?? true,
    // An empty stored list would mean "no way to opt out", which the DB
    // constraint forbids on write — but a row predating the constraint,
    // or a hand-edited one, must not silently disable the opt-out path.
    optOutKeywords: optOutKeywords.length
      ? optOutKeywords
      : [...DEFAULT_OPT_OUT_KEYWORDS],
    // Empty IS meaningful here: a business may accept opt-outs without
    // offering keyword re-subscription. Preserved as-is.
    optInKeywords,
    optOutResponseMessage:
      row.opt_out_response_message?.trim() || DEFAULT_OPT_OUT_RESPONSE,
    optInResponseMessage:
      row.opt_in_response_message?.trim() || DEFAULT_OPT_IN_RESPONSE,
  };
}

/**
 * Load an account's opt-in/out config, falling back to defaults.
 *
 * Never throws and never returns null: a config read failing must not
 * take down a send. On error it returns defaults, which keep STOP
 * working — the safe direction.
 */
export async function loadOptInOutConfig(
  db: SupabaseClient,
  accountId: string
): Promise<OptInOutConfig> {
  const { data, error } = await db
    .from('opt_in_out_configs')
    .select(
      'is_active, opt_out_keywords, opt_in_keywords, opt_out_response_message, opt_in_response_message'
    )
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error(
      '[opt-out] config read failed, using defaults:',
      error.message
    );
    return { ...DEFAULT_OPT_IN_OUT_CONFIG };
  }
  return toOptInOutConfig(data as OptInOutConfigRow | null);
}

// ============================================================
// Suppression list
// ============================================================

export interface OptOutFilterResult {
  /** Normalized phones cleared to send. */
  allowed: Set<string>;
  /** Normalized phones that must not receive this marketing send. */
  suppressed: Set<string>;
}

/**
 * Batch-check a list of phones against the suppression list.
 *
 * One round trip for a whole broadcast batch, served directly by
 * idx_marketing_opt_outs_account_phone. Callers pass raw phones in
 * whatever shape they have; normalization happens here so a caller
 * cannot miss on formatting.
 *
 * On a query error this suppresses NOTHING and logs loudly. That is the
 * deliberate direction: a database blip must not silently cancel a
 * legitimate campaign. The trade-off is that an outage window can let a
 * marketing message through to an opted-out contact, which is why the
 * failure is logged as an error rather than swallowed.
 */
export async function filterOptedOutPhones(
  db: SupabaseClient,
  accountId: string,
  phones: readonly string[]
): Promise<OptOutFilterResult> {
  const normalized = new Set<string>();
  for (const phone of phones) {
    const key = normalizePhone(phone);
    if (key) normalized.add(key);
  }

  if (normalized.size === 0) {
    return { allowed: new Set(), suppressed: new Set() };
  }

  const { data, error } = await db
    .from('marketing_opt_outs')
    .select('phone_normalized')
    .eq('account_id', accountId)
    .in('phone_normalized', [...normalized]);

  if (error) {
    console.error(
      '[opt-out] suppression lookup failed, allowing send:',
      error.message
    );
    return { allowed: normalized, suppressed: new Set() };
  }

  const suppressed = new Set<string>();
  for (const row of data ?? []) {
    const key = (row as { phone_normalized?: string }).phone_normalized;
    if (key) suppressed.add(key);
  }

  const allowed = new Set<string>();
  for (const key of normalized) {
    if (!suppressed.has(key)) allowed.add(key);
  }

  return { allowed, suppressed };
}

/** Single-phone convenience wrapper. */
export async function isPhoneOptedOut(
  db: SupabaseClient,
  accountId: string,
  phone: string
): Promise<boolean> {
  const key = normalizePhone(phone);
  if (!key) return false;
  const { suppressed } = await filterOptedOutPhones(db, accountId, [key]);
  return suppressed.has(key);
}

/**
 * Outcome of recording an opt-out.
 *
 * 'existed' is deliberately distinct from 'failed': a customer who sends
 * STOP twice is already suppressed (success), whereas a write error means
 * they are NOT suppressed and we must not tell them otherwise.
 */
export type RecordOptOutResult = 'created' | 'existed' | 'failed';

/**
 * Record an opt-out.
 *
 * Claim-insert against the unique index rather than read-then-decide, so
 * two concurrent STOPs — a Meta redelivery, or a keyword and a button tap
 * in the same second — cannot race into duplicate rows. An existing row
 * is left untouched: the FIRST objection is the one worth keeping, and
 * re-stamping `opted_out_at` would destroy that evidence.
 */
export async function recordMarketingOptOut(
  db: SupabaseClient,
  args: {
    accountId: string;
    phone: string;
    contactId?: string | null;
    source: MarketingOptOutSource;
    /** The team member responsible, when a person did this. */
    actorUserId?: string | null;
  }
): Promise<RecordOptOutResult> {
  const phoneNormalized = normalizePhone(args.phone);
  if (!phoneNormalized) {
    console.warn('[opt-out] refusing to record an opt-out with no digits');
    return 'failed';
  }

  const { data, error } = await db
    .from('marketing_opt_outs')
    .upsert(
      {
        account_id: args.accountId,
        phone_normalized: phoneNormalized,
        contact_id: args.contactId ?? null,
        source: args.source,
      },
      { onConflict: 'account_id,phone_normalized', ignoreDuplicates: true }
    )
    .select('id');

  if (error) {
    // Loud on purpose. A dropped opt-out means we keep messaging someone
    // who asked us to stop, which is the failure with real consequences.
    console.error('[opt-out] failed to record opt-out:', error.message);
    return 'failed';
  }

  // ON CONFLICT DO NOTHING returns no row for a conflict, so an empty
  // result means the number was already suppressed.
  const created = (data?.length ?? 0) > 0;

  // Log the transition only when one actually happened. A customer
  // sending STOP twice has not changed their mind twice, and a second
  // row would make the history claim they did.
  if (created) {
    await recordSubscriptionEvent(db, {
      accountId: args.accountId,
      phone: phoneNormalized,
      contactId: args.contactId ?? null,
      event: 'unsubscribed',
      source: args.source,
      actorUserId: args.actorUserId ?? null,
    });
  }

  return created ? 'created' : 'existed';
}

/**
 * Remove an opt-out (customer sent START, or an agent re-subscribed
 * after asking). Idempotent — deleting nothing is success.
 */
export async function removeMarketingOptOut(
  db: SupabaseClient,
  args: {
    accountId: string;
    phone: string;
    /**
     * How the re-subscribe was initiated. Defaults to 'agent' because
     * every pre-existing caller is a human acting in the CRM; the inbound
     * handler passes the customer-driven value explicitly.
     */
    source?: MarketingOptOutSource;
    actorUserId?: string | null;
  }
): Promise<boolean> {
  const phoneNormalized = normalizePhone(args.phone);
  if (!phoneNormalized) return false;

  // `.select()` on the delete so we can tell a real re-subscribe from a
  // no-op. Without it every idempotent call would log a fresh
  // 'subscribed' event and the history would fill with transitions that
  // never happened.
  const { data, error } = await db
    .from('marketing_opt_outs')
    .delete()
    .eq('account_id', args.accountId)
    .eq('phone_normalized', phoneNormalized)
    .select('id');

  if (error) {
    console.error('[opt-out] failed to remove opt-out:', error.message);
    return false;
  }

  if ((data?.length ?? 0) > 0) {
    await recordSubscriptionEvent(db, {
      accountId: args.accountId,
      phone: phoneNormalized,
      contactId: null,
      event: 'subscribed',
      source: args.source ?? 'agent',
      actorUserId: args.actorUserId ?? null,
    });
  }

  // Deleting nothing is still success: the number is not suppressed,
  // which is what the caller asked for.
  return true;
}

// ============================================================
// Subscription lifecycle (audit)
// ============================================================

export type SubscriptionEventName = 'subscribed' | 'unsubscribed';

export interface SubscriptionStatus {
  /**
   * The CURRENT state, always derived from the suppression index rather
   * than from the event log. The index is what the send paths enforce, so
   * anything else here would be a status that disagrees with behaviour.
   */
  status: SubscriptionEventName;
  /**
   * When the current state began, or null when it was never recorded.
   *
   * Null is the normal case for a contact who simply never unsubscribed:
   * everybody starts subscribed, and no event marks a beginning that did
   * not happen. Callers that want to show a date anyway should fall back
   * to the contact's own `created_at` and say so.
   */
  since: string | null;
  /** How the current state came about, when known. */
  source: MarketingOptOutSource | null;
}

/**
 * Append one row to the lifecycle log.
 *
 * Best-effort and never throws. The suppression index is already written
 * by the time this runs, so a failure here costs history — not
 * correctness. Loud in the log because silent audit gaps are how a
 * consent record stops being evidence.
 */
export async function recordSubscriptionEvent(
  db: SupabaseClient,
  args: {
    accountId: string;
    phone: string;
    contactId?: string | null;
    event: SubscriptionEventName;
    source: MarketingOptOutSource;
    actorUserId?: string | null;
  }
): Promise<boolean> {
  const phoneNormalized = normalizePhone(args.phone);
  if (!phoneNormalized) return false;

  try {
    const { error } = await db.from('marketing_subscription_events').insert({
      account_id: args.accountId,
      phone_normalized: phoneNormalized,
      contact_id: args.contactId ?? null,
      event: args.event,
      source: args.source,
      actor_user_id: args.actorUserId ?? null,
    });

    if (error) {
      console.error(
        '[opt-out] failed to log a subscription event:',
        error.message
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      '[opt-out] logging a subscription event threw:',
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Resolve one number's subscription status and the date it began.
 *
 * Two reads in parallel, and they answer different questions on purpose:
 *
 *   * `marketing_opt_outs` decides the STATUS, because it is what the
 *     send paths obey. A status line that disagreed with what actually
 *     sends would be worse than no status line.
 *   * the newest event supplies the DATE and the reason.
 *
 * The two can legitimately disagree — an event insert may have failed
 * after the suppression write succeeded. When the newest event does not
 * match the enforced status it is ignored rather than trusted, and the
 * opt-out row's own `opted_out_at` is used instead. Never throws: this
 * feeds a badge, and a badge must not be able to break a contact page.
 */
export async function resolveSubscriptionStatus(
  db: SupabaseClient,
  args: { accountId: string; phone: string }
): Promise<SubscriptionStatus> {
  const phoneNormalized = normalizePhone(args.phone);
  if (!phoneNormalized) {
    return { status: 'subscribed', since: null, source: null };
  }

  try {
    const [optOutRes, eventRes] = await Promise.all([
      db
        .from('marketing_opt_outs')
        .select('opted_out_at, source')
        .eq('account_id', args.accountId)
        .eq('phone_normalized', phoneNormalized)
        .maybeSingle(),
      db
        .from('marketing_subscription_events')
        .select('event, source, occurred_at')
        .eq('account_id', args.accountId)
        .eq('phone_normalized', phoneNormalized)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (optOutRes.error) {
      // Same direction as filterOptedOutPhones: on a read failure do not
      // claim somebody is unsubscribed when we could not check.
      console.error(
        '[opt-out] status lookup failed, reporting subscribed:',
        optOutRes.error.message
      );
      return { status: 'subscribed', since: null, source: null };
    }

    const optOut = optOutRes.data as {
      opted_out_at?: string | null;
      source?: string | null;
    } | null;
    const latest = eventRes.error
      ? null
      : (eventRes.data as {
          event?: string | null;
          source?: string | null;
          occurred_at?: string | null;
        } | null);

    const status: SubscriptionEventName = optOut
      ? 'unsubscribed'
      : 'subscribed';
    const latestAgrees = latest?.event === status;

    if (status === 'unsubscribed') {
      return {
        status,
        since:
          (latestAgrees ? latest?.occurred_at : null) ??
          optOut?.opted_out_at ??
          null,
        source: ((latestAgrees ? latest?.source : null) ??
          optOut?.source ??
          null) as MarketingOptOutSource | null,
      };
    }

    return {
      status,
      // No fallback here by design. A subscribed number with no
      // 'subscribed' event has simply never left, and there is no
      // honest date for that in this table.
      since: latestAgrees ? (latest?.occurred_at ?? null) : null,
      source: latestAgrees
        ? ((latest?.source ?? null) as MarketingOptOutSource | null)
        : null,
    };
  } catch (err) {
    console.error(
      '[opt-out] status lookup threw, reporting subscribed:',
      err instanceof Error ? err.message : err
    );
    return { status: 'subscribed', since: null, source: null };
  }
}

/**
 * Extract Meta's numeric error code from a thrown send error.
 *
 * `MetaApiError` carries it structurally. The string fallback exists
 * because the code travels through several layers that re-wrap it as
 * text — `(#131050)`, `code: 131050`, or bare in a sentence — and the
 * broadcast loops in particular catch `error.message` rather than the
 * error object. Matched as a standalone number, mirroring the extraction
 * already used in meta-send-errors.ts.
 */
export function extractMetaErrorCode(error: unknown): number | null {
  if (error instanceof MetaApiError && error.code !== null) {
    return error.code;
  }
  const text =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (!text) return null;
  const match = text.match(/(?<!\d)(\d{4,7})(?!\d)/);
  return match ? Number(match[1]) : null;
}

/** True when a send failure was Meta reporting a marketing opt-out. */
export function isMetaMarketingOptOutError(error: unknown): boolean {
  return extractMetaErrorCode(error) === META_MARKETING_OPT_OUT_CODE;
}

/**
 * Turn a 131050 send failure into a stored opt-out.
 *
 * Meta already refuses these sends, so this changes nothing about the
 * current message. What it buys is not rediscovering the same fact on
 * every future broadcast — and an accurate local list the UI can show.
 *
 * Best-effort and never throws: the caller is already handling a send
 * failure and must not acquire a second one here.
 */
export async function recordOptOutFromSendError(
  db: SupabaseClient,
  args: {
    accountId: string;
    phone: string;
    contactId?: string | null;
    error: unknown;
  }
): Promise<boolean> {
  if (!isMetaMarketingOptOutError(args.error)) return false;
  try {
    const result = await recordMarketingOptOut(db, {
      accountId: args.accountId,
      phone: args.phone,
      contactId: args.contactId ?? null,
      source: 'meta_131050',
    });
    return result !== 'failed';
  } catch (err) {
    console.error(
      '[opt-out] recording a 131050 opt-out threw:',
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
