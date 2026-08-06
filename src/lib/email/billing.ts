// ============================================================
// Billing notification emails — SERVER ONLY (service role).
//
// Three moments in the manual UPI flow are worth an email, because each
// one is a point where the customer would otherwise be left guessing:
//
//   submitted -> "we have your payment, a human is checking it"
//   approved  -> "you're live, here is until when"
//   rejected  -> "here is exactly what was wrong, and how to fix it"
//
// Every function here is best-effort and returns void. They are called
// from `after()` in the route handlers, i.e. AFTER the response has been
// sent and after the database writes have committed. A failure to email
// must never be able to present itself to the operator as a failure to
// approve — see the note on sendEmail in ./send.
//
// Copy that the super admin can already edit in the CMS is reused here
// rather than hardcoded (`pending_review_message`, `support_note`), so
// the tone of these emails stays in their hands, consistent with the
// rest of the subscription flow.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { formatCurrency } from '@/lib/currency';
import { formatCopyDate } from '@/lib/subscription/copy';

import {
  button,
  detailTable,
  heading,
  notice,
  paragraph,
  renderEmail,
  toPlainText,
  type DetailRow,
} from './layout';
import { sendEmailQuietly } from './send';

const FALLBACK_SITE_NAME = 'Replai';
const FALLBACK_APP_URL = 'https://wacrm.tech';

interface Branding {
  siteName: string;
  /** Where to tell customers to write. Null when none is configured. */
  supportEmail: string | null;
  /** No trailing slash. */
  appUrl: string;
}

/**
 * Branding for the email chrome, read from the `site_settings`
 * singleton — the same source the marketing site and contact-reply email
 * use, so a rename propagates everywhere at once.
 *
 * Fails soft to the product name. An email that says "Replai" when the
 * operator has rebranded is a cosmetic problem; an email that never
 * sends because a settings read failed is a support ticket.
 */
async function getBranding(): Promise<Branding> {
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_APP_URL).replace(
    /\/+$/,
    '',
  );

  try {
    const { data } = await supabaseAdmin()
      .from('site_settings')
      .select('site_name, support_email')
      .limit(1)
      .maybeSingle();

    return {
      siteName: data?.site_name || FALLBACK_SITE_NAME,
      supportEmail: data?.support_email || null,
      appUrl,
    };
  } catch (err) {
    console.error(
      '[email] branding lookup failed, using defaults:',
      err instanceof Error ? err.message : err,
    );
    return { siteName: FALLBACK_SITE_NAME, supportEmail: null, appUrl };
  }
}

/** Admin-authored copy reused in these emails. */
interface BillingCopy {
  pendingReviewMessage: string | null;
  supportNote: string | null;
}

async function getBillingCopy(): Promise<BillingCopy> {
  try {
    const { data } = await supabaseAdmin()
      .from('subscription_settings')
      .select('pending_review_message, support_note')
      .limit(1)
      .maybeSingle();

    return {
      pendingReviewMessage: data?.pending_review_message || null,
      supportNote: data?.support_note || null,
    };
  } catch {
    return { pendingReviewMessage: null, supportNote: null };
  }
}

interface Recipient {
  email: string;
  name: string | null;
}

/**
 * Who to email about a payment request.
 *
 * Prefers the person who actually submitted it, falling back to the
 * account owner. In practice these are the same human today, because
 * `requireBillingOwner` restricts submission to owners — the fallback
 * exists for the case where an owner is transferred or a profile row is
 * missing an address, so a notification still reaches somebody who can
 * act on it rather than being silently dropped.
 */
async function resolveRecipient(
  accountId: string,
  submitterUserId: string | null,
): Promise<Recipient | null> {
  const admin = supabaseAdmin();

  if (submitterUserId) {
    const { data } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', submitterUserId)
      .maybeSingle();

    if (data?.email) {
      return { email: data.email, name: data.full_name ?? null };
    }
  }

  const { data: account } = await admin
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle();

  if (!account?.owner_user_id) return null;

  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', account.owner_user_id)
    .maybeSingle();

  if (!owner?.email) return null;
  return { email: owner.email, name: owner.full_name ?? null };
}

/** "Hi Souaib," / "Hi there," when we have no name on file. */
function greeting(recipient: Recipient): string {
  const first = recipient.name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi there,';
}

/** Footer small print — support address when one is configured. */
function footerNote(branding: Branding, copy: BillingCopy): string {
  const parts: string[] = [];
  if (copy.supportNote) parts.push(copy.supportNote);
  parts.push(
    branding.supportEmail
      ? `Questions about this payment? Reply to this email or write to ${branding.supportEmail}.`
      : 'Questions about this payment? Just reply to this email.',
  );
  return parts.join('\n');
}

