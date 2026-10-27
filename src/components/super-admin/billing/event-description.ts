// ============================================================
// One billing event in a plain sentence (pure, client-safe).
//
// subscription_events.note is written by SQL functions and server code
// in machine shapes ("Razorpay sub_X: created -> authenticated",
// "Synced from Razorpay: active -> active, 0 payment(s) applied"). The
// Activity log used to print them verbatim in italic quotes. This turns
// each known shape into a sentence plus at most ONE reference id (shown
// once, as a copyable chip), and passes anything else through as a note
// written by a person.
//
// Shapes come from migrations 20261021010000 (subscription snapshot,
// payment apply), 20261022000000 (refunds, disputes, anomalies),
// 20261024000000 (webhook re-queue), src/lib/billing/razorpay/admin.ts
// (sync, cancel), account-autopay.ts (ban) and the manual UPI submit
// route ("UTR <ref>").
// ============================================================

import type { BillingEventView } from '@/types/super-admin';

import {
  accessEffectMeta,
  disputePhaseLabel,
  disputeReasonLabel,
  sentenceCase,
  statusMeta,
  webhookEventLabel,
} from './billing-labels';

export type EventReferenceKind =
  'subscription' | 'payment' | 'utr' | 'refund' | 'dispute';

export interface EventReference {
  kind: EventReferenceKind;
  id: string;
}

export interface EventDescription {
  text: string;
  reference: EventReference | null;
  /** Free text written by a person (a reason, an admin note), or null. */
  note: string | null;
}

export type DescribableEvent = Pick<BillingEventView, 'eventType' | 'note'> &
  Partial<
    Pick<
      BillingEventView,
      'providerSubscriptionId' | 'providerPaymentId' | 'utr'
    >
  >;

const DEFAULT_TEXT: Readonly<Record<string, string>> = {
  trial_started: 'Trial started.',
  trial_extended: 'Trial extended.',
  payment_submitted: 'Manual UPI payment submitted for review.',
  payment_approved: 'Manual UPI payment approved.',
  payment_rejected: 'Manual UPI payment rejected.',
  subscription_activated: 'Paid access started.',
  subscription_extended: 'Paid access extended.',
  subscription_revoked: 'Paid access removed.',
  subscription_expired: 'Access ended.',
  autopay_checkout_created: 'AutoPay checkout started.',
  autopay_authenticated: 'AutoPay mandate authorised.',
  autopay_activated: 'AutoPay is active.',
  payment_succeeded: 'AutoPay charge captured.',
  payment_failed: 'AutoPay charge failed.',
  autopay_pending: 'An AutoPay charge failed and Razorpay is retrying.',
  autopay_halted: 'Razorpay stopped charging after repeated failures.',
  autopay_paused: 'AutoPay paused.',
  autopay_resumed: 'AutoPay resumed.',
  autopay_cancelled: 'AutoPay cancelled.',
  autopay_completed: 'AutoPay completed all its charges.',
  refund_processed: 'Refund processed.',
  dispute_opened: 'Dispute opened.',
  dispute_closed: 'Dispute closed.',
  billing_anomaly: 'Billing anomaly recorded.',
  billing_admin_action: 'Admin billing action recorded.',
};

export function defaultEventText(eventType: string): string {
  return DEFAULT_TEXT[eventType] ?? `${sentenceCase(eventType)}.`;
}

const FIRST_CHARGE: Readonly<Record<string, string>> = {
  immediate: 'First charge straight away.',
  defer_to_trial_end: 'First charge when the trial ends.',
  defer_to_paid_end: 'First charge when the current paid period ends.',
};

const sub = (s: string) => statusMeta('subscription', s).label;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

type Matcher = (
  note: string,
  e: DescribableEvent
) => (Omit<EventDescription, 'note'> & { note?: string | null }) | null;

