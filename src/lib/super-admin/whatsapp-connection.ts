// ============================================================
// Turning one tenant's WhatsApp connection into things a platform operator
// can read at a glance.
//
// The Super Admin deep dive showed three fields — number, phone id, WABA id —
// so the operator could not answer, per tenant: how did they connect, are they
// on pure Cloud API or Coexistence, is their number actually registered, are
// webhooks subscribed, is their token about to expire, has Meta blocked them,
// is their business verified. Every one of those was either already in the
// deep-dive payload or one Meta call away.
//
// Pure derivation, no I/O and no JSX, so each verdict is unit-testable and
// the card stays a rendering concern. Every function returns the same shape so
// the card can lay them out uniformly.
// ============================================================

/**
 * Visual weight, mapped to the super-admin palette by the badge component.
 *
 * Named by MEANING rather than colour so a palette change is one edit in the
 * component and none here.
 */
export type FactTone = 'good' | 'warn' | 'danger' | 'info' | 'neutral';

export interface Fact {
  label: string;
  tone: FactTone;
  /** One line of context. Null when the label speaks for itself. */
  detail: string | null;
}

const UNKNOWN: Fact = {
  label: 'Unknown',
  tone: 'neutral',
  detail: 'Not reported.',
};

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ------------------------------------------------------------
// From our own row — instant, no Meta call
// ------------------------------------------------------------

/**
 * Which API surface the tenant is on.
 *
 * This is the question the operator asked for first, and it changes what is
 * true about the account: a Coexistence number is also live on someone's
 * phone, is capped at 5 messages/second, cannot have template insights, and
 * drops the pairing if the app is not opened for ~13 days.
 */
export function describeConnectionMode(mode: unknown): Fact {
  switch (clean(mode)) {
    case 'coexistence':
      return {
        label: 'Coexistence',
        tone: 'info',
        detail:
          'Also live on the WhatsApp Business phone app. Capped at 5 msg/sec, no template insights, and Meta drops the pairing if the app is unopened for ~13 days.',
      };
    case 'cloud_api':
      return {
        label: 'Cloud API',
        tone: 'good',
        detail: 'API only — no phone app attached. Full feature set.',
      };
    default:
      return UNKNOWN;
  }
}

/** How the tenant got connected, which tells you who to blame for a bad setup. */
export function describeConnectionFlow(source: unknown): Fact {
  switch (clean(source)) {
    case 'embedded_signup':
      return {
        label: 'Embedded Signup',
        tone: 'good',
        detail:
          'Connected through Meta\u2019s in-app flow. The tenant owns the WABA and shared it with us.',
      };
    case 'manual':
      return {
        label: 'Manual',
        tone: 'warn',
        detail:
          'Credentials were pasted in by hand. Tokens entered this way are the ones that expire without warning.',
      };
    default:
      return UNKNOWN;
  }
}

/**
 * Whether the number was ever registered on the Cloud API.
 *
 * The state that silently strands accounts: everything looks connected, and
 * the number cannot send a single message. `last_registration_error` outranks
 * a present `registered_at` because a later failure means the current state is
 * broken regardless of a past success.
 */
export function describeRegistration(config: {
  registered_at?: string | null;
  last_registration_error?: string | null;
  connection_mode?: string | null;
}): Fact {
  const error = clean(config.last_registration_error);
  if (error) {
    return {
      label: 'Failed',
      tone: 'danger',
      detail: error,
    };
  }
  if (clean(config.registered_at)) {
    return { label: 'Registered', tone: 'good', detail: null };
  }
  // Coexistence numbers are registered by Meta during onboarding, so a blank
  // here is normal rather than a fault — flagging it would send the operator
  // chasing a non-problem on every Coexistence tenant.
  if (clean(config.connection_mode) === 'coexistence') {
    return {
      label: 'Handled by Meta',
      tone: 'neutral',
      detail: 'Coexistence numbers are registered by Meta during onboarding.',
    };
  }
  return {
    label: 'Never registered',
    tone: 'warn',
    detail:
      'No successful /register call recorded. The number may be unable to send.',
  };
}

/**
 * Whether Meta is delivering webhooks to us for this WABA.
 *
 * Absent means inbound messages never arrive and nobody gets an error — the
 * most expensive silent failure in the product, which is why it earns a row.
 */
