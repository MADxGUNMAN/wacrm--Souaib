// ============================================================
// Outbound webhook event vocabulary — pure, no I/O.
//
// An endpoint subscribes to one or more of these. Adding an event is
// one entry here plus a `dispatchWebhookEvent` call at the source of
// the event (the DB stores subscriptions as a free `text[]`, so no
// migration is needed — same model as API scopes).
// ============================================================

export const WEBHOOK_EVENTS = [
  'message.received', // an inbound WhatsApp message landed
  'message.status_updated', // a sent message advanced (sent/delivered/read)
  'conversation.created', // a new conversation was opened for a contact
  // ---- Coexistence (one number on the Business App AND the API) ----
  // An outbound message the CRM did not send. Today that means one typed
  // in the WhatsApp Business App on a phone, which Meta mirrors to us.
  //
  // Named `message.sent` rather than `message.sent_from_phone` so the
  // event generalises: the payload carries `sender_type`, so if CRM sends
  // ever emit an event too they reuse this name instead of forcing
  // subscribers to learn a second one. Filter on `sender_type` to tell
  // them apart.
  'message.sent',
  // A message was edited or deleted for everyone, after we stored it.
  // Both are everyday actions on a phone, so coexistence makes them
  // common — an integration mirroring the thread has to know.
  'message.edited',
  'message.deleted',
  // The WhatsApp connection was severed by Meta or by the customer.
  // Worth subscribing to: without it every send just starts failing, and
  // an integration cannot poll for something it has no idea happened.
  'whatsapp.disconnected',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Human-readable descriptions (surfaced in docs / a future UI). */
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEvent, string> = {
  'message.received': 'An inbound message was received from a contact',
  'message.status_updated':
    'A message you sent changed delivery status (sent/delivered/read/failed)',
  'conversation.created': 'A new conversation was opened',
  'message.sent':
    'An outbound message was sent outside this CRM — currently, one typed in the WhatsApp Business App on a phone (check sender_type)',
  'message.edited': 'A stored message was edited by its sender',
  'message.deleted': 'A stored message was deleted for everyone by its sender',
  'whatsapp.disconnected':
    'Meta disconnected your WhatsApp number — sending will fail until it is reconnected',
};

/** Type-narrow an unknown value into a valid `WebhookEvent`. */
export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return (
    typeof value === 'string' &&
    (WEBHOOK_EVENTS as readonly string[]).includes(value)
  );
}

/**
 * Validate + de-duplicate a caller-supplied event list. Returns the
 * cleaned list, or `null` if any entry is unknown (callers turn that
 * into a 400). An empty list is rejected as `null` too — an endpoint
 * subscribed to nothing is almost certainly a mistake.
 */
export function normalizeEvents(input: unknown): WebhookEvent[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: WebhookEvent[] = [];
  for (const entry of input) {
    if (!isWebhookEvent(entry)) return null;
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}
