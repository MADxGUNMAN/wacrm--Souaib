// ============================================================
// Transactional email transport — SERVER ONLY.
//
// The app previously sent mail from exactly one place (the super admin
// contact-reply route) with the transport built inline. This module is
// that logic extracted and hardened, so billing notifications and any
// future email share one code path.
//
// THE CENTRAL RULE: sendEmail NEVER THROWS.
//
// That is not defensive habit, it is a correctness requirement. These
// emails fire after a payment has already been recorded, approved or
// rejected — writes that are committed and, in the approval case, have
// already granted a subscription window. If a dead SMTP host could throw
// into that path the admin would see a failure, press Approve again, and
// get a 409 from the claim guard for work that actually succeeded. So
// every failure mode here is returned as a value and logged, and callers
// treat email as best-effort.
//
// Missing SMTP config is treated the same way: a skip, not an error. A
// developer running locally without SMTP credentials must still be able
// to submit and approve payments.
// ============================================================

import { access } from 'node:fs/promises';
import path from 'node:path';

/**
 * Content id the layout references as `cid:${EMAIL_LOGO_CID}`. Inline
 * CID attachment rather than a hosted URL because many clients block
 * remote images by default, which would leave the header blank.
 */
export const EMAIL_LOGO_CID = 'brand-logo';

const LOGO_FILE = ['public', 'logo-full.jpg'];

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Worth supplying — it lifts spam scores. */
  text?: string;
  /** Display name on the From header, e.g. "Replai Billing". */
  fromName: string;
  /** Defaults to the SMTP user so replies reach a real inbox. */
  replyTo?: string | null;
}

export type EmailResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * `not_configured` and `no_recipient` are expected conditions, not
       * faults — separated from `send_failed` so callers can log them at
       * a lower level and monitoring doesn't cry wolf on a dev machine.
       */
      reason: 'not_configured' | 'no_recipient' | 'send_failed';
      detail?: string;
    };

/** Whether SMTP credentials are present. Cheap; no connection attempt. */
export function isEmailConfigured(): boolean {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/**
 * Absolute path to the brand logo, or null when it isn't on disk.
 *
 * Checked rather than assumed because nodemailer REJECTS the whole send
 * when an attachment path doesn't resolve. The Dockerfile does copy
 * `public/` into the runtime image, so this should always be present —
 * but a broken header image is a far better outcome than a payment
 * confirmation that silently never sends. Clients fall back to the
 * `alt` text.
 */
async function resolveLogoAttachment(): Promise<
  { filename: string; path: string; cid: string } | null
> {
  const abs = path.join(process.cwd(), ...LOGO_FILE);
  try {
    await access(abs);
    return { filename: 'logo.jpg', path: abs, cid: EMAIL_LOGO_CID };
  } catch {
    return null;
  }
}

/**
 * Send one transactional email.
 *
 * Builds a fresh transport per call. Deliberate: these are low-volume,
 * human-triggered events (a handful a day), so connection pooling buys
 * nothing, while a long-lived pooled transport held across a container's
 * idle periods invites half-open sockets that fail on the send that
 * actually matters.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const to = message.to?.trim();
  if (!to) {
    return { ok: false, reason: 'no_recipient' };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    // Dynamic import keeps nodemailer (CJS, and Node-only) out of the
    // module graph of anything that merely imports a type from here.
    const nodemailer = await import('nodemailer');

    const parsedPort = Number.parseInt(SMTP_PORT || '587', 10);
    const port = Number.isFinite(parsedPort) ? parsedPort : 587;

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const logo = await resolveLogoAttachment();

    // Ensure the from address has a domain to prevent 501 errors
    // If SMTP_USER is just a username (e.g. 'apikey' for SendGrid), we must use a valid email
    const fromEmail = SMTP_USER.includes('@')
      ? SMTP_USER
      : `noreply@${SMTP_HOST.replace(/^mail\./, '')}`;

    await transporter.sendMail({
      from: `"${message.fromName}" <${fromEmail}>`,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo?.trim() || fromEmail,
      attachments: logo ? [logo] : [],
    });

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[email] send failed:', detail);
    return { ok: false, reason: 'send_failed', detail };
  }
}

/**
 * Send and log the outcome, swallowing everything.
 *
 * The shape callers want at a fire-and-forget call site: one line, no
 * branching, no possibility of an unhandled rejection escaping into an
 * `after()` callback.
 */
export async function sendEmailQuietly(
  label: string,
  message: EmailMessage,
): Promise<void> {
  const result = await sendEmail(message);

  if (result.ok) {
    console.log(`[email] ${label} sent to ${message.to}`);
    return;
  }

  if (result.reason === 'not_configured') {
    console.warn(`[email] ${label} skipped — SMTP is not configured`);
    return;
  }
  if (result.reason === 'no_recipient') {
    console.warn(`[email] ${label} skipped — no recipient address on file`);
    return;
  }
  console.error(`[email] ${label} failed: ${result.detail ?? 'unknown error'}`);
}