export function describeWebhook(args: {
  /** `whatsapp_config.subscribed_apps_at` — only records calls WE made. */
  recordedAt?: string | null;
  /** Meta's own answer from `GET /{waba-id}/subscribed_apps`. */
  metaSubscribed?: boolean | null;
}): Fact {
  // Meta wins whenever it answered. Our column is bookkeeping and is null on
  // every account that connected before it was written — verified on a live
  // tenant whose column was null while Meta listed the app as subscribed. So
  // trusting our own record here would show a red "inbound messages are being
  // lost" on a perfectly healthy account, which is the worst direction to be
  // wrong in: it sends the operator chasing a fault that does not exist.
  if (args.metaSubscribed === true) {
    return {
      label: 'Subscribed',
      tone: 'good',
      detail: clean(args.recordedAt)
        ? null
        : 'Confirmed with Meta. We have no local record of the call, which is normal for older connections.',
    };
  }

  if (args.metaSubscribed === false) {
    return {
      label: 'Not subscribed',
      tone: 'danger',
      detail:
        'Meta reports no app subscribed to this WABA. Inbound messages are being lost silently.',
    };
  }

  // Meta could not be asked. Fall back to our own record, and say which
  // signal this is so it is not mistaken for a confirmed verdict.
  return clean(args.recordedAt)
    ? {
        label: 'Subscribed',
        tone: 'good',
        detail: 'From our own record — Meta was not reachable to confirm.',
      }
    : {
        label: 'Unconfirmed',
        tone: 'warn',
        detail:
          'No local record and Meta could not be asked. Recheck before treating this as a fault.',
      };
}

/** Days between now and a timestamp, rounded down. Negative once past. */
function daysUntil(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.floor((at - now.getTime()) / 86_400_000);
}

/**
 * Token expiry, which is the difference between a working tenant and one that
 * breaks on a specific future date with no warning.
 *
 * Null is GOOD here, not unknown: the embedded-signup path upgrades to a
 * non-expiring system-user token and clears this, so no expiry is the healthy
 * end state. Reporting it as "unknown" would put a permanent question mark on
 * every correctly-configured account.
 */
