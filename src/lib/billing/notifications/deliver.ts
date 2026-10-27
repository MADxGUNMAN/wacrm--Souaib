// ============================================================
// Billing email outbox delivery (plan section 10).
//
// Rows are enqueued INSIDE the SQL transaction that changed billing
// state, keyed by a dedupe key, so each email exists once. This file only
// sends them:
//   - claims due rows for THIS deployment's mode and environment
//     (dev and production share the database)
//   - resolves the owner's address at send time
//   - skips anything older than 48 hours, so a backlog after an outage
//     never sends a stale "your payment failed" days later
//   - retries failures with backoff (1 m, 5 m, 30 m, 2 h, 6 h), at most
//     6 attempts in total (the claim stops at 6)
// ============================================================

import type { EmailMessage, EmailResult } from '@/lib/email/send';
import type { RenderedEmail } from '@/lib/email/autopay';
import type { BillingStore } from '@/lib/billing/razorpay/store';
import type {
  BillingEnv,
  BillingNotificationKind,
  RazorpayMode,
} from '@/lib/billing/razorpay/types';

export const NOTIFY_BACKOFF_MS = [
  60_000, 300_000, 1_800_000, 7_200_000, 21_600_000,
];
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export interface DeliverDeps {
  store: Pick<
    BillingStore,
    'claimNotifications' | 'finishNotification' | 'getRecipient'
  >;
  mode: RazorpayMode;
  env: BillingEnv;
  render: (
    kind: BillingNotificationKind,
    data: Record<string, unknown>,
    recipientName: string | null
  ) => Promise<RenderedEmail>;
  send: (message: EmailMessage) => Promise<EmailResult>;
  fromName: string;
  replyTo: string | null;
  now?: () => Date;
}

export interface DeliverSummary {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function deliverDueNotifications(
  deps: DeliverDeps,
  opts: { limit: number; id?: string }
): Promise<DeliverSummary> {
  const summary: DeliverSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  const rows = await deps.store.claimNotifications(
    deps.mode,
    deps.env,
    opts.limit,
    opts.id
  );
  summary.claimed = rows.length;

  for (const row of rows) {
    const now = deps.now?.() ?? new Date();
    const skip = async (reason: string) => {
      await deps.store.finishNotification(row.id, {
        status: 'skipped',
        reason,
      });
      summary.skipped += 1;
    };
    const fail = async (error: string) => {
      // `attempts` was incremented by the claim; the claim refuses a 7th.
      const wait =
        NOTIFY_BACKOFF_MS[
          Math.min(row.attempts, NOTIFY_BACKOFF_MS.length) - 1
        ] ?? NOTIFY_BACKOFF_MS[0];
      await deps.store.finishNotification(row.id, {
        status: 'failed',
        error,
        nextAttemptAt: new Date(now.getTime() + wait),
      });
      summary.failed += 1;
    };

    try {
      if (now.getTime() - new Date(row.created_at).getTime() > STALE_AFTER_MS) {
        await skip('stale: older than 48 hours');
        continue;
      }
      if (!row.recipient_user_id) {
        await skip('no recipient');
        continue;
      }
      const recipient = await deps.store.getRecipient(row.recipient_user_id);
      if (!recipient.email) {
        await skip('recipient has no email address');
        continue;
      }

      const email = await deps.render(row.kind, row.data ?? {}, recipient.name);
      const result = await deps.send({
        to: recipient.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        fromName: deps.fromName,
        replyTo: deps.replyTo,
      });

      if (result.ok) {
        await deps.store.finishNotification(row.id, {
          status: 'sent',
          recipientEmail: recipient.email,
        });
        summary.sent += 1;
      } else if (result.reason === 'no_recipient') {
        await skip('no recipient');
      } else {
        await fail(
          result.reason === 'not_configured'
            ? 'SMTP is not configured'
            : (result.detail ?? 'send failed')
        );
      }
    } catch (err) {
      await fail(err instanceof Error ? err.message : String(err)).catch((e) =>
        console.error(
          '[billing] outbox bookkeeping failed:',
          e instanceof Error ? e.message : e
        )
      );
    }
  }
  return summary;
}
