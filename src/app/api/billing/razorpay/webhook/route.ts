// ============================================================
// POST /api/billing/razorpay/webhook — Razorpay event receiver.
//
// No session: authenticated only by X-Razorpay-Signature, an HMAC of the
// RAW body with the webhook secret (current, then previous during a
// rotation). Under /api/billing, so src/proxy.ts lets it through.
//
// Store first, answer fast, work later (plan section 5):
//   1. read the raw body (route handlers need no body parser)
//   2. verify the signature on those exact bytes; 400 and store nothing
//      if it fails
//   3. insert into billing_webhook_events, unique on
//      (mode, x-razorpay-event-id), so a redelivery is a no-op
//   4. answer 200 well inside Razorpay's 5 s budget
//   5. after(): refetch the named objects from Razorpay and apply them,
//      then send any emails that produced
//
// 500 only when the insert itself fails, so Razorpay retries. Anything
// that fails in step 5 is retried by /api/billing/cron with backoff.
// ============================================================

import { createHash } from 'node:crypto';
import { after, NextResponse } from 'next/server';

import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { processDueWebhookEvents } from '@/lib/billing/razorpay/events';
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import { unixToIso } from '@/lib/billing/razorpay/mapping';
import { verifyWebhookSignature } from '@/lib/billing/razorpay/signature';
import { createBillingStore } from '@/lib/billing/razorpay/store';
import {
  parseWebhookEvent,
  webhookEntityIds,
} from '@/lib/billing/razorpay/webhook-mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Razorpay events are a few KB. Anything far larger is not one. */
const MAX_BODY_BYTES = 256 * 1024;
const EVENT_ID = /^[A-Za-z0-9_-]{6,64}$/;

export async function POST(request: Request) {
  const config = getRazorpayConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Billing is not configured' },
      { status: 503 }
    );
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const ok = verifyWebhookSignature({
    rawBody: raw,
    signature: request.headers.get('x-razorpay-signature'),
    secrets: config.webhookSecrets,
  });
  if (!ok) {
    // Counter-style log only: never the body, headers or signature.
    console.warn('[razorpay] webhook rejected: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = parseWebhookEvent(raw);
  if (!event) {
    console.warn('[razorpay] webhook rejected: not an event body');
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  // Razorpay sends the same x-razorpay-event-id on every retry and
  // replay. Without one, the body hash still dedupes exact redeliveries.
  const header = request.headers.get('x-razorpay-event-id') ?? '';
  const providerEventId = EVENT_ID.test(header)
    ? header
    : `sha256:${createHash('sha256').update(raw).digest('hex')}`;

  let stored: { id: string } | null;
  try {
    stored = await createBillingStore().insertWebhookEvent({
      mode: config.mode,
      provider_event_id: providerEventId,
      event_type: event.event,
      entity_ids: { ...webhookEntityIds(event) },
      provider_created_at: unixToIso(
        typeof event.created_at === 'number' ? event.created_at : null
      ),
      payload: event,
    });
  } catch (err) {
    console.error(
      '[razorpay] webhook store failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: 'Could not store event' },
      { status: 500 }
    );
  }

  if (stored) {
    const id = stored.id;
    after(async () => {
      try {
        const deps = getEventDeps();
        await processDueWebhookEvents(deps, { limit: 1, id });
        await deliverBillingEmails(deps, { limit: 5 });
      } catch (err) {
        // The cron retries anything left unprocessed or unsent.
        console.error(
          '[razorpay] webhook processing failed:',
          err instanceof Error ? err.message : err
        );
      }
    });
  }

  return NextResponse.json({ ok: true, duplicate: stored === null });
}
