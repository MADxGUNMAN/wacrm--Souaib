// ============================================================
// POST /api/super-admin/auto-mail/send — send one reminder now.
//
// Two modes, deliberately separated:
//
//   { accountId, segment? }  A REAL send to that workspace's owner.
//                            Logged with trigger='manual', so it appears
//                            in the customer's history alongside automatic
//                            reminders — the admin needs one list of
//                            "what this customer actually received".
//
//   { segment, testEmail }   A TEST send to an arbitrary address using
//                            sample data. NOT logged, because a log row is
//                            a record of what a customer received, and
//                            filing an internal test under their history
//                            would make that record a lie.
//
// The manual path is also the recovery path for a failed automatic send.
// That is why the unique claim index is partial on trigger='auto': a
// resend must never be blocked by the failed attempt it is fixing, and
// must never consume the automatic slot.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { getEmailBranding } from '@/lib/email/branding';
import { sendEmail } from '@/lib/email/send';
import {
  loadOperatorAccountIds,
  loadRule,
  sendReminder,
  type SendOutcome,
} from '@/lib/auto-mail/reminders';
import {
  daysPhrase,
  renderReminderEmail,
  resolveDueOffset,
} from '@/lib/auto-mail/templates';
import {
  AUTO_EMAIL_SEGMENTS,
  type AutoEmailSegment,
  type AutoEmailVars,
} from '@/lib/auto-mail/types';
import { formatCopyDate } from '@/lib/subscription/copy';
import { getGateConfig } from '@/lib/subscription/queries';
import { resolveSubscriptionState } from '@/lib/subscription/status';
import type { SubscriptionStatus } from '@/lib/subscription/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const testEmail =
      typeof body.testEmail === 'string' ? body.testEmail.trim() : '';
    const accountId =
      typeof body.accountId === 'string' && body.accountId
        ? body.accountId
        : null;

    // ---- Test send: sample data, no log row ----
    if (testEmail) {
      const segment = String(body.segment ?? '') as AutoEmailSegment;
      if (!AUTO_EMAIL_SEGMENTS.includes(segment)) {
        return NextResponse.json(
          { error: 'A valid segment is required (trial or paid).' },
          { status: 400 }
        );
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) {
        return NextResponse.json(
          { error: 'That does not look like an email address.' },
          { status: 400 }
        );
      }

      const rule = await loadRule(admin, segment);
      if (!rule) {
        return NextResponse.json(
          { error: `No rule row exists for the "${segment}" segment.` },
          { status: 404 }
        );
      }

      const branding = await getEmailBranding('auto-mail:test');
      const daysLeft = segment === 'trial' ? 1 : 3;
      const vars: AutoEmailVars = {
        name: 'Sample',
        full_name: 'Sample Customer',
        workspace: 'Sample Workspace',
        site_name: branding.siteName,
        expiry_date: formatCopyDate(
          new Date(Date.now() + daysLeft * 86_400_000)
        ),
        days_left: daysLeft,
        days_phrase: daysPhrase(daysLeft),
        plan_name: 'Standard · Monthly',
      };

      const rendered = renderReminderEmail({ rule, vars, branding });
      const result = await sendEmail({
        to: testEmail,
        // Marked so a test landing in a shared inbox is never mistaken
        // for a real customer notice.
        subject: `[TEST] ${rendered.subject}`,
        html: rendered.html,
        text: rendered.text,
        fromName: `${branding.siteName} Billing`,
        replyTo: branding.supportEmail,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            error:
              result.reason === 'not_configured'
                ? 'SMTP is not configured on this server, so no mail can be sent.'
                : `Send failed: ${result.detail ?? result.reason}`,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ status: 'sent', mode: 'test', to: testEmail });
    }

    // ---- Real send to a workspace owner ----
    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId or testEmail is required.' },
        { status: 400 }
      );
    }

    const { data: account } = await admin
      .from('accounts')
      .select(
        'id, name, is_banned, auto_email_opted_out, subscription_status, trial_ends_at, subscription_ends_at, subscription_plan_name'
      )
      .eq('id', accountId)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found.' },
        { status: 404 }
      );
    }
    // Refused for the same reason the cron skips these: an operator's own
    // workspace is not a customer. Enforced here too so Send now cannot do
    // something the automatic path deliberately will not.
    const operatorAccounts = await loadOperatorAccountIds(admin);
    if (operatorAccounts.has(accountId)) {
      return NextResponse.json(
        {
          error:
            'That is a platform operator workspace, so Auto Mail does not send to it. Use "Send test" on the Settings tab to email yourself a sample.',
        },
        { status: 409 }
      );
    }

    if (account.auto_email_opted_out) {
      // Refused rather than silently sent: the opt-out exists precisely so
      // nobody has to remember it, and a Send now that ignored it would
      // make the toggle untrustworthy.
      return NextResponse.json(
        {
          error:
            'This workspace is opted out of Auto Mail. Turn the opt-out off first if you want to email them.',
        },
        { status: 409 }
      );
    }

    const gateConfig = await getGateConfig();
    const state = resolveSubscriptionState(
      {
        ...account,
        subscription_status:
          (account.subscription_status as SubscriptionStatus | null) ??
          undefined,
      },
      gateConfig
    );

    // Which reminder is truthful for this account right now. An operator
    // can override the segment, but not invent a window that does not
    // exist — the email states a date, and a wrong one is worse than none.
    const inferred: AutoEmailSegment | null = state.isTrialing
      ? 'trial'
      : state.isActive
        ? 'paid'
        : null;

    const requested = String(body.segment ?? '') as AutoEmailSegment;
    const segment = AUTO_EMAIL_SEGMENTS.includes(requested)
      ? requested
      : inferred;

    if (!segment || !state.endsAt || state.daysLeft === null) {
      return NextResponse.json(
        {
          error:
            'This workspace has no live trial or subscription window, so there is no expiry date to tell them about.',
        },
        { status: 409 }
      );
    }

    const rule = await loadRule(admin, segment);
    if (!rule) {
      return NextResponse.json(
        { error: `No rule row exists for the "${segment}" segment.` },
        { status: 404 }
      );
    }

    /**
     * Which stage to record this against.
     *
     * Uses the real due stage when one applies, and otherwise the closest
     * configured one, so a manual send outside any band still records a
     * meaningful `offset_days` instead of a magic number. The value is
     * only ever a label here — the partial index means a manual row never
     * competes for the automatic claim.
     */
    const offsetDays =
      resolveDueOffset(state.daysLeft, rule.offsets_days) ??
      Math.max(...rule.offsets_days);

    const outcome: SendOutcome = await sendReminder(admin, {
      accountId,
      accountName: (account.name as string | null) ?? 'Workspace',
      segment,
      offsetDays,
      daysLeft: state.daysLeft,
      windowEnd: state.endsAt,
      planName: (account.subscription_plan_name as string | null) ?? null,
      rule,
      trigger: 'manual',
      triggeredBy: ctx.userId,
    });

    if (outcome.status === 'sent') {
      return NextResponse.json({ status: 'sent', segment, mode: 'manual' });
    }
    if (outcome.status === 'skipped') {
      return NextResponse.json({ error: outcome.reason }, { status: 409 });
    }
    if (outcome.status === 'already_claimed') {
      // Should be unreachable for a manual send (the index excludes them),
      // so if it happens the index itself is wrong — say so rather than
      // reporting a plausible-sounding lie.
      return NextResponse.json(
        { error: 'That reminder is already claimed.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: outcome.detail }, { status: 502 });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/auto-mail/send] POST failed:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
