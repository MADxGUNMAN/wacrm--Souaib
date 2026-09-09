// ============================================================
// Auto Mail — eligibility and delivery. SERVER ONLY (service role).
//
// Two rules govern everything here:
//
// 1. WHO IS DUE IS DERIVED, NEVER STORED. `accounts.subscription_status`
//    is a hint — there is no cron flipping 'trialing' to 'expired' — so a
//    row can read `trialing` days after its trial ended. Filtering on
//    that column would mail people whose access lapsed a week ago. Every
//    decision below goes through `resolveSubscriptionState`, which is the
//    same function the access gate uses, so a reminder can never disagree
//    with what the customer actually experiences.
//
// 2. THE CLAIM IS THE INSERT. The cron runs every five minutes, so
//    "have we already sent this?" cannot be answered in JavaScript: two
//    overlapping ticks both read "no". The INSERT into `auto_email_log`
//    wins or loses a unique index, and the loser skips.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { getEmailBranding } from '@/lib/email/branding';
import { sendEmail } from '@/lib/email/send';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { formatCopyDate } from '@/lib/subscription/copy';
import {
  DEFAULT_GATE_CONFIG,
  resolveSubscriptionState,
  type SubscriptionGateConfig,
} from '@/lib/subscription/status';
import type { SubscriptionStatus } from '@/lib/subscription/types';

