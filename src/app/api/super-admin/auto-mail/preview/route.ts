// ============================================================
// POST /api/super-admin/auto-mail/preview
//
// Render a reminder without sending it, from template text that has NOT
// been saved yet. That is the point: an operator can see the effect of an
// edit before committing it, which is the difference between editing copy
// confidently and editing it by deploying and hoping.
//
// The preview goes through the SAME `renderReminderEmail` the cron uses,
// so what is shown is byte-identical to what would be sent. A separate
// preview renderer would be a second thing to keep in step, and the first
// time it drifted nobody would notice until a customer saw the difference.
//
// Optionally previews against a REAL account (`accountId`), so an operator
// can check how the copy reads with an actual name, workspace and date
// rather than placeholders.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { getEmailBranding } from '@/lib/email/branding';
import {
  loadRule,
  resolveOwnerRecipient,
  buildVars,
} from '@/lib/auto-mail/reminders';
import { renderReminderEmail, daysPhrase } from '@/lib/auto-mail/templates';
import {
  AUTO_EMAIL_SEGMENTS,
  type AutoEmailRule,
  type AutoEmailSegment,
  type AutoEmailVars,
} from '@/lib/auto-mail/types';
import { formatCopyDate } from '@/lib/subscription/copy';
import {
  resolveSubscriptionState,
  type SubscriptionGateConfig,
} from '@/lib/subscription/status';
import type { SubscriptionStatus } from '@/lib/subscription/types';
import { getGateConfig } from '@/lib/subscription/queries';

export const dynamic = 'force-dynamic';

/**
 * Stand-in values when no account is named.
 *
 * Chosen to be obviously fake. A sample that looked like real data would
 * invite an operator to approve copy that happens to read well for
 * "Acme Ltd" and badly for everyone else.
 */
function sampleVars(
  segment: AutoEmailSegment,
  siteName: string
): AutoEmailVars {
  const daysLeft = segment === 'trial' ? 1 : 3;
  const end = new Date(Date.now() + daysLeft * 86_400_000);
  return {
    name: 'Sample',
    full_name: 'Sample Customer',
    workspace: 'Sample Workspace',
    site_name: siteName,
    expiry_date: formatCopyDate(end),
    days_left: daysLeft,
    days_phrase: daysPhrase(daysLeft),
    plan_name: 'Standard · Monthly',
  };
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const segment = String(body.segment ?? '') as AutoEmailSegment;
    if (!AUTO_EMAIL_SEGMENTS.includes(segment)) {
      return NextResponse.json(
        { error: 'A valid segment is required (trial or paid).' },
        { status: 400 }
      );
    }

    const saved = await loadRule(admin, segment);
    if (!saved) {
      return NextResponse.json(
        { error: `No rule row exists for the "${segment}" segment.` },
        { status: 404 }
      );
    }

    // Unsaved edits win; anything the client omits falls back to the
    // stored row, so a preview of one changed field is still complete.
    const str = (key: string, fallback: string): string =>
      typeof body[key] === 'string' && String(body[key]).trim()
        ? String(body[key])
        : fallback;

    const rule: AutoEmailRule = {
      ...saved,
      subject_template: str('subject_template', saved.subject_template),
      heading_template: str('heading_template', saved.heading_template),
      body_template: str('body_template', saved.body_template),
      cta_label: str('cta_label', saved.cta_label),
      cta_path: str('cta_path', saved.cta_path),
      footer_note:
        typeof body.footer_note === 'string'
          ? String(body.footer_note) || null
          : saved.footer_note,
    };

    const branding = await getEmailBranding('auto-mail:preview');

    let vars = sampleVars(segment, branding.siteName);
    let previewedAccount: string | null = null;

    const accountId =
      typeof body.accountId === 'string' && body.accountId
        ? body.accountId
        : null;

    if (accountId) {
      const { data: account } = await admin
        .from('accounts')
        .select(
          'id, name, subscription_status, trial_ends_at, subscription_ends_at, subscription_plan_name'
        )
        .eq('id', accountId)
        .maybeSingle();

      if (account) {
        const gateConfig: SubscriptionGateConfig = await getGateConfig();
        const state = resolveSubscriptionState(
          {
            ...account,
            // null -> undefined so the resolver applies its own default;
            // `Partial` treats an explicit null as a type error.
            subscription_status:
              (account.subscription_status as SubscriptionStatus | null) ??
              undefined,
          },
          gateConfig
        );
        const recipient = await resolveOwnerRecipient(admin, accountId);

        // Fall back to the sample window when the account has none, so a
        // preview never renders a blank date and imply the email would.
        const windowEnd = state.endsAt ?? new Date(Date.now() + 86_400_000);
        const daysLeft = state.daysLeft ?? 1;

        vars = buildVars({
          recipient: recipient ?? {
            email: 'unknown@example.com',
            name: null,
            userId: '',
          },
          accountName: (account.name as string | null) ?? 'Workspace',
          siteName: branding.siteName,
          windowEnd,
          daysLeft,
          planName: (account.subscription_plan_name as string | null) ?? null,
        });
        previewedAccount = (account.name as string | null) ?? null;
      }
    }

    const rendered = renderReminderEmail({ rule, vars, branding });

    return NextResponse.json({
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      previewedAccount,
      usedSampleData: !previewedAccount,
    });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/auto-mail/preview] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to render the preview' },
      { status: 500 }
    );
  }
}
