// ============================================================
// "Support replied while you were away" — SERVER ONLY.
//
// Phase 4 made a reply visible to anyone already in the app. This reaches
// the person who asked a question and then closed the tab, which is how a
// support conversation normally goes.
//
// ─── What has to be true before we email ─────────────────────
//
//   1. The conversation has unread replies for the workspace.
//   2. The newest operator reply has aged past REPLY_GRACE_MINUTES.
//   3. NOBODY on that workspace has been seen in the app since that reply
//      was sent.
//   4. We have not emailed this workspace in the last
//      REPLY_EMAIL_COOLDOWN_HOURS.
//
// (3) is the condition that makes this feel considerate rather than
// noisy, and it is cheap because presence is already a table this product
// maintains. Somebody who was in the app after we answered has had the
// badge in front of them; emailing them as well is nagging. Somebody who
// has not been back has no way of knowing at all.
//
// (2) matters for the same reason from the other direction: without a
// grace window, replying to a customer who is reading the thread live
// would email them mid-conversation.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { getEmailBranding } from '@/lib/email/branding';
import {
  button,
  heading,
  notice,
  paragraph,
  renderEmail,
  toPlainText,
} from '@/lib/email/layout';
import { isEmailConfigured, sendEmail } from '@/lib/email/send';
import {
  getSupportAccessForAccounts,
  loadSupportSettings,
} from './availability';
import { SUPPORT_CONVERSATIONS_TABLE, SUPPORT_MESSAGES_TABLE } from './types';

/**
 * How long a reply must sit unread before we email about it.
 *
 * Longer than it takes someone reading the thread to answer, shorter than
 * it takes them to forget they asked. It also gives the badge a chance:
 * most replies to an active customer are seen within a minute or two, and
 * those should never generate mail.
 */
export const REPLY_GRACE_MINUTES = 10;

/**
 * Minimum gap between two emails about the same conversation.
 *
 * The ledger's UNIQUE(message_id) already stops us emailing twice about
 * ONE reply. This stops a conversation where an operator sends four
 * separate replies over an afternoon from producing four emails.
 */
export const REPLY_EMAIL_COOLDOWN_HOURS = 4;

/**
 * Most conversations handled per tick.
 *
 * Bounds the work of a single request, the way MAX_REMINDERS_PER_RUN does
 * for auto-mail. Anything skipped is picked up five minutes later, because
 * eligibility is recomputed every tick rather than queued.
 */
export const MAX_REPLY_EMAILS_PER_RUN = 25;

/** Most people we will write to about one conversation. */
const MAX_RECIPIENTS = 5;

