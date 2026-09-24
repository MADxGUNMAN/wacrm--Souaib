/**
 * Turn Meta's Embedded Signup failures into something an operator can act on.
 *
 * ── Why this exists ───────────────────────────────────────────────
 *
 * Meta reports in-flow failures through the `WA_EMBEDDED_SIGNUP` postMessage
 * channel, NOT through the `FB.login` callback. The callback simply comes back
 * without an `authResponse`, which is indistinguishable from the operator
 * closing the popup. Before this module, every one of those landed on the same
 * toast: "Connection cancelled or incomplete".
 *
 * That is why the "Coexistence option never appears for some accounts" bug went
 * undiagnosed for so long. A hard, permanent rejection — the number is in an
 * unsupported region, the number is already on the Cloud API with another
 * provider, the WABA is already shared with a different BSP — looked exactly
 * like an accidental click. The operator retried, got the same nothing, and
 * concluded the product was broken.
 *
 * Every code below is a documented Embedded Signup error. They fall into three
 * families, and the distinction matters because the remediation is completely
 * different:
 *
 *   * ASSET SHARING   the WABA exists but is tied to another tech provider
 *   * ELIGIBILITY     the phone number itself cannot do what was asked
 *   * OUR SIDE        something we (the solution partner) must fix
 *
 * Sources: Meta's Embedded Signup error reference
 * (https://developers.facebook.com/docs/whatsapp/embedded-signup/errors/) and
 * the BSP-published code list at
 * https://support.wati.io/en/articles/11875544-troubleshooting-whatsapp-coexistence-signup-process-common-issues-and-how-to-resolve-them
 */

export type EmbeddedSignupErrorFamily =
  'asset_sharing' | 'eligibility' | 'our_side' | 'unknown';

export interface EmbeddedSignupErrorInfo {
  /** The numeric Meta code, when we could identify one. */
  code: number | null;
  family: EmbeddedSignupErrorFamily;
  /** What went wrong, in the operator's terms. */
  message: string;
  /** What to do about it. Empty when there is no action the operator can take. */
  fix: string;
  /**
   * Whether retrying the same flow with the same inputs could ever succeed.
   * `false` means stop and change something first — this is what stops the
   * retry loop that made the original bug so confusing.
   */
  retryable: boolean;
}

interface Entry {
  family: EmbeddedSignupErrorFamily;
  message: string;
  fix: string;
  retryable: boolean;
}

/**
 * Keyed by Meta's numeric error code.
 *
 * Wording is deliberately ours, not Meta's. Meta's strings are written for the
 * developer reading API docs; these are written for a business owner staring at
 * a popup that just closed on them.
 */
const ERRORS: Record<number, Entry> = {
  // ── Asset sharing ───────────────────────────────────────────────
  2655049: {
    family: 'asset_sharing',
    message:
      'This WhatsApp Business Account is already connected to another provider.',
    fix: 'In Meta Business Suite, remove the other provider from this account, or create a new WhatsApp Business Account to use here.',
    retryable: false,
  },
  2494028: {
    family: 'asset_sharing',
    message:
      'This WhatsApp Business Account is already shared with another provider.',
    fix: 'Unshare it in Meta Business Suite, or pick a different account.',
    retryable: false,
  },
  2494119: {
    family: 'asset_sharing',
    message:
      'This WhatsApp Business Account already has a provider attached to it.',
    fix: 'Select a different account, or resolve the existing provider relationship in Meta Business Suite first.',
    retryable: false,
  },
  2655093: {
    family: 'asset_sharing',
    message:
      'This account is already connected to a provider, and Meta does not allow switching providers directly.',
    fix: 'On the phone, open WhatsApp Business → Settings → Account → Business Platform and disconnect the current provider. Then start setup again.',
    retryable: false,
  },
  2593072: {
    family: 'asset_sharing',
    message:
      'The WhatsApp Business Account you selected could not be found, or you do not have access to it.',
    fix: 'Choose an account you are an admin of, and check that your Meta Business portfolio is the one that owns it.',
    retryable: true,
  },
  2494120: {
    family: 'asset_sharing',
    message: 'Meta will not allow this WhatsApp Business Account to be shared.',
    fix: 'Contact support with the trace ID from your browser console — this one needs to be raised with Meta.',
    retryable: false,
  },
  2494029: {
    family: 'asset_sharing',
    message: 'Meta could not share this WhatsApp Business Account.',
    fix: 'Try again in a few minutes. If it keeps failing, contact support with the trace ID from your browser console.',
    retryable: true,
  },

  // ── Eligibility: the number itself ──────────────────────────────
  3441042: {
    family: 'eligibility',
    message:
      "This feature isn't available for phone numbers from this country yet.",
    fix: 'Meta is still rolling this out region by region. Use a number from a supported country, or connect with a new number on the Cloud API instead.',
    retryable: false,
  },
  2655095: {
    family: 'eligibility',
    message: 'This number is not on the WhatsApp Business app.',
    fix: 'Install the WhatsApp Business app on the phone, register this number in it, and use it normally for at least 7 days. Then come back and try again.',
    retryable: false,
  },
  2655048: {
    family: 'eligibility',
    message: 'This number is not on the WhatsApp Business app.',
    fix: 'Install the WhatsApp Business app on the phone, register this number in it, and use it normally for at least 7 days. Then come back and try again.',
    retryable: false,
  },
  3441041: {
    family: 'eligibility',
    message:
      'This phone number belongs to a different Meta Business portfolio than the one you selected.',
    fix: 'Either select the portfolio that owns the number, or unlink the number from the other portfolio in Meta Business Suite.',
    retryable: true,
  },
  2655082: {
    family: 'eligibility',
    message: 'This number is already linked to a different Facebook Page.',
    fix: 'Unlink the number from that Page in Meta Business Suite, then retry with the correct Page.',
    retryable: false,
  },
  3441047: {
    family: 'eligibility',
    message:
      'This WhatsApp Business Account is set up for Marketing Messages Lite, which cannot be used with this connection type.',
    fix: 'Choose a different WhatsApp Business Account, one that is not configured for Marketing Messages Lite.',
    retryable: false,
  },

  // ── Our side ────────────────────────────────────────────────────
  2494091: {
    family: 'our_side',
    message:
      'Meta is blocking the connection because our business verification is incomplete.',
    fix: 'Nothing for you to do — please contact support so we can complete verification on our end.',
    retryable: false,
  },
};

