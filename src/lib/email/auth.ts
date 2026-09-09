// ============================================================
// Auth email templates — SERVER ONLY.
//
// Branded HTML emails for the three Supabase Auth flows that
// previously used Supabase's default "powered by Supabase" emails:
//
//   1. Signup confirmation — "Welcome! Confirm your email"
//   2. Password reset      — "Reset your password"
//   3. Email change         — "Confirm your new email address"
//
// Uses the same branded layout (slate palette, green CTA, CID logo
// header) as billing and newsletter emails so all transactional mail
// from the product looks consistent.
//
// Each builder fetches branding from `site_settings` (same pattern
// as billing.ts) and returns { html, text, subject } ready for
// sendEmail().
// ============================================================

import { getEmailBranding } from './branding';
import {
  button,
  heading,
  notice,
  paragraph,
  renderEmail,
  toPlainText,
} from './layout';
import { sendEmail, type EmailResult } from './send';

/** Shared with billing.ts and auto-mail — see ./branding. */
const getBranding = () => getEmailBranding('email:auth');

// ── Signup confirmation ─────────────────────────────────────────

export async function sendSignupConfirmationEmail(
  to: string,
  confirmUrl: string,
  userName?: string
): Promise<EmailResult> {
  const { siteName, supportEmail, logoUrl, logoDarkUrl } = await getBranding();

  const greeting = userName
    ? `Hi ${userName}, welcome to ${siteName}!`
    : `Welcome to ${siteName}!`;

  const content = [
    heading('Confirm your email address'),
    paragraph(greeting),
    paragraph(
      'Please confirm your email address by clicking the button below. This link will expire in 24 hours.'
    ),
    button({ href: confirmUrl, label: 'Confirm Email Address' }),
    paragraph(
      "If you didn't create an account, you can safely ignore this email."
    ),
  ].join('');

  const html = renderEmail({
    siteName,
    preheader: `Confirm your ${siteName} account`,
    content,
    footerNote: supportEmail
      ? `Need help? Contact us at ${supportEmail}`
      : undefined,
    logoUrl,
    logoDarkUrl,
  });

  return sendEmail({
    to,
    subject: `Confirm your ${siteName} account`,
    html,
    text: toPlainText(html),
    fromName: siteName,
  });
}

// ── Password reset ──────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<EmailResult> {
  const { siteName, supportEmail, logoUrl, logoDarkUrl } = await getBranding();

  const content = [
    heading('Reset your password'),
    paragraph(
      `We received a request to reset the password for your ${siteName} account. Click the button below to choose a new password.`
    ),
    button({ href: resetUrl, label: 'Reset Password' }),
    notice({
      tone: 'warning',
      body: "This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.",
    }),
  ].join('');

  const html = renderEmail({
    siteName,
    preheader: `Reset your ${siteName} password`,
    content,
    footerNote: supportEmail
      ? `Need help? Contact us at ${supportEmail}`
      : undefined,
    logoUrl,
    logoDarkUrl,
  });

  return sendEmail({
    to,
    subject: `Reset your ${siteName} password`,
    html,
    text: toPlainText(html),
    fromName: siteName,
  });
}

// ── Email change confirmation ───────────────────────────────────

export async function sendEmailChangeEmail(
  to: string,
  confirmUrl: string
): Promise<EmailResult> {
  const { siteName, supportEmail, logoUrl, logoDarkUrl } = await getBranding();

  const content = [
    heading('Confirm your new email address'),
    paragraph(
      `You requested to change your ${siteName} email address to this one. Please confirm by clicking the button below.`
    ),
    button({ href: confirmUrl, label: 'Confirm New Email' }),
    notice({
      tone: 'warning',
      body: "If you didn't request this change, please ignore this email or contact support immediately. Your current email will remain unchanged.",
    }),
  ].join('');

  const html = renderEmail({
    siteName,
    preheader: `Confirm your new ${siteName} email address`,
    content,
    footerNote: supportEmail
      ? `Need help? Contact us at ${supportEmail}`
      : undefined,
    logoUrl,
    logoDarkUrl,
  });

  return sendEmail({
    to,
    subject: `Confirm your new ${siteName} email address`,
    html,
    text: toPlainText(html),
    fromName: siteName,
  });
}
