/**
 * Whether a template can actually be SENT from this app yet.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Approval and sendability are different things. An order-details
 * template can be created here and approved by Meta, but sending one
 * needs a payment configuration on the WhatsApp Business account. Without
 * this check it would appear in the inbox and broadcast lists, get
 * chosen, and fail at the API with an error that points nowhere useful.
 *
 * So the pickers ask here first. A template that cannot be sent is shown
 * with the reason rather than hidden — hiding it would look like the
 * template had vanished after being approved.
 *
 * WHAT REMAINS BLOCKED BY TYPE is waiting on WhatsApp account
 * configuration, not on code: order-detail templates need WhatsApp Pay,
 * catalogue templates need a connected product catalogue. Everything whose
 * only obstacle was a missing input form is now sendable — see
 * `buildSendPlan` in template-send-inputs.ts, which describes each shape's
 * send-time slots so the pickers can render them.
 *
 * ONE VERDICT DEPENDS ON CONTEXT rather than on the template: an
 * order-status update targets a single order, so it is sendable from a
 * conversation and refused in a broadcast.
 *
 * When a type becomes sendable, delete its case. The compiler will not
 * remind you, so the test file asserts the current set.
 */

export interface SendabilityVerdict {
  sendable: boolean;
  /** Present when `sendable` is false. Written for the operator. */
  reason?: string;
}

/** The fields needed to judge. Narrow so both rows and drafts satisfy it. */
export interface SendabilityInput {
  template_type?: string | null;
  status?: string | null;
  /**
   * Not read at present. Kept because the verdict was content-dependent
   * for carousels until their send form existed, and the next blocked
   * type may well be content-dependent too — callers already pass whole
   * rows, so removing it would only have to be undone.
   */
  components?: unknown;
  name?: string;
  category?: 'Marketing' | 'Utility' | 'Authentication';
}

/**
 * Where the template is about to be sent from.
 *
 * 'broadcast' sends ONE set of values to many recipients, which makes some
 * templates unusable there even though they send fine one-to-one — see the
 * order-status case.
 */
export type SendContext = 'inbox' | 'broadcast';

export function templateSendability(
  template: SendabilityInput,
  context: SendContext = 'inbox',
): SendabilityVerdict {
  if (template.status !== 'APPROVED') {
    return {
      sendable: false,
      reason: 'Only approved templates can be sent.',
    };
  }

  // An order-status send updates ONE specific order, identified by the
  // reference id of the order message that created it. A broadcast applies
  // one set of values to everyone, so it would send every recipient the
  // same order's status — either a stranger's order details or, more
  // likely, a rejected send per recipient. Blocked in that context only.
  if (context === 'broadcast' && template.template_type === 'order_status') {
    return {
      sendable: false,
      reason:
        'Order status updates apply to one specific order, so they are sent from a conversation rather than broadcast to a list.',
    };
  }

  switch (template.template_type) {
    // 'carousel' and 'limited_time_offer' were both blocked here until the
    // pickers learned to collect what they need — per-card media, text and
    // link values for a carousel, and a per-message deadline for an offer.
    // `buildSendPlan` in template-send-inputs.ts now describes those slots
    // and both the inbox picker and the broadcast personalize step render
    // them, so the cases are gone rather than relaxed.
    // An order-details message is an INVOICE for one specific customer —
    // its items, total and reference id differ per person. Broadcasting one
    // would bill a whole list for the same order, so it is refused there and
    // sent from a conversation instead. Same reasoning as order status.
    case 'order_details':
      if (context === 'broadcast') {
        return {
          sendable: false,
          reason:
            'An order details message is an invoice for one customer, so it is sent from a conversation rather than broadcast to a list.',
        };
      }
      return { sendable: true };
    default:
      // 'default', 'authentication' and 'flows' all send through the
      // standard path. Authentication is handled specially by the send
      // builder but needs no extra input beyond the code.
      return { sendable: true };
  }
}