/** The plan/amount summary shared by all three emails. */
function paymentRows(input: {
  planName: string | null;
  cycleLabel: string | null;
  paidAmount: number;
  currency: string;
  transactionRef: string | null;
  payerName?: string | null;
}): DetailRow[] {
  return [
    { label: 'Plan', value: input.planName ?? '—', emphasis: true },
    { label: 'Billing period', value: input.cycleLabel ?? '' },
    {
      label: 'Amount paid',
      value: formatCurrency(input.paidAmount, input.currency),
      emphasis: true,
    },
    { label: 'Transaction / UTR ID', value: input.transactionRef ?? '' },
    { label: 'Paid by', value: input.payerName ?? '' },
  ];
}

// ------------------------------------------------------------
// 1. Payment submitted — acknowledgement
// ------------------------------------------------------------

export interface PaymentSubmittedInput {
  accountId: string;
  submitterUserId: string | null;
  planName: string | null;
  cycleLabel: string | null;
  expectedAmount: number;
  paidAmount: number;
  currency: string;
  transactionRef: string;
  payerName: string | null;
  submittedAt: string | Date;
}

export async function sendPaymentSubmittedEmail(
  input: PaymentSubmittedInput,
): Promise<void> {
  const recipient = await resolveRecipient(input.accountId, input.submitterUserId);
  if (!recipient) {
    console.warn('[email] payment-submitted skipped — no address for account', input.accountId);
    return;
  }

  const [branding, copy] = await Promise.all([getBranding(), getBillingCopy()]);

  const rows = paymentRows(input);
  rows.push({
    label: 'Submitted on',
    value: formatCopyDate(input.submittedAt) || '',
  });

  // Only surface the expected price when it differs from what was paid.
  // Restating a matching amount twice reads like a discrepancy warning;
  // flagging a genuine mismatch up front is what prevents a surprised
  // customer when the reviewer comes back with a query.
  const mismatch = Math.abs(input.paidAmount - input.expectedAmount) >= 0.01;

  const content = [
    heading('We have your payment details'),
    paragraph(greeting(recipient)),
    paragraph(
      `Thanks for your payment. Our team verifies every transfer by hand against our bank records, so your ${input.planName ?? 'subscription'} will be activated once that check is done. We will email you the moment it is.`,
    ),
    detailTable(rows),
    mismatch
      ? notice({
          tone: 'warning',
          title: 'The amount does not match the plan price',
          body: `This plan is priced at ${formatCurrency(input.expectedAmount, input.currency)} and you entered ${formatCurrency(input.paidAmount, input.currency)}. That is fine if it was deliberate — our reviewer will look at the actual transfer. If you think you mistyped the amount, reply to this email and let us know.`,
        })
      : '',
    copy.pendingReviewMessage
      ? notice({ tone: 'neutral', body: copy.pendingReviewMessage })
      : '',
    paragraph(
      'You do not need to do anything else, and please do not send the payment again — a second transfer for the same plan would need to be refunded manually.',
    ),
    button({ href: `${branding.appUrl}/settings`, label: 'View billing status' }),
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmail({
    siteName: branding.siteName,
    preheader: `We received your ${input.planName ?? 'subscription'} payment and it is now being verified.`,
    content,
    footerNote: footerNote(branding, copy),
  });

  await sendEmailQuietly('payment-submitted', {
    to: recipient.email,
    subject: `We received your payment — ${input.planName ?? 'subscription'} is being verified`,
    html,
    text: toPlainText(html),
    fromName: `${branding.siteName} Billing`,
    replyTo: branding.supportEmail,
  });
}

// ------------------------------------------------------------
// 2. Payment approved — subscription active
// ------------------------------------------------------------

export interface PaymentApprovedInput {
  accountId: string;
  submitterUserId: string | null;
  planName: string | null;
  cycleLabel: string | null;
  paidAmount: number;
  currency: string;
  transactionRef: string | null;
  payerName: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  /** True when this topped up an existing window instead of starting one. */
  extended: boolean;
  /** The reviewing admin's optional note to the customer. */
  reviewNote: string | null;
}

export async function sendPaymentApprovedEmail(
  input: PaymentApprovedInput,
): Promise<void> {
  const recipient = await resolveRecipient(input.accountId, input.submitterUserId);
  if (!recipient) {
    console.warn('[email] payment-approved skipped — no address for account', input.accountId);
    return;
  }

  const [branding, copy] = await Promise.all([getBranding(), getBillingCopy()]);

  const renewsOn = formatCopyDate(input.endsAt);
  const rows = paymentRows(input);
  rows.push(
    { label: 'Active from', value: formatCopyDate(input.startsAt) || '' },
    { label: 'Renews on', value: renewsOn || '', emphasis: true },
  );

  const content = [
    heading(
      input.extended
        ? 'Your subscription has been extended'
        : 'Your subscription is now active',
    ),
    paragraph(greeting(recipient)),
    paragraph(
      input.extended
        ? `Your payment has been verified and the time has been added to your existing subscription, so you keep the days you had already paid for.`
        : `Your payment has been verified and your ${input.planName ?? 'subscription'} is live. Everything in your workspace is unlocked again.`,
    ),
    detailTable(rows),
    renewsOn
      ? notice({
          tone: 'success',
          title: 'Keep this for your records',
          body: `Your access runs until ${renewsOn}. We will remind you before it ends so there is no interruption.`,
        })
      : '',
    input.reviewNote
      ? notice({ tone: 'neutral', title: 'Note from our team', body: input.reviewNote })
      : '',
    button({ href: `${branding.appUrl}/dashboard`, label: 'Open your dashboard' }),
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmail({
    siteName: branding.siteName,
    preheader: renewsOn
      ? `Payment verified. Your ${input.planName ?? 'subscription'} is active until ${renewsOn}.`
      : `Payment verified. Your ${input.planName ?? 'subscription'} is active.`,
    content,
    footerNote: footerNote(branding, copy),
  });

  await sendEmailQuietly('payment-approved', {
    to: recipient.email,
    subject: input.extended
      ? `Subscription extended — ${input.planName ?? 'your plan'}`
      : `Payment confirmed — ${input.planName ?? 'your subscription'} is active`,
    html,
    text: toPlainText(html),
    fromName: `${branding.siteName} Billing`,
    replyTo: branding.supportEmail,
  });
}

// ------------------------------------------------------------
// 3. Payment rejected — what to fix
// ------------------------------------------------------------

export interface PaymentRejectedInput {
  accountId: string;
  submitterUserId: string | null;
  planName: string | null;
  cycleLabel: string | null;
  expectedAmount: number;
  paidAmount: number;
  currency: string;
  transactionRef: string | null;
  payerName: string | null;
  /** The reviewer's reason. Required by the API, so always present. */
  reviewNote: string | null;
}

export async function sendPaymentRejectedEmail(
  input: PaymentRejectedInput,
): Promise<void> {
  const recipient = await resolveRecipient(input.accountId, input.submitterUserId);
  if (!recipient) {
    console.warn('[email] payment-rejected skipped — no address for account', input.accountId);
    return;
  }

  const [branding, copy] = await Promise.all([getBranding(), getBillingCopy()]);

  const rows = paymentRows(input);
  rows.push({
    label: 'Plan price',
    value: formatCurrency(input.expectedAmount, input.currency),
  });

  const content = [
    heading('We could not verify this payment'),
    paragraph(greeting(recipient)),
    paragraph(
      `We checked the payment you submitted for the ${input.planName ?? 'subscription'} plan against our bank records and were not able to confirm it, so your subscription has not been activated.`,
    ),
    notice({
      tone: 'danger',
      title: 'Reason given by our team',
      body:
        input.reviewNote ??
        'No specific reason was recorded. Please reply to this email and we will look into it.',
    }),
    detailTable(rows),
    paragraph(
      'If you have the transaction reference or a screenshot from your bank or UPI app, reply to this email with it and we will re-check straight away. You can also submit the payment details again with the corrected information.',
    ),
    notice({
      tone: 'neutral',
      title: 'No money has been taken by us',
      body:
        'This message only means we could not match the transfer to our records. If your bank shows the amount as debited, do not pay again — send us the reference and we will trace it.',
    }),
    button({ href: `${branding.appUrl}/upgrade-plan`, label: 'Submit payment details again' }),
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmail({
    siteName: branding.siteName,
    preheader: `We could not verify your ${input.planName ?? 'subscription'} payment. Here is what to do next.`,
    content,
    footerNote: footerNote(branding, copy),
  });

  await sendEmailQuietly('payment-rejected', {
    to: recipient.email,
    subject: `Action needed — we could not verify your ${input.planName ?? 'subscription'} payment`,
    html,
    text: toPlainText(html),
    fromName: `${branding.siteName} Billing`,
    replyTo: branding.supportEmail,
  });
}