const MATCHERS: Matcher[] = [
  // Razorpay sub_X: created -> authenticated
  (n) => {
    const m = /^Razorpay (sub_\w+): (\w+) -> (\w+)$/.exec(n);
    if (!m) return null;
    return {
      text:
        m[2] === m[3]
          ? `AutoPay status confirmed as ${sub(m[3])}.`
          : `AutoPay status changed from ${sub(m[2])} to ${sub(m[3])}.`,
      reference: { kind: 'subscription', id: m[1] },
    };
  },
  // Razorpay sub_X created (defer_to_trial_end)
  (n) => {
    const m = /^Razorpay (sub_\w+) created \((\w+)\)$/.exec(n);
    if (!m) return null;
    const when = FIRST_CHARGE[m[2]];
    return {
      text: `AutoPay checkout started.${when ? ` ${when}` : ''}`,
      reference: { kind: 'subscription', id: m[1] },
    };
  },
  // Razorpay pay_X / Razorpay payment pay_X
  (n) => {
    const m = /^Razorpay (?:payment )?(pay_\w+)$/.exec(n);
    if (!m) return null;
    return {
      text: 'AutoPay charge captured and access extended.',
      reference: { kind: 'payment', id: m[1] },
    };
  },
  // Synced from Razorpay: a -> b, n payment(s) applied[, notes updated on m payment(s)]
  (n, e) => {
    const m =
      /^Synced from Razorpay: (\w+) -> (\w+), (\d+) payment\(s\) applied(?:, notes updated on (\d+) payment\(s\))?$/.exec(
        n
      );
    if (!m) return null;
    const applied = Number(m[3]);
    const notes = m[4] ? Number(m[4]) : 0;
    const status =
      m[1] === m[2]
        ? `Status unchanged (${sub(m[2])}).`
        : `Status changed from ${sub(m[1])} to ${sub(m[2])}.`;
    const pays =
      applied === 0
        ? 'No new payments applied.'
        : `${plural(applied, 'payment')} applied.`;
    const noteText =
      notes > 0 ? ` Payment notes updated on ${plural(notes, 'payment')}.` : '';
    return {
      text: `Synced with Razorpay. ${status} ${pays}${noteText}`,
      reference: e.providerSubscriptionId
        ? { kind: 'subscription', id: e.providerSubscriptionId }
        : null,
    };
  },
  // Cancelled AutoPay sub_X (test).[ Razorpay reported …] Reason: r
  (n) => {
    const m =
      /^Cancelled AutoPay (sub_\w+) \((\w+)\)\.( Razorpay reported it was already cancelled\.)? Reason: ([\s\S]*)$/.exec(
        n
      );
    if (!m) return null;
    return {
      text: `AutoPay cancelled by a super admin.${m[3] ? ' Razorpay reported it was already cancelled.' : ''}`,
      reference: { kind: 'subscription', id: m[1] },
      note: m[4].trim() || null,
    };
  },
  // Cancelled AutoPay sub_X because the account was banned. Reason: r
  (n) => {
    const m =
      /^Cancelled AutoPay (sub_\w+) because the account was banned\. Reason: ([\s\S]*)$/.exec(
        n
      );
    if (!m) return null;
    return {
      text: 'AutoPay cancelled because the workspace was banned.',
      reference: { kind: 'subscription', id: m[1] },
      note: m[2].trim() || null,
    };
  },
  // Re-queued Razorpay webhook evt_X (subscription.charged)
  (n) => {
    const m = /^Re-queued Razorpay webhook (\S+) \(([^)]+)\)$/.exec(n);
    if (!m) return null;
    return {
      text: `Webhook event re-queued for processing (${webhookEventLabel(m[2])}).`,
      reference: null,
      note: `Event id ${m[1]}`,
    };
  },
  // Refund rfnd_X on pay_Y (full); access: window_removed
  (n) => {
    const m =
      /^Refund (rfnd_\w+) on (pay_\w+) \((full|partial)\); access: (\w+)$/.exec(
        n
      );
    if (!m) return null;
    return {
      text: `${m[3] === 'full' ? 'Full' : 'Partial'} refund processed (${m[1]}). Access: ${accessEffectMeta(m[4]).label}.`,
      reference: { kind: 'payment', id: m[2] },
    };
  },
  // Dispute disp_X on pay_Y (chargeback, reason), respond by …
  (n) => {
    const m =
      /^Dispute (disp_\w+) on (pay_\w+) \(([^,]+), ([^)]+)\), respond by (.*)$/.exec(
        n
      );
    if (!m) return null;
    const phase = m[3] === 'unknown phase' ? null : disputePhaseLabel(m[3]);
    const reason = m[4] === 'no reason code' ? null : disputeReasonLabel(m[4]);
    const detail = [phase, reason].filter(Boolean).join(', ');
    const by = m[5] === 'unknown' ? '' : ` Respond by ${m[5]}.`;
    return {
      text: `Dispute opened${detail ? ` (${detail})` : ''}.${by}`,
      reference: { kind: 'payment', id: m[2] },
    };
  },
  // Dispute disp_X lost; access: window_removed
  (n, e) => {
    const m = /^Dispute (disp_\w+) (\w+); access: (\w+)$/.exec(n);
    if (!m) return null;
    return {
      text: `Dispute ${statusMeta('dispute', m[2]).label.toLowerCase()}. Access: ${accessEffectMeta(m[3]).label}.`,
      reference: e.providerPaymentId
        ? { kind: 'payment', id: e.providerPaymentId }
        : { kind: 'dispute', id: m[1] },
    };
  },
  // Full refund rfnd_X / Dispute lost disp_X (paid time removed)
  (n, e) => {
    const m = /^(Full refund|Dispute lost) (\w+)$/.exec(n);
    if (!m) return null;
    return {
      text:
        m[1] === 'Full refund'
          ? 'Paid time removed after a full refund.'
          : 'Paid time removed after a lost dispute.',
      reference: e.providerPaymentId
        ? { kind: 'payment', id: e.providerPaymentId }
        : { kind: m[1] === 'Full refund' ? 'refund' : 'dispute', id: m[2] },
    };
  },
  // UTR 123456789012
  (n) => {
    const m = /^UTR (\S+)$/.exec(n);
    if (!m) return null;
    return {
      text: 'Manual UPI payment submitted for review.',
      reference: { kind: 'utr', id: m[1] },
    };
  },
  // refund_mismatch on rfnd_X (pay_Y)
  (n) => {
    const m = /^refund_mismatch on (\S+) \((\S+)\)$/.exec(n);
    if (!m) return null;
    return {
      text: `Refund ${m[1]} does not match its payment. Check it in Razorpay.`,
      reference: { kind: 'payment', id: m[2] },
    };
  },
  // Razorpay plan X differs from stored Y
  (n, e) => {
    const m = /^Razorpay plan (\S+) differs from stored (\S+)$/.exec(n);
    if (!m) return null;
    return {
      text: `The Razorpay plan (${m[1]}) differs from the stored plan (${m[2]}).`,
      reference: e.providerSubscriptionId
        ? { kind: 'subscription', id: e.providerSubscriptionId }
        : null,
    };
  },
  (n, e) => {
    if (n !== 'Razorpay notes.account_id does not match this subscription') {
      return null;
    }
    return {
      text: 'The workspace id in the Razorpay notes does not match this subscription.',
      reference: e.providerSubscriptionId
        ? { kind: 'subscription', id: e.providerSubscriptionId }
        : null,
    };
  },
];

/** The reference to show when the note names none. */
function fallbackReference(e: DescribableEvent): EventReference | null {
  if (e.providerPaymentId) return { kind: 'payment', id: e.providerPaymentId };
  if (e.providerSubscriptionId) {
    return { kind: 'subscription', id: e.providerSubscriptionId };
  }
  if (e.utr) return { kind: 'utr', id: e.utr };
  return null;
}

export function describeBillingEvent(e: DescribableEvent): EventDescription {
  const raw = (e.note ?? '').trim();
  if (raw) {
    for (const match of MATCHERS) {
      const hit = match(raw, e);
      if (hit) {
        return {
          text: hit.text,
          reference: hit.reference ?? fallbackReference(e),
          note: hit.note ?? null,
        };
      }
    }
  }
  return {
    text: defaultEventText(e.eventType),
    reference: fallbackReference(e),
    note: raw || null,
  };
}
