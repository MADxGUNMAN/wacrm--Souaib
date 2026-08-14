// ============================================================
// POST /api/public/newsletter — Subscribe an email
//
// Public endpoint (no auth). Called from the landing page footer.
// Inserts a pending subscriber, sends a branded confirmation
// email, and tracks whether SMTP accepted the message.
// ============================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { sendEmail } from '@/lib/email/send';
import {
  renderEmail,
  heading,
  paragraph,
  button,
  toPlainText,
} from '@/lib/email/layout';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body.email ?? '').toLowerCase().trim();

    // ── Validate ──────────────────────────────────────────────
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const ua = request.headers.get('user-agent') || null;

    // ── Rate limiting (5 per IP per hour) ─────────────────────
    if (ip) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('newsletter_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', oneHourAgo);

      if (count && count >= 5) {
        return NextResponse.json(
          { error: 'Too many subscription attempts. Please try again later.' },
          { status: 429 }
        );
      }
    }

    // ── Check for existing subscriber ─────────────────────────
    const { data: existing } = await admin
      .from('newsletter_subscribers')
      .select('id, status, confirm_token')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'confirmed') {
        return NextResponse.json({
          success: true,
          message: 'You are already subscribed!',
        });
      }

      if (existing.status === 'unsubscribed') {
        // Re-subscribe: reset to pending with a new token
        const { data: updated } = await admin
          .from('newsletter_subscribers')
          .update({
            status: 'pending',
            confirm_token: crypto.randomUUID(),
            email_sent: false,
            email_sent_at: null,
            confirmed_at: null,
            bounced_at: null,
            bounce_reason: null,
            ip_address: ip,
            user_agent: ua,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('id, confirm_token')
          .single();

        if (updated) {
          await sendConfirmationEmail(admin, updated.id, email, updated.confirm_token);
        }

        return NextResponse.json({
          success: true,
          message: 'Please check your email to confirm your subscription.',
        });
      }

      // status === 'pending' or 'bounced' → resend confirmation
      const token = existing.confirm_token || crypto.randomUUID();
      if (!existing.confirm_token) {
        await admin
          .from('newsletter_subscribers')
          .update({ confirm_token: token, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      await sendConfirmationEmail(admin, existing.id, email, token);

      return NextResponse.json({
        success: true,
        message: 'Please check your email to confirm your subscription.',
      });
    }

    // ── Insert new subscriber ─────────────────────────────────
    const { data: subscriber, error: insertError } = await admin
      .from('newsletter_subscribers')
      .insert({
        email,
        ip_address: ip,
        user_agent: ua,
        source: 'footer_form',
      })
      .select('id, confirm_token')
      .single();

    if (insertError) {
      // Unique constraint race condition
      if (insertError.code === '23505') {
        return NextResponse.json({
          success: true,
          message: 'You are already subscribed!',
        });
      }
      console.error('[newsletter] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to subscribe. Please try again.' },
        { status: 500 }
      );
    }

    // ── Send confirmation email ───────────────────────────────
    await sendConfirmationEmail(admin, subscriber.id, email, subscriber.confirm_token);

    return NextResponse.json({
      success: true,
      message: 'Please check your email to confirm your subscription.',
    });
  } catch (err) {
    console.error('[newsletter] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Helper: send the branded confirmation email ───────────────
async function sendConfirmationEmail(
  admin: ReturnType<typeof supabaseAdmin>,
  subscriberId: string,
  email: string,
  confirmToken: string
) {
  // Fetch site name for branding
  const { data: settings } = await admin
    .from('site_settings')
    .select('site_name')
    .limit(1)
    .maybeSingle();
  const siteName = settings?.site_name || 'Replai';

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const confirmUrl = `${baseUrl}/api/public/newsletter/confirm?token=${confirmToken}`;
  const unsubscribeUrl = `${baseUrl}/api/public/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;

  const content = [
    heading('Confirm your subscription'),
    paragraph(
      `Thanks for subscribing to the ${siteName} newsletter! Please confirm your email address by clicking the button below.`
    ),
    button({ href: confirmUrl, label: 'Confirm Subscription' }),
    paragraph(
      'If you did not subscribe, you can safely ignore this email — no action is needed.'
    ),
  ].join('');

  const html = renderEmail({
    siteName,
    preheader: `Confirm your ${siteName} newsletter subscription`,
    content,
    footerNote: `You received this because someone subscribed ${email} to the ${siteName} newsletter.\nTo unsubscribe, visit: ${unsubscribeUrl}`,
  });

  const result = await sendEmail({
    to: email,
    subject: `Confirm your ${siteName} newsletter subscription`,
    html,
    text: toPlainText(html),
    fromName: `${siteName} Newsletter`,
  });

  // Track delivery result
  if (result.ok) {
    await admin
      .from('newsletter_subscribers')
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriberId);
  } else if (result.reason === 'send_failed') {
    await admin
      .from('newsletter_subscribers')
      .update({
        status: 'bounced',
        bounced_at: new Date().toISOString(),
        bounce_reason: result.detail || 'SMTP send failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriberId);
  }
}