export interface ReplyEmailOutcome {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface DueConversation {
  conversationId: string;
  accountId: string;
  accountName: string | null;
  /** The newest operator reply — the anchor for the claim. */
  messageId: string;
  messageAt: string;
  unreadCount: number;
}

/**
 * Find conversations whose unread replies deserve an email.
 *
 * Reads are deliberately narrow: only conversations that already have
 * `unread_for_account > 0` are examined at all, which on any real dataset
 * is a handful of rows rather than one per workspace.
 */
async function findDueConversations(
  admin: SupabaseClient
): Promise<DueConversation[]> {
  const graceCutoff = new Date(
    Date.now() - REPLY_GRACE_MINUTES * 60_000
  ).toISOString();

  const { data: conversations, error } = await admin
    .from(SUPPORT_CONVERSATIONS_TABLE)
    .select('id, account_id, unread_for_account, account:accounts(name)')
    .gt('unread_for_account', 0)
    .order('last_message_at', { ascending: true, nullsFirst: false })
    // Read more than we will send, because several of these will be
    // filtered out below by presence and cooldown.
    .limit(MAX_REPLY_EMAILS_PER_RUN * 4);

  if (error) {
    console.error(
      '[support-chat/reply-email] conversation scan failed:',
      error
    );
    return [];
  }

  // ---- (0) can this workspace open Live chat at all ----
  //
  // The email's only content is a link to Settings → Live chat. For a
  // workspace that has lost access — rule changed, WhatsApp disconnected,
  // blocked, or the feature switched off — that link opens a page saying
  // "not available". Batch-checked: three queries for the whole scan.
  const settings = await loadSupportSettings(admin);
  if (!settings.enabled) return [];
  const accessByAccount = await getSupportAccessForAccounts(
    admin,
    (conversations ?? []).map((r) => r.account_id as string),
    settings
  );

  const due: DueConversation[] = [];

  for (const row of conversations ?? []) {
    const conversationId = row.id as string;
    const accountId = row.account_id as string;
    const account = row.account as { name?: string | null } | null;

    if (!accessByAccount.get(accountId)?.available) continue;

    // ---- (2) the newest reply, and is it old enough ----
    const { data: reply } = await admin
      .from(SUPPORT_MESSAGES_TABLE)
      .select('id, created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_kind', 'admin')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!reply) continue;
    if ((reply.created_at as string) > graceCutoff) continue;

    // ---- (4) cooldown ----
    const cooldownCutoff = new Date(
      Date.now() - REPLY_EMAIL_COOLDOWN_HOURS * 3_600_000
    ).toISOString();
    const { data: recent } = await admin
      .from('support_reply_emails')
      .select('id')
      .eq('conversation_id', conversationId)
      .gte('created_at', cooldownCutoff)
      .limit(1)
      .maybeSingle();
    if (recent) continue;

    // ---- (3) has anyone been in the app since we replied ----
    //
    // `member_presence.last_seen_at` is maintained by the heartbeat the
    // app already runs. One row newer than the reply means somebody had
    // the badge in front of them, so this is not our problem to solve by
    // email.
    const { data: seenSince } = await admin
      .from('member_presence')
      .select('user_id')
      .eq('account_id', accountId)
      .gte('last_seen_at', reply.created_at as string)
      .limit(1)
      .maybeSingle();
    if (seenSince) continue;

    due.push({
      conversationId,
      accountId,
      accountName: account?.name ?? null,
      messageId: reply.id as string,
      messageAt: reply.created_at as string,
      unreadCount: (row.unread_for_account as number) ?? 1,
    });

    if (due.length >= MAX_REPLY_EMAILS_PER_RUN) break;
  }

  return due;
}

/**
 * Who should hear about this.
 *
 * The people who actually wrote in the thread come first — they asked the
 * question. The owner is included as a backstop, because a thread opened
 * by a member who has since left the workspace would otherwise have
 * nobody to notify.
 */
async function resolveRecipients(
  admin: SupabaseClient,
  conversationId: string,
  accountId: string
): Promise<string[]> {
  const emails: string[] = [];

  const { data: authored } = await admin
    .from(SUPPORT_MESSAGES_TABLE)
    .select('sender_user_id')
    .eq('conversation_id', conversationId)
    .eq('sender_kind', 'account')
    .not('sender_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const authorIds = [
    ...new Set(
      (authored ?? []).map((r) => r.sender_user_id as string).filter(Boolean)
    ),
  ];

  if (authorIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('email')
      .in('user_id', authorIds);
    for (const p of profiles ?? []) {
      const email = (p.email as string | null)?.trim();
      if (email) emails.push(email);
    }
  }

  const { data: owner } = await admin
    .from('profiles')
    .select('email')
    .eq('account_id', accountId)
    .eq('account_role', 'owner')
    .limit(1)
    .maybeSingle();
  const ownerEmail = (owner?.email as string | null)?.trim();
  if (ownerEmail) emails.push(ownerEmail);

  // Case-insensitive dedupe: the same person can be recorded with
  // different capitalisation, and two copies of one email is the kind of
  // detail a customer notices.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const email of emails) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
    if (unique.length >= MAX_RECIPIENTS) break;
  }
  return unique;
}

/**
 * Send one conversation's notification.
 *
 * Deliberately says NOTHING about what the reply contained. A support
 * thread routinely holds credentials, another customer's data, or whatever
 * the customer pasted while debugging — none of which should be forwarded
 * into an inbox we do not control, or sit in a mail server's logs. The
 * email's job is to say "there is an answer waiting, here is where".
 */
