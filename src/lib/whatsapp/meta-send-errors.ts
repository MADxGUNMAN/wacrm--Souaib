/**
 * Turn Meta's numeric send errors into something an operator can act on.
 *
 * ── Why this exists ──────────────────────────────────────────────
 *
 * A failed template send used to surface as "Failed to send template:
 * HTTP 502". That tells the operator three unhelpful things: that it
 * failed (already visible), a status code that describes our plumbing
 * rather than their problem, and nothing about what to do next.
 *
 * It also actively misleads. 502 is "Bad Gateway", so it reads like the
 * server is down — when the real cause is usually a specific, fixable
 * business condition: no payment method on the WABA, the 24-hour reply
 * window having closed, a template not approved in that language, or the
 * number not being registered.
 *
 * ── About the 502 ────────────────────────────────────────────────
 *
 * `send-message.ts` deliberately throws `SendMessageError('meta_error',
 * …, 502)` when Meta rejects a send, and `docs/public-api.md` documents
 * `meta_error` as 502 for external API consumers. That contract is left
 * alone here.
 *
 * Worth knowing though: 502 is a poor choice for "the provider rejected
 * the content of your request". Reverse proxies treat 502 as a broken
 * upstream and many REPLACE the response body with their own error page,
 * which destroys the JSON `error` field before the browser ever sees it.
 * That is exactly how a precise Meta reason degrades into a bare
 * "HTTP 502" in the UI. Changing it to 422 would fix that class of
 * message loss, but it is a documented breaking change, so it is raised
 * rather than done.
 *
 * ── Source ───────────────────────────────────────────────────────
 *
 * Every code and condition below is transcribed from Meta's Cloud API
 * error reference. Codes NOT listed there are deliberately absent rather
 * than guessed at — a confidently wrong explanation costs more debugging
 * time than an honest passthrough of Meta's own words.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */

export interface MetaSendErrorExplanation {
  /** Meta's numeric code. */
  code: number;
  /** Plain-English cause and fix, written for a CRM operator. */
  message: string;
  /** True when simply trying again could plausibly work. */
  retryable: boolean;
}

