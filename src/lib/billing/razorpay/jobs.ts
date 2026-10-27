// ============================================================
// Wiring for the webhook, cron and after()-delivery paths — SERVER ONLY.
//
// Turns env + service role + SMTP into the dependency objects that
// events.ts, reconcile.ts and notifications/deliver.ts take, so those
// stay unit-testable with fakes.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { renderAutopayEmail } from '@/lib/email/autopay';
import { getEmailBranding } from '@/lib/email/branding';
import { sendEmail } from '@/lib/email/send';
import {
  deliverDueNotifications,
  type DeliverSummary,
} from '@/lib/billing/notifications/deliver';
import type { EventDeps } from './events';
import { getBillingDeps } from './runtime';
import { createBillingStore } from './store';

/** Throws RazorpayConfigError when Razorpay is not configured here. */
export function getEventDeps(): EventDeps {
  return { ...getBillingDeps(), store: createBillingStore() };
}

async function supportNote(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('subscription_settings')
      .select('support_note')
      .limit(1)
      .maybeSingle();
    return (
      (data as { support_note: string | null } | null)?.support_note || null
    );
  } catch {
    return null;
  }
}

/** Send due billing emails for this deployment's mode and environment. */
export async function deliverBillingEmails(
  deps: EventDeps,
  opts: { limit: number; id?: string }
): Promise<DeliverSummary> {
  const [branding, note] = await Promise.all([
    getEmailBranding('billing-outbox'),
    supportNote(),
  ]);
  return deliverDueNotifications(
    {
      store: deps.store,
      mode: deps.config.mode,
      env: deps.config.env,
      render: async (kind, data, recipientName) =>
        renderAutopayEmail(kind, data, {
          branding,
          recipientName,
          supportNote: note,
        }),
      send: sendEmail,
      fromName: `${branding.siteName} Billing`,
      replyTo: branding.supportEmail,
    },
    opts
  );
}