/** Codes sorted longest-first so a scan cannot match a shorter prefix. */
const KNOWN_CODES = Object.keys(ERRORS)
  .map(Number)
  .sort((a, b) => String(b).length - String(a).length);

/**
 * Pull a numeric Meta code out of whatever the postMessage actually carried.
 *
 * Meta is not consistent here. Depending on the step that failed, the code has
 * arrived as `error_code`, as `code`, as `error_id`, and — often — only as a
 * number embedded in the human-readable `error_message`. Reading a single field
 * would silently miss most real failures, so all of them are tried in order of
 * how trustworthy they are, with a substring scan of the message as the last
 * resort.
 */
export function extractEmbeddedSignupErrorCode(
  payload: unknown
): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;

  for (const key of ['error_code', 'code', 'error_id', 'errorCode']) {
    const raw = data[key];
    const parsed =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^\d+$/.test(raw.trim())
          ? Number(raw.trim())
          : null;
    if (parsed !== null && ERRORS[parsed]) return parsed;
  }

  const message =
    typeof data.error_message === 'string' ? data.error_message : '';
  if (message) {
    for (const code of KNOWN_CODES) {
      if (message.includes(String(code))) return code;
    }
  }

  return null;
}

/**
 * Describe an Embedded Signup failure.
 *
 * Always returns something usable. When Meta gave us a code we recognise, the
 * result is specific and actionable. When it did not, we fall back to Meta's
 * own message, and only then to a generic line — but the generic line now says
 * where to look instead of blaming the operator for cancelling.
 */
export function describeEmbeddedSignupError(args: {
  /** The `data` object from the `WA_EMBEDDED_SIGNUP` ERROR postMessage. */
  payload?: unknown;
  /** `data.current_step`, when Meta reported which screen failed. */
  currentStep?: unknown;
}): EmbeddedSignupErrorInfo {
  const { payload, currentStep } = args;

  const code = extractEmbeddedSignupErrorCode(payload);
  const entry = code !== null ? ERRORS[code] : undefined;

  if (entry) {
    return {
      code,
      family: entry.family,
      message: entry.message,
      fix: entry.fix,
      retryable: entry.retryable,
    };
  }

  const data =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const metaMessage =
    typeof data.error_message === 'string' && data.error_message.trim()
      ? data.error_message.trim()
      : null;

  const step = typeof currentStep === 'string' ? currentStep : null;

  return {
    code,
    family: 'unknown',
    message:
      metaMessage ??
      (step
        ? `Meta stopped the setup at the "${step}" step without saying why.`
        : 'Meta stopped the setup without saying why.'),
    // No known code means we cannot promise a retry is pointless, and a retry
    // is cheap, so leave the door open rather than dead-ending the operator.
    fix: 'Try again. If it fails the same way, open the browser console — the full Meta response is logged there and support can read it.',
    retryable: true,
  };
}

/** Flatten to a single line for a toast. */
export function formatEmbeddedSignupError(
  info: EmbeddedSignupErrorInfo
): string {
  return info.fix ? `${info.message} ${info.fix}` : info.message;
}
