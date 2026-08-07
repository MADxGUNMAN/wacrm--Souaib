// ============================================================
// 24-hour messaging-limit usage — pure derivation, no I/O.
//
// WHY THIS IS COMPUTED HERE RATHER THAN READ FROM META:
// Meta publishes the limit (`whatsapp_business_manager_messaging_limit`)
// but exposes NO field for how much of it you have consumed. WhatsApp
// Manager shows a usage panel; the Graph API does not offer one. So the
// only way to answer "how much have I used?" is to count our own sends.
//
// WHY THE OBVIOUS COUNT WOULD BE WRONG, and what is counted instead.
// Meta's limit is not messages, and not even conversations. It is the
// number of UNIQUE CUSTOMERS you START a conversation with in a rolling
// 24 hours, OUTSIDE an open customer-service window. Three consequences,
// each of which this module handles explicitly:
//
//   * Ten messages to one customer is ONE against the limit, so sends
//     are de-duplicated by contact.
//   * Replying to someone who messaged you first is FREE and unlimited —
//     you can always answer inside the 24-hour service window, even at
//     your limit. Those contacts are excluded.
//   * The window rolls continuously; it is not a midnight reset.
//
// WHAT THIS NUMBER IS NOT: authoritative. Meta counts at the business
// PORTFOLIO level across every phone number in it, whereas we can only
// see this workspace's own sends. If a second number shares the
// portfolio, or messages were sent from outside this CRM, the real figure
// is higher. The UI therefore presents this as our own estimate, never as
// Meta's number.
// ============================================================

/** One outbound send: who it went to, and when. */
export interface OutboundSend {
  contactId: string;
  at: Date;
}

/** One inbound customer message, used to detect an open service window. */
export interface InboundMessage {
  contactId: string;
  at: Date;
}

export interface InitiatedUsage {
  /** Distinct contacts we sent anything to inside the window. */
  contactsMessaged: number;
  /**
   * Of those, the ones we opened cold — no inbound message from them in
   * the 24 hours before our first send. This is the figure comparable to
   * Meta's limit.
   */
  businessInitiated: number;
  /**
   * Contacts we messaged inside an already-open service window. Free, and
   * shown separately so the difference is visible rather than looking
   * like the numbers do not add up.
   */
  withinServiceWindow: number;
  windowHours: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Work out how much of the rolling 24-hour allowance has been consumed.
 *
 * Both inputs should already be limited to roughly the last 48 hours:
 * outbound sends within the window, and inbound messages far enough back
 * to detect a service window that was open when the earliest send
 * happened.
 *
 * @param windowHours Rolling window length. Meta's is 24.
 */
export function computeInitiatedUsage(
  outbound: OutboundSend[],
  inbound: InboundMessage[],
  windowHours = 24,
  now: Date = new Date(),
): InitiatedUsage {
  const windowStart = now.getTime() - windowHours * HOUR_MS;

  // Earliest send per contact inside the window. Earliest, not latest,
  // because the service-window test must be applied to the moment we
  // FIRST reached out — a later message in the same exchange tells us
  // nothing about whether the conversation was already open.
  const firstSendByContact = new Map<string, number>();
  for (const send of outbound) {
    if (!send?.contactId) continue;
    const at = send.at instanceof Date ? send.at.getTime() : NaN;
    if (!Number.isFinite(at) || at < windowStart) continue;

    const existing = firstSendByContact.get(send.contactId);
    if (existing === undefined || at < existing) {
      firstSendByContact.set(send.contactId, at);
    }
  }

  const inboundByContact = new Map<string, number[]>();
  for (const message of inbound) {
    if (!message?.contactId) continue;
    const at = message.at instanceof Date ? message.at.getTime() : NaN;
    if (!Number.isFinite(at)) continue;

    const list = inboundByContact.get(message.contactId);
    if (list) list.push(at);
    else inboundByContact.set(message.contactId, [at]);
  }

  let businessInitiated = 0;
  let withinServiceWindow = 0;

  for (const [contactId, firstSend] of firstSendByContact) {
    const serviceWindowOpensAt = firstSend - 24 * HOUR_MS;
    const inboundTimes = inboundByContact.get(contactId) ?? [];

    // Open service window = the customer messaged us at some point in the
    // 24 hours before we sent. `<= firstSend` rather than `<` so a reply
    // in the same second still counts as inside the window.
    const hadOpenWindow = inboundTimes.some(
      (at) => at <= firstSend && at >= serviceWindowOpensAt,
    );

    if (hadOpenWindow) withinServiceWindow += 1;
    else businessInitiated += 1;
  }

  return {
    contactsMessaged: firstSendByContact.size,
    businessInitiated,
    withinServiceWindow,
    windowHours,
  };
}

/**
 * Percentage of the allowance used, clamped to 0-100.
 *
 * Null when there is no finite limit to divide by — an unlimited tier has
 * no meaningful percentage, and rendering 0% against it would imply a cap
 * that does not exist.
 */
export function usagePercent(
  used: number,
  limit: number | null | undefined,
): number | null {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}
