// ============================================================
// Meta messaging health — pure derivation, no I/O.
//
// Replaces guesswork in the WhatsApp Setup checklist. The payment step
// used to render "Action Required" whenever an account was connected,
// with nothing behind it: it never checked anything, so it nagged
// forever even after the customer had added a card and Meta had ticked
// the same task green on its own dashboard. A permanent warning teaches
// people to ignore warnings.
//
// The fix is to report META'S OWN VERDICT instead of inventing one.
// `GET /<PHONE_NUMBER_ID>?fields=health_status` returns whether
// messaging is AVAILABLE / LIMITED / BLOCKED across every node involved
// (phone number, WABA, business portfolio, app), and for anything not
// AVAILABLE it returns Meta's own description and suggested fix.
//
// Deliberate limit on what we claim: this does NOT assert "a payment
// method exists". There is no public Graph field for that, and inferring
// it from a green health status would be inventing a fact again, just in
// the opposite direction. We report what Meta reports — can you send, or
// not, and if not, why — which is the thing the customer actually needs
// to know.
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/health-status/
// ============================================================

/** Meta's per-node and overall messaging verdict. */
export type SendingReadiness = 'available' | 'limited' | 'blocked' | 'unknown';

export interface HealthBlocker {
  code: number | null;
  description: string;
  /** Meta's suggested remedy. Often the most useful line on the screen. */
  solution: string | null;
}

export interface HealthSummary {
  readiness: SendingReadiness;
  /** Reasons sending is BLOCKED, from any node in the chain. */
  blockers: HealthBlocker[];
  /** Free-text notes explaining a LIMITED status. */
  limitations: string[];
}

export const UNKNOWN_HEALTH: HealthSummary = {
  readiness: 'unknown',
  blockers: [],
  limitations: [],
};

