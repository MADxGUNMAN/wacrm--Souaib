import { describe, it, expect } from 'vitest'
import { resolveConnectionMode, COEXISTENCE_FEATURE_TYPE } from './connection-mode'

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
   * the Cloud API and never on the Business App, so it is not coexistence even
   * though the modal sends the same feature type today.
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