export function describeTokenExpiry(
  expiresAt: unknown,
  now: Date = new Date()
): Fact {
  const iso = clean(expiresAt);
  if (!iso) {
    return {
      label: 'Never expires',
      tone: 'good',
      detail: 'A permanent system-user token.',
    };
  }

  const days = daysUntil(iso, now);
  if (days === null) return UNKNOWN;

  if (days < 0) {
    return {
      label: 'Expired',
      tone: 'danger',
      detail: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago. Every Meta call for this tenant is failing.`,
    };
  }
  if (days <= 7) {
    return {
      label: `${days} day${days === 1 ? '' : 's'} left`,
      tone: 'danger',
      detail: 'Expires imminently. The tenant must reconnect.',
    };
  }
  if (days <= 30) {
    return {
      label: `${days} days left`,
      tone: 'warn',
      detail: 'Worth prompting the tenant to reconnect.',
    };
  }
  return { label: `${days} days left`, tone: 'good', detail: null };
}

/**
 * Whether the pairing is currently broken, and why.
 *
 * Only meaningful for Coexistence, where Meta drops the link for reasons the
 * tenant can usually fix in a minute — but only if someone tells them which
 * reason it was.
 */
export function describeDisconnect(config: {
  disconnect_event?: string | null;
  disconnect_reason?: string | null;
  disconnected_at?: string | null;
}): Fact | null {
  const event = clean(config.disconnect_event);
  const reason = clean(config.disconnect_reason);
  if (!event && !reason) return null;

  return {
    label: reason ?? event ?? 'Disconnected',
    tone: 'danger',
    detail: event && reason ? `Meta event: ${event}` : null,
  };
}

/** Whether template analytics were ever switched on. */
export function describeInsights(
  enabledAt: unknown,
  connectionMode: unknown
): Fact {
  if (clean(connectionMode) === 'coexistence') {
    return {
      label: 'Not available',
      tone: 'neutral',
      detail:
        'Meta does not support template insights on Coexistence numbers at all.',
    };
  }
  return clean(enabledAt)
    ? { label: 'On', tone: 'good', detail: null }
    : {
        label: 'Off',
        tone: 'warn',
        detail:
          'Meta is collecting no per-template read or click data for this tenant.',
      };
}

// ------------------------------------------------------------
// From Meta — needs the health endpoint
// ------------------------------------------------------------

/** Meta's overall verdict on whether this tenant can send at all. */
export function describeReadiness(readiness: unknown): Fact {
  switch (clean(readiness)) {
    case 'available':
      return { label: 'Can send', tone: 'good', detail: null };
    case 'limited':
      return {
        label: 'Limited',
        tone: 'warn',
        detail: 'Meta is restricting sending. See the reasons below.',
      };
    case 'blocked':
      return {
        label: 'Blocked',
        tone: 'danger',
        detail: 'Meta is refusing to send for this account.',
      };
    default:
      return UNKNOWN;
  }
}

/**
 * Meta's payment verdict.
 *
 * NOT "a payment method exists". There is no public Graph field for that, so
 * the honest claim is narrower: is Meta currently raising a payment-related
 * blocker. The wording says exactly that, because an operator who reads
 * "Payment: OK" as "their card is on file" will draw a wrong conclusion the
 * first time a charge fails.
 */
export function describePayment(state: unknown): Fact {
  switch (clean(state)) {
    case 'no_issue':
      return {
        label: 'No issues',
        tone: 'good',
        detail:
          'Meta is not raising a payment problem. This is not confirmation that a card is on file \u2014 Meta exposes no field for that.',
      };
    case 'action_required':
      return {
        label: 'Action required',
        tone: 'danger',
        detail:
          'Meta is blocking or limiting sending for a payment reason. Usually no card, or a card that was never set as default.',
      };
    default:
      return UNKNOWN;
  }
}

/** Business verification, straight from the WABA. */
export function describeVerification(state: unknown): Fact {
  switch (clean(state)) {
    case 'verified':
      return { label: 'Verified', tone: 'good', detail: null };
    case 'pending':
      return {
        label: 'In review',
        tone: 'info',
        detail: 'Submitted to Meta. Nothing to do but wait.',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        tone: 'danger',
        detail: 'Meta rejected verification. The tenant must resubmit.',
      };
    case 'not_started':
      return {
        label: 'Not started',
        tone: 'warn',
        detail:
          'Unverified businesses are capped at lower messaging limits and 250 templates.',
      };
    default:
      return UNKNOWN;
  }
}

/** Meta's deliverability grade for the number. */
export function describeQuality(rating: unknown): Fact {
  switch (clean(rating)?.toUpperCase()) {
    case 'GREEN':
      return { label: 'High', tone: 'good', detail: null };
    case 'YELLOW':
      return {
        label: 'Medium',
        tone: 'warn',
        detail: 'Recipients are reporting or blocking. One step from a limit.',
      };
    case 'RED':
      return {
        label: 'Low',
        tone: 'danger',
        detail: 'Meta may reduce this number\u2019s messaging limit.',
      };
    case 'UNKNOWN':
    case null:
    case undefined:
      return {
        label: 'Not rated',
        tone: 'neutral',
        detail: 'Too little sending history for Meta to grade.',
      };
    default:
      return UNKNOWN;
  }
}

/** Meta's phone-number status, which is not the same as our own flag. */
export function describeMetaPhoneStatus(status: unknown): Fact {
  const value = clean(status)?.toUpperCase();
  switch (value) {
    case 'CONNECTED':
      return { label: 'Connected', tone: 'good', detail: null };
    case 'PENDING':
      return {
        label: 'Pending',
        tone: 'warn',
        detail: 'Meta has not activated the number yet.',
      };
    case 'FLAGGED':
      return {
        label: 'Flagged',
        tone: 'danger',
        detail: 'Quality has dropped far enough for Meta to flag the number.',
      };
    case 'RESTRICTED':
      return {
        label: 'Restricted',
        tone: 'danger',
        detail: 'Meta has restricted this number\u2019s messaging.',
      };
    case 'BANNED':
      return {
        label: 'Banned',
        tone: 'danger',
        detail: 'Meta has banned this number.',
      };
    default:
      return value
        ? { label: value, tone: 'neutral', detail: 'Reported by Meta.' }
        : UNKNOWN;
  }
}

/**
 * Does our stored connection mode still match Meta's own view?
 *
 * `is_on_biz_app` is the authoritative Coexistence signal — `platform_type`
 * reads CLOUD_API for both kinds — so a mismatch means our row has drifted and
 * every mode-dependent behaviour (echo handling, insights, the 13-day warning)
 * is being applied to the wrong kind of account. Worth surfacing rather than
 * silently trusting the stored value.
 *
 * Returns null when there is nothing to say, so the card can omit the row.
 */
export function describeModeDrift(args: {
  storedMode?: string | null;
  isOnBizApp?: boolean | null;
}): Fact | null {
  const stored = clean(args.storedMode);
  if (!stored || typeof args.isOnBizApp !== 'boolean') return null;

  const metaSaysCoexistence = args.isOnBizApp;
  const weSayCoexistence = stored === 'coexistence';
  if (metaSaysCoexistence === weSayCoexistence) return null;

  return {
    label: 'Mismatch',
    tone: 'danger',
    detail: metaSaysCoexistence
      ? 'We have this stored as Cloud API, but Meta reports the number is on the WhatsApp Business app. The tenant is missing Coexistence behaviour.'
      : 'We have this stored as Coexistence, but Meta reports no phone app attached. The tenant may be seeing warnings that do not apply.',
  };
}