const EXPLANATIONS: Record<number, { message: string; retryable: boolean }> = {
  // ── Account / billing ─────────────────────────────────────────
  131042: {
    message:
      'Your WhatsApp Business account has a payment problem, so Meta refused ' +
      'the message. Usually this means no payment method is attached to the ' +
      'account, or the currency or timezone has not been set. Open Meta ' +
      'Business Manager, add a payment method to this WhatsApp Business ' +
      'account, and confirm its currency and timezone are set.',
    retryable: false,
  },
  131037: {
    message:
      "This number cannot send until Meta approves its display name. Meta's " +
      'own message names the cause but not the fix: submit a display name in ' +
      'WhatsApp Manager → WhatsApp Accounts → your account → Phone numbers → ' +
      'the number → Display name, then wait for review (usually a day or two). ' +
      'If this is a WhatsApp-provided test number (+1 555…), approval is ' +
      'required before it can send at all — connect your own business number ' +
      'instead if you need to message real customers.',
    retryable: false,
  },
  134011: {
    message:
      'The WhatsApp Payments terms of service have not been accepted for this ' +
      'account yet. Accept them in Meta Business Manager, then send again.',
    retryable: false,
  },
  133010: {
    message:
      'This phone number is not registered for messaging on the WhatsApp ' +
      'Business Platform. Register it in Settings, then try again.',
    retryable: false,
  },
  131045: {
    message:
      'The sending number is not fully registered with Meta. Complete phone ' +
      'number registration in Settings, then send again.',
    retryable: false,
  },
  131005: {
    message:
      'Meta says permission for this action is missing or has been removed. ' +
      'Reconnect WhatsApp in Settings so the connection is re-authorised.',
    retryable: false,
  },
  131057: {
    message:
      'The WhatsApp Business account is temporarily in maintenance mode at ' +
      "Meta's end. Nothing to fix — try again shortly.",
    retryable: true,
  },
  131063: {
    message:
      'Marketing templates are currently disabled for this account, and this ' +
      'template is categorised as Marketing. Use a Utility template, or ask ' +
      'Meta support to re-enable marketing messages.',
    retryable: false,
  },

  // ── Recipient ─────────────────────────────────────────────────
  131047: {
    message:
      'More than 24 hours have passed since this customer last replied, so a ' +
      'plain message cannot be sent. Send an approved template instead — that ' +
      'is the only way to reopen the conversation.',
    retryable: false,
  },
  131026: {
    message:
      'WhatsApp could not deliver to this number. It may not be a WhatsApp ' +
      "account, or the recipient's app is out of date, or they have not " +
      'accepted the latest WhatsApp terms. Check the number is correct.',
    retryable: false,
  },
  131050: {
    message:
      'This customer has chosen to stop receiving marketing messages from ' +
      'your business on WhatsApp. Do not retry — Meta will keep blocking ' +
      'marketing sends to them. Utility messages may still be allowed.',
    retryable: false,
  },
  131049: {
    // Meta's own text — "In order to maintain a healthy ecosystem
    // engagement, the message failed to be delivered" — is the single
    // most opaque sentence in this whole table, and it is one of the most
    // common failures on marketing broadcasts. What it actually describes
    // is Meta's per-USER marketing frequency cap: WhatsApp limits how
    // many marketing messages one person receives in a period, counting
    // every business that messages them, not just yours. Hitting it says
    // nothing bad about your template or your account.
    message:
      'This person has received too many marketing messages recently, so ' +
      'WhatsApp did not deliver this one. The limit counts marketing messages ' +
      'from every business, not just yours, so nothing is wrong with your ' +
      'template or your account. Wait a day or two before including them ' +
      'again — or reach them with a utility template, which this limit does ' +
      'not apply to.',
    retryable: false,
  },
  130403: {
    message:
      'Your business has blocked this WhatsApp user, so messages cannot reach ' +
      'them. Unblock them in WhatsApp to resume messaging.',
    retryable: false,
  },
  131021: {
    message:
      'The sender and the recipient are the same number. Send to a different ' +
      'number than the one connected to this workspace.',
    retryable: false,
  },

  // ── Template ──────────────────────────────────────────────────
  132000: {
    message:
      'The number of values supplied does not match the number of variables ' +
      'in the template. Reopen the template and fill every placeholder.',
    retryable: false,
  },
  132001: {
    message:
      'Meta has no approved version of this template in the language being ' +
      'sent. Check the template is approved, and that its name and language ' +
      'match. Running "Sync from Meta" in Settings usually resolves a ' +
      'mismatch.',
    retryable: false,
  },
  132005: {
    message:
      'The finished message is too long once the variable values are filled ' +
      'in. Shorten the values, or shorten the template body.',
    retryable: false,
  },
  132007: {
    message:
      'Meta rejected the content as a policy violation. The template needs ' +
      'editing and resubmitting for review.',
    retryable: false,
  },
  132012: {
    message:
      'One or more variable values are formatted incorrectly for what the ' +
      'template expects. Check currency, date and number formats.',
    retryable: false,
  },
  132015: {
    message:
      'Meta has paused this template because of low quality ratings, so it ' +
      'cannot be sent right now. Improve the template or use a different one.',
    retryable: false,
  },
  132016: {
    message:
      'Meta has permanently disabled this template after pausing it too many ' +
      'times for low quality. Create a new template with different content.',
    retryable: false,
  },
  131051: {
    message: 'This message type is not supported by WhatsApp.',
    retryable: false,
  },

  // ── Transient ─────────────────────────────────────────────────
  2: {
    message:
      'WhatsApp is temporarily overloaded or down. Nothing is wrong with your ' +
      'setup — try again in a few minutes.',
    retryable: true,
  },
  131016: {
    message:
      'A WhatsApp service is temporarily unavailable. Try again in a few ' +
      'minutes.',
    retryable: true,
  },
  133004: {
    message: 'WhatsApp servers are temporarily unavailable. Try again shortly.',
    retryable: true,
  },
  131000: {
    message:
      'WhatsApp reported an unknown error while sending. Try again; if it ' +
      'keeps happening the WhatsApp Business account may need support.',
    retryable: true,
  },
  33: {
    message:
      'Meta reports this business phone number has been deleted. Reconnect ' +
      'WhatsApp in Settings.',
    retryable: false,
  },
};

