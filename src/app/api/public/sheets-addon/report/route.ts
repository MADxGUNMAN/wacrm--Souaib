// ============================================================
// POST /api/public/sheets-addon/report — file an issue from the add-on
//
// Unauthenticated, for the same reason as the help endpoint: a user
// who cannot connect their API key still has to be able to reach
// support, and that is precisely when they will use this form.
//
// ATTRIBUTION IS BEST-EFFORT, NOT A GATE
// If the request happens to carry a valid key we resolve it and tag
// the report with the real account. An absent, malformed, revoked or
// expired key does NOT reject the submission — it lands unattributed
// and the operator sees it as such. Rejecting would throw away the
// reports most worth reading.
//
// ABUSE CONTROLS (an unauthenticated write needs real ones)
//   - message length capped (REPORT_MESSAGE_MAX)
//   - REPORT_RATE_LIMIT_PER_HOUR submissions per IP per hour
//   - IP + user agent stored for triage
//
// The per-IP limit counts rows in the table rather than using the
// in-process rate limiter, so it survives a restart and still holds
// when the app runs as more than one instance.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { findActiveKeyByHash, getAccountName } from '@/lib/api-keys/store';
import { hashApiKey, looksLikeApiKey } from '@/lib/api-keys/keys';
import { ValidationError } from '@/lib/subscription/validation';
import {
  ISSUE_REPORTS_TABLE,
  parseReportSubmission,
  REPORT_RATE_LIMIT_PER_HOUR,
} from '@/lib/sheets-addon/help';

export const dynamic = 'force-dynamic';

/**
 * Resolve an optional bearer key to an account, never throwing.
 *
 * Mirrors `requireApiKey`'s lookup but drops every rejection path: this
 * is labelling, not authorization.
 */
async function resolveOptionalAccount(request: Request): Promise<{
  accountId: string | null;
  accountName: string | null;
}> {
  const header = request.headers.get('authorization');
  if (!header) return { accountId: null, accountName: null };

  const presented = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : header.trim();

  if (!presented || !looksLikeApiKey(presented)) {
    return { accountId: null, accountName: null };
  }

  try {
    const row = await findActiveKeyByHash(hashApiKey(presented));
    if (!row) return { accountId: null, accountName: null };
    return {
      accountId: row.account_id,
      accountName: await getAccountName(row.account_id),
    };
  } catch (err) {
    // A lookup failure must not cost us the report.
    console.error(
      '[public/sheets-addon/report] key lookup failed, filing unattributed:',
      err
    );
    return { accountId: null, accountName: null };
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Expected a JSON body' },
        { status: 400 }
      );
    }

    const submission = parseReportSubmission(body);

    const admin = supabaseAdmin();
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = request.headers.get('user-agent') || null;
    // The add-on identifies itself here as `sheets-addon/<version>`.
    // Trusted only as a label; the client-supplied body value wins if
    // both are present.
    const clientHeader = request.headers.get('x-replai-client');

    if (ip) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await admin
        .from(ISSUE_REPORTS_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', oneHourAgo);

      // Fail open on a counting error: losing a genuine report is worse
      // than letting one extra through.
      if (countError) {
        console.error(
          '[public/sheets-addon/report] rate-limit count failed, allowing:',
          countError.message
        );
      } else if ((count ?? 0) >= REPORT_RATE_LIMIT_PER_HOUR) {
        return NextResponse.json(
          {
            error:
              'Too many reports from this connection in the last hour. Please email support instead.',
          },
          { status: 429 }
        );
      }
    }

    const { accountId, accountName } = await resolveOptionalAccount(request);

    const { data, error } = await admin
      .from(ISSUE_REPORTS_TABLE)
      .insert({
        message: submission.message,
        reporter_email: submission.reporterEmail,
        account_id: accountId,
        account_name: accountName,
        spreadsheet_id: submission.spreadsheetId,
        spreadsheet_name: submission.spreadsheetName,
        addon_version: submission.addonVersion ?? clientHeader,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[public/sheets-addon/report] insert failed:', error);
      return NextResponse.json(
        { error: 'Could not submit the report. Please try again.' },
        { status: 500 }
      );
    }

    // The id is echoed so an operator and a reporter can refer to the
    // same report. Nothing else is returned.
    return NextResponse.json({ success: true, id: data.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    console.error('[public/sheets-addon/report] unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