import { daysPhrase, renderReminderEmail, resolveDueOffset } from './templates';
import {
  AUTO_EMAIL_SEGMENTS,
  type AutoEmailRule,
  type AutoEmailSegment,
  type AutoEmailVars,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The service-role client. Typed loosely on purpose: these tables are new
 * and are not in the generated Database types, and threading a hand-written
 * generic through every call would obscure the logic without adding safety
 * the runtime does not already have (the columns are checked by the DB).
 */
type Admin = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Ceiling per tick, so one run cannot become unbounded work. */
export const MAX_REMINDERS_PER_RUN = 100;

// ------------------------------------------------------------
// Rules
// ------------------------------------------------------------

export async function loadRules(
  admin: Admin
): Promise<Record<AutoEmailSegment, AutoEmailRule | null>> {
  const { data, error } = await admin.from('auto_email_rules').select('*');

  const out: Record<AutoEmailSegment, AutoEmailRule | null> = {
    trial: null,
    paid: null,
  };
  if (error || !data) return out;

  for (const row of data as AutoEmailRule[]) {
    if (AUTO_EMAIL_SEGMENTS.includes(row.segment)) out[row.segment] = row;
  }
  return out;
}

/**
 * Workspaces belonging to a platform operator, which Auto Mail ignores.
 *
 * A super admin's own workspace is not a customer. It exists so they can
 * use the product, it typically has a long-dead trial nobody intends to
 * renew, and billing it would be billing ourselves. Mailing it produces a
 * reminder that reaches the person who configured the reminder — noise
 * that also inflates every count on the Auto Mail screen.
 *
 * Keyed on the OWNER's `is_super_admin`, not on an email domain or an
 * allowlist: the flag is already what the app means by "operator", so this
 * stays correct when staff change.
 *
 * Returns account IDs rather than user IDs so callers can filter without
 * needing the join twice.
 */
export async function loadOperatorAccountIds(
  admin: Admin
): Promise<Set<string>> {
  const { data: admins, error } = await admin
    .from('profiles')
    .select('user_id')
    .eq('is_super_admin', true);

  if (error || !admins || admins.length === 0) {
    if (error) {
      // Fail OPEN, deliberately. If this lookup breaks, the cost is one
      // unwanted email to an operator; failing closed would suppress
      // reminders for every real customer instead.
      console.error(
        '[auto-mail] operator lookup failed, no accounts excluded:',
        error.message
      );
    }
    return new Set();
  }

  const ids = (admins as { user_id: string }[]).map((a) => a.user_id);

  const { data: accounts } = await admin
    .from('accounts')
    .select('id')
    .in('owner_user_id', ids);

  return new Set((accounts ?? []).map((a) => (a as { id: string }).id));
}

export async function loadRule(
  admin: Admin,
  segment: AutoEmailSegment
): Promise<AutoEmailRule | null> {
  const { data } = await admin
    .from('auto_email_rules')
    .select('*')
    .eq('segment', segment)
    .maybeSingle();
  return (data as AutoEmailRule | null) ?? null;
}

// ------------------------------------------------------------
// Recipient
// ------------------------------------------------------------

export interface Recipient {
  email: string;
  name: string | null;
  userId: string;
}

/**
 * The workspace owner.
 *
 * Only the owner: a renewal reminder is a request to pay, and a member
 * who cannot reach billing would just be confused by it. This mirrors
 * `requireBillingOwner`, which is what actually gates the payment screen
 * the email links to.
 */
export async function resolveOwnerRecipient(
  admin: Admin,
  accountId: string
): Promise<Recipient | null> {
  const { data: account } = await admin
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle();

  const ownerId = account?.owner_user_id as string | undefined;
  if (!ownerId) return null;

  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    // `user_id`, never `id` — profiles is keyed by the auth user.
    .eq('user_id', ownerId)
    .maybeSingle();

  if (!owner?.email) return null;
  return {
    email: owner.email as string,
    name: (owner.full_name as string | null) ?? null,
    userId: ownerId,
  };
}

// ------------------------------------------------------------
// Eligibility
// ------------------------------------------------------------

export interface DueReminder {
  accountId: string;
  accountName: string;
  segment: AutoEmailSegment;
  offsetDays: number;
  daysLeft: number;
  windowEnd: Date;
  planName: string | null;
}

interface CandidateRow {
  id: string;
  name: string | null;
  is_banned: boolean | null;
  auto_email_opted_out: boolean | null;
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  subscription_plan_name: string | null;
  selected_plan_id: string | null;
}

/**
 * Every account with a reminder due right now.
 *
 * The SQL filter is only a cheap pre-cut — any account whose trial or
 * paid window closes inside the widest configured horizon. The real
 * decision is made per row by `resolveSubscriptionState`, because only it
 * knows which of the two windows is the live one when both are set.
 */
export async function findDueReminders(
  admin: Admin,
  options: {
    rules: Record<AutoEmailSegment, AutoEmailRule | null>;
    gateConfig?: SubscriptionGateConfig;
    now?: Date;
    limit?: number;
  }
): Promise<DueReminder[]> {
  const now = options.now ?? new Date();
  const gateConfig = options.gateConfig ?? DEFAULT_GATE_CONFIG;
  const limit = options.limit ?? MAX_REMINDERS_PER_RUN;

  // Billing switched off platform-wide means nothing expires, so nothing
  // is worth warning anybody about.
  if (!gateConfig.is_enabled) return [];

  const active = AUTO_EMAIL_SEGMENTS.map((s) => options.rules[s]).filter(
    (r): r is AutoEmailRule =>
      Boolean(r) && r!.is_enabled && r!.offsets_days.length > 0
  );
  if (active.length === 0) return [];

  const horizonDays = Math.max(
    ...active.flatMap((r) => r.offsets_days.filter((n) => n > 0))
  );
  if (!Number.isFinite(horizonDays) || horizonDays <= 0) return [];

  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const nowIso = now.toISOString();
  const horizonIso = horizon.toISOString();

  const operatorAccounts = await loadOperatorAccountIds(admin);

  const { data, error } = await admin
    .from('accounts')
    .select(
      'id, name, is_banned, auto_email_opted_out, subscription_status, trial_ends_at, subscription_ends_at, subscription_plan_name, selected_plan_id'
    )
    .eq('is_banned', false)
    .eq('auto_email_opted_out', false)
    // Either window landing inside the horizon makes the row worth
    // resolving. `.or` rather than two queries so paging stays coherent.
    .or(
      `and(trial_ends_at.gte.${nowIso},trial_ends_at.lte.${horizonIso}),and(subscription_ends_at.gte.${nowIso},subscription_ends_at.lte.${horizonIso})`
    )
    // Soonest deadline first: if the batch ceiling truncates the run, the
    // most urgent reminders are the ones that got sent.
    .order('trial_ends_at', { ascending: true, nullsFirst: false })
    .limit(limit * 2);

  if (error || !data) {
    if (error)
      console.error('[auto-mail] candidate query failed:', error.message);
    return [];
  }

  const rows = data as CandidateRow[];

  // Plan names for trialing accounts that chose a plan but have not paid.
  // Batched rather than per row: this runs every five minutes.
  const selectedIds = [
    ...new Set(rows.map((r) => r.selected_plan_id).filter(Boolean)),
  ] as string[];
  const planNames = new Map<string, string>();
  if (selectedIds.length > 0) {
    const { data: plans } = await admin
      .from('subscription_plans')
      .select('id, name')
      .in('id', selectedIds);
    for (const p of (plans ?? []) as { id: string; name: string }[]) {
      planNames.set(p.id, p.name);
    }
  }

  const due: DueReminder[] = [];

  for (const row of rows) {
    if (due.length >= limit) break;

    // The operator's own workspace is not a customer — see
    // loadOperatorAccountIds.
    if (operatorAccounts.has(row.id)) continue;

    // `null` -> `undefined` so the resolver applies its own default
    // ('trialing'). A `Partial<AccountSubscriptionRow>` distinguishes
    // "absent" from "explicitly null", and the DB gives us the latter.
    const state = resolveSubscriptionState(
      { ...row, subscription_status: row.subscription_status ?? undefined },
      gateConfig,
      now
    );

    // Nothing to warn about: no live window, or it has already closed.
    if (!state.endsAt || state.daysLeft === null) continue;
    if (state.isExpired || state.isBlocked) continue;

    /**
     * Coverage is already queued behind this window, so the customer is
     * NOT about to lose access — a trialing account that has paid, or a
     * paid account holding bonus trial days. The entire premise of the
     * email is "act before this date or service stops", which would be
     * untrue here.
     */
    if (state.pendingWindow) continue;

    const segment: AutoEmailSegment | null = state.isTrialing
      ? 'trial'
      : state.isActive
        ? 'paid'
        : null;
    if (!segment) continue;

    const rule = options.rules[segment];
    if (!rule || !rule.is_enabled) continue;

    const offsetDays = resolveDueOffset(state.daysLeft, rule.offsets_days);
    if (offsetDays === null) continue;

    due.push({
      accountId: row.id,
      accountName: row.name ?? 'Workspace',
      segment,
      offsetDays,
      daysLeft: state.daysLeft,
      windowEnd: state.endsAt,
      planName:
        row.subscription_plan_name ??
        (row.selected_plan_id
          ? (planNames.get(row.selected_plan_id) ?? null)
          : null),
    });
  }

  return due;
}

// ------------------------------------------------------------
// Delivery
// ------------------------------------------------------------

export type SendOutcome =
  | { status: 'sent'; logId: string }
  | { status: 'failed'; logId: string | null; detail: string }
  | { status: 'skipped'; reason: string }
  | { status: 'already_claimed' };

export function buildVars(input: {
  recipient: Recipient;
  accountName: string;
  siteName: string;
  windowEnd: Date;
  daysLeft: number;
  planName: string | null;
}): AutoEmailVars {
  const full = input.recipient.name?.trim() ?? '';
  const first = full.split(/\s+/)[0] ?? '';
  return {
    // "there" rather than an empty string so "Hi {name}," never renders
    // as the bare "Hi," that a dropped token would leave behind.
    name: first || 'there',
    full_name: full,
    workspace: input.accountName,
    site_name: input.siteName,
    expiry_date: formatCopyDate(input.windowEnd),
    days_left: input.daysLeft,
    days_phrase: daysPhrase(input.daysLeft),
    plan_name: input.planName ?? '',
  };
}

/**
 * Claim, render, send, record.
 *
 * ORDER MATTERS. The claim row is written BEFORE the SMTP call and then
 * updated with the outcome. Sending first and recording after would mean
 * a crash between the two re-sends the same email on the next tick,
 * which is the one failure the customer actually notices.
 *
 * A failed send KEEPS its claim, so the automatic path does not retry.
 * Deliberate: a permanently bad address or a rejected domain would
 * otherwise be retried 288 times a day, and the reminder is not important
 * enough to justify that. The row shows as `failed` in the admin UI and
 * "Send now" is the recovery path — a human deciding to retry, rather
 * than a loop.
 */
export async function sendReminder(
  admin: Admin,
  input: {
    accountId: string;
    accountName: string;
    segment: AutoEmailSegment;
    offsetDays: number;
    daysLeft: number;
    windowEnd: Date;
    planName: string | null;
    rule: AutoEmailRule;
    trigger: 'auto' | 'manual';
    triggeredBy?: string | null;
  }
): Promise<SendOutcome> {
  const recipient = await resolveOwnerRecipient(admin, input.accountId);

  if (!recipient) {
    /**
     * No claim row on purpose. Claiming would permanently suppress this
     * reminder, and the cause here is usually transient or fixable — an
     * owner mid-transfer, a profile missing an address. Returning without
     * a claim means the next tick tries again once the data is repaired,
     * at the cost of nothing (no email was sent, no row written).
     */
    return { status: 'skipped', reason: 'no owner email on file' };
  }

  const branding = await getEmailBranding('auto-mail');
  const vars = buildVars({
    recipient,
    accountName: input.accountName,
    siteName: branding.siteName,
    windowEnd: input.windowEnd,
    daysLeft: input.daysLeft,
    planName: input.planName,
  });

  const rendered = renderReminderEmail({ rule: input.rule, vars, branding });

  const { data: claim, error: claimError } = await admin
    .from('auto_email_log')
    .insert({
      account_id: input.accountId,
      segment: input.segment,
      offset_days: input.offsetDays,
      window_end: input.windowEnd.toISOString(),
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      subject: rendered.subject,
      days_left: input.daysLeft,
      status: 'sending',
      trigger: input.trigger,
      triggered_by: input.triggeredBy ?? null,
    })
    .select('id')
    .single();

  if (claimError) {
    // Lost the race — another tick owns this send.
    if (isUniqueViolation(claimError)) return { status: 'already_claimed' };
    console.error('[auto-mail] claim failed:', claimError.message);
    return { status: 'failed', logId: null, detail: claimError.message };
  }

  const logId = (claim as { id: string }).id;

  const result = await sendEmail({
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromName: `${branding.siteName} Billing`,
    replyTo: branding.supportEmail,
  });

  const patch = result.ok
    ? { status: 'sent', error_detail: null }
    : {
        // `not_configured` is a dev machine without SMTP, not a fault.
        // Recorded as skipped so a local run does not fill the admin's
        // failure list with noise that needs no action.
        status: result.reason === 'not_configured' ? 'skipped' : 'failed',
        error_detail: result.detail
          ? `${result.reason}: ${result.detail}`
          : result.reason,
      };

  await admin
    .from('auto_email_log')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', logId);

  if (result.ok) return { status: 'sent', logId };
  if (patch.status === 'skipped') {
    return { status: 'skipped', reason: 'SMTP is not configured' };
  }
  return {
    status: 'failed',
    logId,
    detail: patch.error_detail ?? 'unknown error',
  };
}