/**
 * Pull a Meta error code out of a raw message and explain it.
 *
 * Codes arrive in several shapes depending on which layer formatted the
 * text — `(#131042)`, `code: 131042`, or bare in a sentence — so the code
 * is matched as a standalone number rather than by a single fixed pattern.
 *
 * Returns null when no KNOWN code is present. Callers must then fall back
 * to Meta's own wording; inventing an explanation for an unrecognised code
 * is worse than passing through text the operator can search for.
 */
export function explainMetaSendError(
  raw: string | null | undefined
): MetaSendErrorExplanation | null {
  if (!raw) return null;

  // Longest-first so a 6-digit code is never shadowed by a 1-2 digit one
  // that happens to appear elsewhere in the string (a timestamp, a count).
  const candidates = Object.keys(EXPLANATIONS)
    .map(Number)
    .sort((a, b) => String(b).length - String(a).length);

  for (const code of candidates) {
    // Standalone number: not part of a longer digit run.
    const pattern = new RegExp(`(?<!\\d)${code}(?!\\d)`);
    if (pattern.test(raw)) {
      const entry = EXPLANATIONS[code];
      return { code, message: entry.message, retryable: entry.retryable };
    }
  }

  return null;
}

/**
 * Build the sentence shown to the operator when a send fails.
 *
 * Handles both halves of the problem:
 *   * a JSON `error` from our API, which may carry a Meta code
 *   * NO usable body at all, which is what happens when a proxy replaces
 *     a 502 with its own page — the case that produced "HTTP 502"
 */
export function describeSendFailure(args: {
  /** HTTP status of the failed response. */
  status: number;
  /** The `error` field from the JSON body, if one survived. */
  error?: string | null;
}): string {
  const { status, error } = args;

  // META'S WORDING COMES FIRST, ALWAYS.
  //
  // An earlier version returned our own explanation INSTEAD of Meta's text
  // whenever it recognised a code. That was wrong: it replaced the
  // authoritative message with a paraphrase, so the operator could not
  // quote what Meta actually said — and if our mapping were ever stale or
  // mismatched, they would be reading a confident sentence about the wrong
  // problem.
  //
  // Meta's sentence is therefore shown verbatim, and our guidance is
  // APPENDED as a separate hint. The operator sees the source of truth,
  // plus the next step, and can tell which is which.
  const metaText = error?.replace(/^Meta API error:\s*/i, '').trim();

  if (metaText) {
    const explained = explainMetaSendError(metaText);
    // Only append when the hint adds something beyond restating Meta.
    return explained
      ? `${metaText}\n\nWhat to do: ${explained.message}`
      : metaText;
  }

  // No body survived. Explain the status honestly instead of printing it.
  switch (status) {
    case 401:
      return 'Your session has expired. Sign in again and retry.';
    case 403:
      return 'This workspace is not allowed to send right now. Check your subscription and permissions.';
    case 404:
      return 'The conversation or contact could not be found. Refresh the page and try again.';
    case 429:
      return 'Too many messages too quickly. Wait a moment, then try again.';
    case 502:
    case 503:
    case 504:
      return (
        'The server could not complete the send. This is usually WhatsApp ' +
        'rejecting the message or the server restarting — not a problem with ' +
        'the message itself. Try again in a moment; if it persists, check ' +
        'Settings for a payment method and phone number registration.'
      );
    default:
      return `The send failed (HTTP ${status}). Check the browser console for details.`;
  }
}
