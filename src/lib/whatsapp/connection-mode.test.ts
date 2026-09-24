import { describe, it, expect } from 'vitest'
import {
  reconcileConnectionMode,
  resolveConnectionMode,
  COEXISTENCE_FEATURE_TYPE,
} from './connection-mode'

describe('resolveConnectionMode', () => {
  /**
   * THE REGRESSION. The operator picked the "already on WhatsApp Business app"
   * option in our modal, then inside Meta's flow selected an existing Cloud
   * API WABA instead. Meta returned a plain FINISH. The old OR-based logic
   * stamped this `coexistence`, which produced a false Coexistence badge, a
   * false "open the app every 13 days" warning, and a history sync that failed
   * with Meta #133010 after burning 2 of 3 one-shot attempts.
   */
  it('trusts a plain FINISH over the operator asking for coexistence', () => {
    expect(
      resolveConnectionMode({
        finishEvent: 'FINISH',
        requestedFeatureType: COEXISTENCE_FEATURE_TYPE,
      }),
    ).toBe('cloud_api')
  })

  it('trusts FINISH_ONLY_WABA over the operator intention', () => {
    expect(
      resolveConnectionMode({
        finishEvent: 'FINISH_ONLY_WABA',
        requestedFeatureType: COEXISTENCE_FEATURE_TYPE,
      }),
    ).toBe('cloud_api')
  })

  /**
   * Migration from Twilio/Wati moves an existing API number. That number is on
   * the Cloud API and never on the Business App, so it is not coexistence. The
   * modal no longer sends the Coexistence feature type for 'migrate' either,
   * but this stays covered because Meta's event has to win regardless of what
   * the client sent.
   */
  it('treats an OBO migration as cloud_api', () => {
    expect(
      resolveConnectionMode({
        finishEvent: 'FINISH_OBO_MIGRATION',
        requestedFeatureType: COEXISTENCE_FEATURE_TYPE,
      }),
    ).toBe('cloud_api')
  })

  it('detects coexistence from Meta\u2019s own event', () => {
    expect(
      resolveConnectionMode({
        finishEvent: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      }),
    ).toBe('coexistence')
  })

  it('detects coexistence from Meta even when no intention was sent', () => {
    expect(
      resolveConnectionMode({
        finishEvent: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
        requestedFeatureType: undefined,
      }),
    ).toBe('coexistence')
  })

  /**
   * The postMessage channel is lossy — a popup closed a moment early drops the
   * event. Falling back to intention is deliberate here, because the history
   * sync has a hard 24-hour window.
   */
  it('falls back to the operator intention when no event arrived', () => {
    for (const missing of [undefined, null, '']) {
      expect(
        resolveConnectionMode({
          finishEvent: missing,
          requestedFeatureType: COEXISTENCE_FEATURE_TYPE,
        }),
      ).toBe('coexistence')
    }
  })

  it('defaults to cloud_api when neither signal is present', () => {
    expect(resolveConnectionMode({})).toBe('cloud_api')
  })

  it('ignores a non-FINISH event and uses the intention instead', () => {
    // CANCEL is not an outcome, so it must not be read as "not coexistence".
    expect(
      resolveConnectionMode({
        finishEvent: 'CANCEL',
        requestedFeatureType: COEXISTENCE_FEATURE_TYPE,
      }),
    ).toBe('coexistence')
  })

  it('ignores non-string event values', () => {
    expect(
      resolveConnectionMode({
        finishEvent: { event: 'FINISH' },
        requestedFeatureType: COEXISTENCE_FEATURE_TYPE,
      }),
    ).toBe('coexistence')
  })

  it('does not treat an arbitrary requested type as coexistence', () => {
    expect(
      resolveConnectionMode({ requestedFeatureType: 'something_else' }),
    ).toBe('cloud_api')
  })
})

describe('reconcileConnectionMode', () => {
  /**
   * THE CASE THIS EXISTS FOR. `finish_event` never arrived, so the mode came
   * from the operator's pick in the modal — they chose "already on WhatsApp
   * Business app" but created a fresh Cloud API number inside Meta's flow.
   * Left uncorrected this shows a false Coexistence badge and fires the
   * one-shot history sync at an account that cannot serve it.
   */
  it('demotes a wrongly inferred coexistence when Meta says the number is not on the biz app', () => {
    const result = reconcileConnectionMode({
      inferred: 'coexistence',
      isOnBizApp: false,
    })
    expect(result.mode).toBe('cloud_api')
    expect(result.corrected).toBe(true)
    expect(result.reason).toContain('is_on_biz_app=false')
  })

  it('promotes to coexistence when Meta says the number IS on the biz app', () => {
    const result = reconcileConnectionMode({
      inferred: 'cloud_api',
      isOnBizApp: true,
    })
    expect(result.mode).toBe('coexistence')
    expect(result.corrected).toBe(true)
  })

  it('reports agreement without flagging a correction', () => {
    const result = reconcileConnectionMode({
      inferred: 'coexistence',
      isOnBizApp: true,
    })
    expect(result.mode).toBe('coexistence')
    expect(result.corrected).toBe(false)
    expect(result.reason).toContain('confirmed')
  })

  /**
   * Absence must never read as `false`. Meta omits `is_on_biz_app` on some
   * responses, and demoting a real coexistence connection because a field was
   * left out would recreate the bug this function prevents — from the other
   * direction, and silently.
   */
  it('leaves the inferred mode alone when Meta did not report the field', () => {
    for (const absent of [undefined, null, '', 'true', 0, 1, {}]) {
      expect(
        reconcileConnectionMode({ inferred: 'coexistence', isOnBizApp: absent }),
      ).toEqual({ mode: 'coexistence', corrected: false, reason: null })
      expect(
        reconcileConnectionMode({ inferred: 'cloud_api', isOnBizApp: absent }),
      ).toEqual({ mode: 'cloud_api', corrected: false, reason: null })
    }
  })

  /**
   * Guards the live values this was verified against. `platform_type` is
   * CLOUD_API for BOTH a coexistence number and a plain one, so it is not an
   * input here at all — if someone later adds it as one, these cases are the
   * record of why that is wrong.
   */
  it('matches the three live numbers it was verified against', () => {
    // +91 72020 72233 and +971 56 558 0904 — coexistence, is_on_biz_app true
    expect(
      reconcileConnectionMode({ inferred: 'coexistence', isOnBizApp: true })
        .mode,
    ).toBe('coexistence')
    // +91 74330 38455 — plain Cloud API, is_on_biz_app false
    expect(
      reconcileConnectionMode({ inferred: 'cloud_api', isOnBizApp: false }).mode,
    ).toBe('cloud_api')
  })
})
