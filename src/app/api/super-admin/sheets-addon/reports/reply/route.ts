// ============================================================
// POST /api/super-admin/sheets-addon/reports/reply
//
// Email an operator's reply to whoever filed an add-on issue report,
// record it in the thread, and mark the report `replied`.
//
// TWO DELIBERATE DEPARTURES FROM THE CONTACT-REPLY ROUTE
//
// 1. It uses the shared email stack (`sendEmail` + `renderEmail`) rather
//    than building a nodemailer transport and a ~70-line HTML table
//    inline. The visual result is the same shell — layout.ts was
//    extracted FROM that email — but the body is escaped on the way in.
//    The contact route interpolates the operator's text straight into
//    the markup, so a stray `<` mangles the email and an `<a href>`
//    turns our own transactional mail into a phishing vector.
//
// 2. It requires a super admin. The contact reply route has no auth
//    check at all, which makes "send an email from the company's SMTP
//    account to an arbitrary address" an unauthenticated operation.
//
// ORDERING: the email is sent FIRST, and the thread row and status
// change only happen once SMTP has accepted it. So a failed send leaves
// no trace and no status change — the thread never claims a message went
// out that did not.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { sendEmail, isEmailConfigured } from '@/lib/email/send';
import { renderEmail, escapeMultiline, toPlainText } from '@/lib/email/layout';
import { getEmailBranding } from '@/lib/email/branding';
import {
  ISSUE_REPLIES_TABLE,
  ISSUE_REPORTS_TABLE,
} from '@/lib/sheets-addon/help';

export const dynamic = 'force-dynamic';

const SUBJECT_MAX = 300;
const BODY_MAX = 10000;

export async function POST(request: Request) {
  try {
    const admin = await requireSuperAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Expected a JSON body' },
        { status: 400 }
      );
    }

    const source = (body ?? {}) as Record<string, unknown>;
    const reportId = typeof source.reportId === 'string' ? source.reportId : '';
    const subject =
      typeof source.subject === 'string' ? source.subject.trim() : '';
    const messageBody =
      typeof source.body === 'string' ? source.body.trim() : '';

    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId is required' },
        { status: 400 }
      );
    }
    if (!subject) {
      return NextResponse.json(
        { error: 'A subject is required.' },
        { status: 400 }
      );
    }
    if (!messageBody) {
      return NextResponse.json(
        { error: 'Write a message before sending.' },
        { status: 400 }
      );
    }
    if (subject.length > SUBJECT_MAX || messageBody.length > BODY_MAX) {
      return NextResponse.json(
        { error: 'That reply is too long to send.' },
        { status: 400 }
      );
    }

    // Report checked BEFORE the SMTP check, so a deleted report reports
    // itself rather than being masked by a configuration error.
    const db = supabaseAdmin();
    const { data: report, error: readError } = await db
      .from(ISSUE_REPORTS_TABLE)
      .select('id, reporter_email, spreadsheet_name')
      .eq('id', reportId)
      .maybeSingle();

    if (readError) {
      console.error(
        '[sheets-addon/reports/reply] could not read the report:',
        readError
      );
      return NextResponse.json(
        { error: 'Could not load that report.' },
        { status: 500 }
      );
    }
    if (!report) {
      return NextResponse.json(
        { error: 'That report no longer exists.' },
        { status: 404 }
      );
    }

    // The reporter's email is nullable — the add-on reads it from the
    // Google session and that can be unavailable. There is genuinely
    // nowhere to send, so say exactly that instead of failing at SMTP
    // with something vague.
    const to = report.reporter_email?.trim();
    if (!to) {
      return NextResponse.json(
        {
          error:
            'This report carries no reporter email address, so there is no one to reply to. Reach out through the account instead.',
          code: 'no_reporter_email',
        },
        { status: 422 }
      );
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            'SMTP is not configured on this server, so no email can be sent.',
          code: 'email_not_configured',
        },
        { status: 503 }
      );
    }

    const branding = await getEmailBranding('sheets-addon/reports/reply');

    // escapeMultiline, not raw interpolation: the operator's text is
    // escaped and only its newlines become markup.
    const content = `<div style="font-size: 15px; line-height: 1.6; color: #334155;">${escapeMultiline(messageBody)}</div>`;

    const html = renderEmail({
      siteName: branding.siteName,
      preheader: subject,
      content,
      footerNote: `You are receiving this because you reported an issue from the ${branding.siteName} add-on for Google Sheets. You can reply directly to this email.`,
      logoUrl: branding.logoUrl,
      logoDarkUrl: branding.logoDarkUrl,
    });

    const result = await sendEmail({
      to,
      subject,
      html,
      text: toPlainText(html),
      fromName: `${branding.siteName} Support`,
    });

    if (!result.ok) {
      console.error(
        '[sheets-addon/reports/reply] send failed:',
        result.reason,
        result.detail ?? ''
      );
      return NextResponse.json(
        {
          error:
            result.reason === 'not_configured'
              ? 'SMTP is not configured on this server, so no email can be sent.'
              : 'Could not send the email. Check the SMTP configuration and try again.',
          code: result.reason,
        },
        { status: 502 }
      );
    }

    // Only now that the email is away: record it and move the status.
    const { error: insertError } = await db.from(ISSUE_REPLIES_TABLE).insert({
      report_id: reportId,
      subject,
      body: messageBody,
      sent_by: 'Super Admin',
      sent_by_email: admin.email,
    });

    if (insertError) {
      // The reporter HAS the email. Failing the request now would invite
      // a resend and a duplicate, so this is reported as a success with
      // the storage problem logged.
      console.error(
        '[sheets-addon/reports/reply] email sent but the thread row failed:',
        insertError
      );
    }

    const { data: updated, error: statusError } = await db
      .from(ISSUE_REPORTS_TABLE)
      .update({
        status: 'replied',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .select('*')
      .maybeSingle();

    if (statusError) {
      console.error(
        '[sheets-addon/reports/reply] email sent but the status update failed:',
        statusError
      );
    }

    return NextResponse.json({ success: true, to, report: updated ?? null });
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[sheets-addon/reports/reply] unexpected error:', err);
    return NextResponse.json(
      { error: 'Could not send the reply.' },
      { status: 500 }
    );
  }
}