async function sendOne(
  admin: SupabaseClient,
  due: DueConversation
): Promise<'sent' | 'failed' | 'skipped'> {
  const recipients = await resolveRecipients(
    admin,
    due.conversationId,
    due.accountId
  );

  // ---- THE CLAIM. Before the send, never after. ----
  const { error: claimError } = await admin
    .from('support_reply_emails')
    .insert({
      conversation_id: due.conversationId,
      message_id: due.messageId,
      account_id: due.accountId,
      recipients,
      status: 'pending',
    });

  if (claimError) {
    // 23505 = unique_violation: another tick claimed this reply first.
    // Not an error — it is the mechanism working.
    if (claimError.code === '23505') return 'skipped';
    console.error('[support-chat/reply-email] claim failed:', claimError);
    return 'failed';
  }

  const finish = async (status: string, detail?: string) => {
    await admin
      .from('support_reply_emails')
      .update({ status, detail, updated_at: new Date().toISOString() })
      .eq('message_id', due.messageId);
  };

  if (recipients.length === 0) {
    await finish(
      'skipped',
      'No member of this workspace has an email address.'
    );
    return 'skipped';
  }

  const branding = await getEmailBranding('support-chat/reply-email');
  const link = `${branding.appUrl}/settings?tab=live-chat`;

  const count = due.unreadCount;
  const plural = count === 1 ? 'message' : 'messages';

  const content = [
    heading(
      count === 1
        ? 'You have a reply from our support team'
        : `You have ${count} replies from our support team`
    ),
    paragraph(
      `We answered your support chat${
        due.accountName ? ` for ${due.accountName}` : ''
      }. The conversation is waiting for you inside ${branding.siteName}.`
    ),
    notice({
      tone: 'neutral',
      title: `${count} unread ${plural}`,
      body: 'For your security we do not include the contents here — support chats often contain account details.',
    }),
    button({ href: link, label: 'Open the chat' }),
    paragraph(
      'Replying to this email will not reach the support thread. Use the button above so the conversation stays in one place.'
    ),
  ].join('\n');

  const html = renderEmail({
    siteName: branding.siteName,
    preheader: `${count} unread support ${plural} waiting in ${branding.siteName}.`,
    content,
    footerNote: branding.supportEmail
      ? `Need something else? Write to ${branding.supportEmail}.`
      : undefined,
    logoUrl: branding.logoUrl,
    logoDarkUrl: branding.logoDarkUrl,
  });

  const subject =
    count === 1
      ? 'Support replied to your message'
      : `Support replied — ${count} unread messages`;

  // One email per recipient rather than a shared To/Cc. Members of a
  // workspace are not necessarily colleagues who should see each other's
  // addresses, and a Cc list leaks the roster.
  let anySent = false;
  const failures: string[] = [];

  for (const to of recipients) {
    const result = await sendEmail({
      to,
      subject,
      html,
      text: toPlainText(html),
      fromName: `${branding.siteName} Support`,
      replyTo: branding.supportEmail ?? undefined,
    });
    if (result.ok) {
      anySent = true;
    } else {
      failures.push(
        `${to}: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`
      );
    }
  }

  if (anySent) {
    await finish(
      'sent',
      failures.length > 0 ? `Partial: ${failures.join('; ')}` : undefined
    );
    return 'sent';
  }

  await finish('failed', failures.join('; ') || 'Unknown send failure.');
  return 'failed';
}

/**
 * One sweep. Safe to call as often as you like.
 *
 * Never throws: it is invoked by a cron whose only caller is a shell
 * script that logs the body, so a thrown error would be an opaque 500 in a
 * log file. Every failure is counted and returned instead.
 */
export async function sendDueReplyEmails(
  admin: SupabaseClient
): Promise<ReplyEmailOutcome> {
  const outcome: ReplyEmailOutcome = {
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // Checked before any scanning: with no SMTP configured every claim would
  // be written and then immediately marked failed, burning the
  // UNIQUE(message_id) slot so the email could never be sent once
  // credentials were added.
  if (!isEmailConfigured()) return outcome;

  const due = await findDueConversations(admin);
  outcome.considered = due.length;

  for (const item of due) {
    try {
      const result = await sendOne(admin, item);
      outcome[result] += 1;
    } catch (err) {
      // One bad conversation must not stop the batch.
      outcome.failed += 1;
      console.error(
        `[support-chat/reply-email] unexpected error for conversation ${item.conversationId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return outcome;
}