function toReadiness(value: unknown): SendingReadiness {
  switch (String(value ?? '').toUpperCase()) {
    case 'AVAILABLE':
      return 'available';
    case 'LIMITED':
      return 'limited';
    case 'BLOCKED':
      return 'blocked';
    default:
      return 'unknown';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Worst-wins ordering, so one blocked node decides the verdict. */
const SEVERITY: Record<SendingReadiness, number> = {
  unknown: 0,
  available: 1,
  limited: 2,
  blocked: 3,
};

/**
 * Normalise a raw `health_status` payload, scoped to MESSAGING only.
 *
 * Two traps in Meta's payload shape, both of which produced false alarms
 * on a real account before this was scoped properly:
 *
 * 1. `errors` and `additional_info` are ONE array per entity, shared
 *    between the `can_send_message` and `can_receive_call_sip`
 *    capabilities. Meta's own documented example shows a phone number
 *    with `can_send_message: AVAILABLE` and `can_receive_call_sip:
 *    BLOCKED` carrying two SIP errors. Reading the array without asking
 *    WHICH capability is broken reports "sending is blocked" to a
 *    business whose sending is perfectly fine. This app has no calling
 *    feature at all, so SIP problems are pure noise here — errors are
 *    therefore only collected from entities whose MESSAGING is blocked,
 *    and notes only from entities whose MESSAGING is limited.
 *
 * 2. The root `health_status.can_send_message` aggregate cannot be
 *    trusted for a messaging-only product. In that same documented
 *    example the root reads BLOCKED while every node's messaging is
 *    AVAILABLE — the aggregate had gone red purely because of SIP.
 *    Readiness is therefore derived from the entities' own messaging
 *    statuses, and the root is used only as a fallback when no entities
 *    are present.
 *
 * Errors are still gathered across ALL entity types, not just the phone
 * number: a billing or verification problem surfaces on the WABA or the
 * business portfolio, which is exactly what this screen needs to show.
 *
 * Tolerant of a missing or malformed payload — Meta may omit the field
 * on older API versions or when a token lacks the permission, and the
 * caller must then fall back to neutral copy rather than a fabricated
 * warning.
 */
export function summarizeHealthStatus(raw: unknown): HealthSummary {
  const root = asRecord(raw);
  if (!root) return UNKNOWN_HEALTH;

  const blockers: HealthBlocker[] = [];
  const limitations: string[] = [];
  const seen = new Set<string>();

  const entities = Array.isArray(root.entities) ? root.entities : [];
  let worst: SendingReadiness | null = null;

  for (const entry of entities) {
    const entity = asRecord(entry);
    if (!entity) continue;

    // The messaging verdict for THIS node. Note we read
    // `can_send_message`, never `can_receive_call_sip`.
    const messaging = toReadiness(entity.can_send_message);
    if (messaging !== 'unknown') {
      if (worst === null || SEVERITY[messaging] > SEVERITY[worst]) {
        worst = messaging;
      }
    }

    if (messaging === 'blocked' && Array.isArray(entity.errors)) {
      for (const rawError of entity.errors) {
        const error = asRecord(rawError);
        if (!error) continue;

        const description =
          typeof error.error_description === 'string'
            ? error.error_description.trim()
            : '';
        if (!description) continue;

        // The same requirement can be reported by more than one node
        // (an app and its WABA both complaining). Showing it twice makes
        // the list look broken.
        if (seen.has(description)) continue;
        seen.add(description);

        blockers.push({
          code: typeof error.error_code === 'number' ? error.error_code : null,
          description,
          solution:
            typeof error.possible_solution === 'string' &&
            error.possible_solution.trim()
              ? error.possible_solution.trim()
              : null,
        });
      }
    }

    if (messaging === 'limited' && Array.isArray(entity.additional_info)) {
      for (const note of entity.additional_info) {
        if (typeof note !== 'string') continue;
        const text = note.trim();
        if (text && !seen.has(text)) {
          seen.add(text);
          limitations.push(text);
        }
      }
    }
  }

  return {
    readiness: worst ?? toReadiness(root.can_send_message),
    blockers,
    limitations,
  };
}

// ------------------------------------------------------------
// Business verification
// ------------------------------------------------------------

export type VerificationState =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'not_started'
  | 'unknown';

/**
 * Interpret `WhatsAppBusinessAccount.business_verification_status`.
 *
 * Grouped rather than passed through because Meta uses several values
 * for the same practical situation — `pending`, `pending_need_more_info`
 * and `pending_submission` all mean "in progress, nothing to do but
 * wait" — and the checklist only needs to decide which badge to show.
 *
 * Anything unrecognised maps to `unknown`, NOT to `not_started`. A new
 * Meta value must never be reported to the customer as "you haven't done
 * this" when they may well have.
 */
export function deriveVerificationState(
  status: string | null | undefined,
): VerificationState {
  const value = String(status ?? '')
    .trim()
    .toLowerCase();

  if (!value) return 'unknown';
  if (value === 'verified') return 'verified';
  if (value === 'not_verified') return 'not_started';
  if (value.startsWith('pending')) return 'pending';
  if (
    value === 'rejected' ||
    value === 'failed' ||
    value === 'revoked' ||
    value === 'expired'
  ) {
    return 'rejected';
  }
  return 'unknown';
}

// ------------------------------------------------------------
// Deep links to the place a problem gets fixed
// ------------------------------------------------------------
//
// Meta does NOT return a URL. `health_status` gives an
// `error_description` and a `possible_solution` string and nothing else,
// so telling a customer "your display name has not been approved" leaves
// them to go and find the right screen among Business Manager, Business
// Settings and WhatsApp Manager. This maps each kind of issue onto the
// page that actually resolves it.
//
// Matching is on Meta's wording, which is a real limitation worth stating:
// if Meta rephrases a message, or returns it in another language, a
// specific match can miss. That is why the fallback is WhatsApp Manager
// for the account rather than nothing — a slightly-too-general link is
// still far better than making someone hunt, and it can never be wrong
// in the way a mis-targeted link would be.

/** Where a health issue can be resolved. */
export interface HealthIssueLink {
  /** Button text. Names the destination so the click is predictable. */
  label: string;
  url: string;
}

const BUSINESS_SETTINGS = 'https://business.facebook.com/settings';
const WA_MANAGE = 'https://business.facebook.com/wa/manage';

/**
 * Scope a WhatsApp Manager URL to one WABA when we know its id.
 *
 * Without the parameter the customer lands on whichever account Meta
 * last showed them, which for anyone managing several is the wrong one.
 */
function waManage(path: string, wabaId?: string | null): string {
  const base = `${WA_MANAGE}/${path}`;
  return wabaId ? `${base}/?waba_id=${encodeURIComponent(wabaId)}` : base;
}

/**
 * Best destination for one health issue.
 *
 * @param text  Meta's `error_description` or `additional_info` note.
 * @param wabaId  Used to scope WhatsApp Manager links.
 */
export function resolveHealthIssueLink(
  text: string,
  wabaId?: string | null,
): HealthIssueLink {
  const haystack = text.toLowerCase();

  // Display name review — the most common limitation on a new number,
  // and the one people most often cannot find. Lives in WhatsApp
  // Manager under Phone numbers, NOT in Business Settings.
  if (haystack.includes('display name')) {
    return {
      label: 'Open phone number settings',
      url: waManage('phone-numbers', wabaId),
    };
  }

  // Billing. Checked before the generic cases because a payment problem
  // is often described in terms of the thing it blocks.
  if (
    haystack.includes('payment') ||
    haystack.includes('billing') ||
    haystack.includes('credit line') ||
    haystack.includes('funding')
  ) {
    return {
      label: 'Open payment settings',
      url: `${BUSINESS_SETTINGS}/payment-methods`,
    };
  }

  if (
    haystack.includes('business verification') ||
    haystack.includes('verify your business') ||
    haystack.includes('not verified') ||
    haystack.includes('unverified')
  ) {
    return {
      label: 'Open business verification',
      url: `${BUSINESS_SETTINGS}/security`,
    };
  }

  if (haystack.includes('template')) {
    return {
      label: 'Open message templates',
      url: waManage('message-templates', wabaId),
    };
  }

  if (
    haystack.includes('phone number') ||
    haystack.includes('registration') ||
    haystack.includes('not registered')
  ) {
    return {
      label: 'Open phone number settings',
      url: waManage('phone-numbers', wabaId),
    };
  }

  if (haystack.includes('policy') || haystack.includes('violat')) {
    return {
      label: 'Open account quality',
      url: waManage('account-quality', wabaId),
    };
  }

  // Unrecognised. WhatsApp Manager is the right home for anything
  // messaging-related, so this stays useful even for wording we have
  // never seen.
  return { label: 'Open WhatsApp Manager', url: waManage('home', wabaId) };
}
