/**
 * Decide whether an Embedded Signup completion produced a Coexistence
 * connection or a plain Cloud API one.
 *
 * Extracted from the embedded-signup route so the precedence rule can be
 * tested directly. It was a bare inline ternary before, and it was wrong in a
 * way no test could catch.
 *
 * ── The rule ──────────────────────────────────────────────────────
 *
 * `finish_event` is Meta's report of what ACTUALLY happened and wins outright
 * whenever it is present. `requestedFeatureType` is only what the operator
 * picked in our modal beforehand — an intention they can abandon once inside
 * Meta's own UI — so it is consulted ONLY when Meta reported nothing.
 *
 * ── Why this is not an OR ─────────────────────────────────────────
 *
 * The original implementation was:
 *
 *   finishEvent includes WHATSAPP_BUSINESS_APP_ONBOARDING
 *     || requestedFeatureType === 'whatsapp_business_app_onboarding'
 *
 * which let the intention override the outcome. Real failure: the operator
 * chose "a number currently active on WhatsApp Business app", then inside
 * Meta's flow selected an existing Cloud API WhatsApp Business Account
 * instead of "Connect a WhatsApp Business app". Meta returned a plain
 * `FINISH`; the OR stamped the connection `coexistence` anyway.
 *
 * That produced a Coexistence badge and a "reopen the app every 13 days or
 * Meta drops the connection" warning on a number with no phone app attached,
 * and fired the one-shot history/contact sync at an account that cannot serve
 * it — failing with Meta #133010 "Account not registered" and consuming 2 of
 * its 3 attempts.
 */

export type ConnectionMode = 'cloud_api' | 'coexistence'

/** The Meta feature flag that selects the Business App onboarding variation. */
export const COEXISTENCE_FEATURE_TYPE = 'whatsapp_business_app_onboarding'

/**
 * Every completion event Meta emits starts with FINISH. Presence of one means
 * Meta reached a verdict, so it must not be second-guessed.
 *
 *   FINISH                                  standard Cloud API
 *   FINISH_ONLY_WABA                        WABA created, no phone number yet
 *   FINISH_OBO_MIGRATION                    migrated from another provider
 *   FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING coexistence
 */
const FINISH_PREFIX = 'FINISH'
const COEXISTENCE_EVENT_MARKER = 'WHATSAPP_BUSINESS_APP_ONBOARDING'

export function resolveConnectionMode(args: {
  /** Meta's `finish_event` from the WA_EMBEDDED_SIGNUP postMessage. */
  finishEvent?: unknown
  /** What the operator selected in the connect modal. */
  requestedFeatureType?: unknown
}): ConnectionMode {
  const { finishEvent, requestedFeatureType } = args

  const metaReportedOutcome =
    typeof finishEvent === 'string' && finishEvent.startsWith(FINISH_PREFIX)

  if (metaReportedOutcome) {
    return (finishEvent as string).includes(COEXISTENCE_EVENT_MARKER)
      ? 'coexistence'
      : 'cloud_api'
  }

  // No outcome reached us — the postMessage channel was lost (popup closed
  // early, message blocked). Fall back to intention. Guessing coexistence
  // here is deliberate: the history sync has a hard 24-hour window, so a
  // missed echo costs more than a badge that the first real webhook echo
  // will correct anyway.
  return requestedFeatureType === COEXISTENCE_FEATURE_TYPE
    ? 'coexistence'
    : 'cloud_api'
}

// ============================================================
// Verifying the guess against Meta
// ============================================================

export interface ReconciledConnectionMode {
  mode: ConnectionMode
  /** True when Meta disagreed with the inferred mode and overrode it. */
  corrected: boolean
  /** Loggable explanation. Null when nothing was learned. */
  reason: string | null
}

/**
 * Check an inferred connection mode against what Meta reports about the number.
 *
 * ── Why this is needed at all ─────────────────────────────────────
 *
 * `resolveConnectionMode` above works from `finish_event`, which is delivered
 * over `postMessage`. That channel is lossy by nature: close the popup a beat
 * early, run an extension that blocks cross-origin messages, and no event
 * arrives. In that case the mode falls back to the operator's INTENTION, and an
 * intention can be wrong — they may have picked "already on WhatsApp Business
 * app" and then created a brand new number inside Meta's flow.
 *
 * A wrong `coexistence` is expensive rather than cosmetic. It shows a
 * Coexistence badge and the "reopen the app every 13 days" warning for a number
 * with no phone attached, and it fires the one-shot history/contact sync at an
 * account that cannot serve it — which fails with Meta #133010 and burns 2 of
 * its 3 lifetime attempts.
 *
 * ── Why `is_on_biz_app` and NOT `platform_type` ───────────────────
 *
 * `platform_type` is the obvious-looking field and it is the wrong one. It
 * returns `CLOUD_API` for a coexistence number and `CLOUD_API` for an ordinary
 * Cloud API number — checked against three live numbers on this app:
 *
 *   +91 72020 72233   coexistence   platform_type CLOUD_API   is_on_biz_app true
 *   +971 56 558 0904  coexistence   platform_type CLOUD_API   is_on_biz_app true
 *   +91 74330 38455   cloud_api     platform_type CLOUD_API   is_on_biz_app false
 *
 * Reconciling on `platform_type` would therefore have demoted every correct
 * coexistence row to `cloud_api`, i.e. it would have introduced the exact bug
 * it was meant to catch. `is_on_biz_app` separates them cleanly.
 *
 * ── Absence is not `false` ────────────────────────────────────────
 *
 * Meta does not always include `is_on_biz_app`. A missing field means "not
 * reported", and reading that as `false` would silently demote a real
 * coexistence connection on the strength of a field Meta chose to omit. So
 * anything that is not a literal boolean leaves the inferred mode untouched.
 */
export function reconcileConnectionMode(args: {
  /** What `resolveConnectionMode` decided. */
  inferred: ConnectionMode
  /** `is_on_biz_app` from the phone number, whatever shape it arrived in. */
  isOnBizApp?: unknown
}): ReconciledConnectionMode {
  const { inferred, isOnBizApp } = args

  if (typeof isOnBizApp !== 'boolean') {
    return { mode: inferred, corrected: false, reason: null }
  }

  const mode: ConnectionMode = isOnBizApp ? 'coexistence' : 'cloud_api'

  if (mode === inferred) {
    return {
      mode,
      corrected: false,
      reason: `Meta confirmed ${mode} (is_on_biz_app=${isOnBizApp})`,
    }
  }

  return {
    mode,
    corrected: true,
    reason: `inferred ${inferred} but Meta reports is_on_biz_app=${isOnBizApp}, so this is ${mode}`,
  }
}
