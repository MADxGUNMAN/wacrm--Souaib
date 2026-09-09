import { describe, it, expect } from 'vitest'
import { MetaApiError } from './meta-api'

/**
 * These tests exist because the previous code did
 * `throw new Error(data.error.message)` and discarded everything else.
 * The discarded fields — code, subcode, error_data.details, error_user_msg
 * — are the ones that actually identify a failure, and losing them meant a
 * failed send could never be explained precisely.
 */
describe('MetaApiError', () => {
  it('is still an Error, so existing catch blocks keep working', () => {
    const e = new MetaApiError({ message: 'boom', httpStatus: 400 })
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('boom')
    expect(e.name).toBe('MetaApiError')
  })

  it('keeps every Meta field', () => {
    const e = new MetaApiError({
      message: 'generic wording',
      code: 131042,
      subcode: 2494055,
      details: 'the specific detail',
      userMessage: 'the operator sentence',
      userTitle: 'Payment issue',
      type: 'OAuthException',
      fbtraceId: 'ABC123',
      httpStatus: 400,
    })
    expect(e.code).toBe(131042)
    expect(e.subcode).toBe(2494055)
    expect(e.details).toBe('the specific detail')
    expect(e.userMessage).toBe('the operator sentence')
    expect(e.userTitle).toBe('Payment issue')
    expect(e.fbtraceId).toBe('ABC123')
    expect(e.httpStatus).toBe(400)
  })

  it('defaults every optional field to null rather than undefined', () => {
    const e = new MetaApiError({ message: 'x', httpStatus: 500 })
    expect(e.code).toBeNull()
    expect(e.subcode).toBeNull()
    expect(e.details).toBeNull()
    expect(e.userMessage).toBeNull()
    expect(e.fbtraceId).toBeNull()
  })

  describe('operatorText', () => {
    /**
     * error_user_msg is what Meta itself shows businesses in WhatsApp
     * Manager, so it outranks the generic `message`.
     */
    it('prefers error_user_msg over details and message', () => {
      const e = new MetaApiError({
        message: 'generic',
        details: 'detail',
        userMessage: 'the best sentence',
        code: 131042,
        httpStatus: 400,
      })
      expect(e.operatorText).toBe('the best sentence (Meta error 131042)')
    })

    it('falls back to error_data.details before the generic message', () => {
      const e = new MetaApiError({
        message: 'generic',
        details: 'the specific detail',
        code: 131053,
        httpStatus: 400,
      })
      expect(e.operatorText).toBe('the specific detail (Meta error 131053)')
    })

    it('uses message when nothing more specific exists', () => {
      const e = new MetaApiError({ message: 'only this', code: 5, httpStatus: 400 })
      expect(e.operatorText).toBe('only this (Meta error 5)')
    })

    it('omits the code suffix when Meta sent no code', () => {
      const e = new MetaApiError({ message: 'no code here', httpStatus: 500 })
      expect(e.operatorText).toBe('no code here')
    })

    /**
     * Whitespace-only values must not win the preference order, or the
     * operator gets a blank reason with a code bolted on.
     */
    it('ignores whitespace-only fields when choosing', () => {
      const e = new MetaApiError({
        message: 'real message',
        details: '   ',
        userMessage: '',
        httpStatus: 400,
      })
      expect(e.operatorText).toBe('real message')
    })

    /** Meta's wording must never be reworded — it is quoted, not summarised. */
    it('passes Meta wording through unedited', () => {
      const verbatim =
        'There was an error related to your payment method. Payment account is not attached.'
      const e = new MetaApiError({
        message: 'generic',
        userMessage: verbatim,
        code: 131042,
        httpStatus: 400,
      })
      expect(e.operatorText).toContain(verbatim)
    })
  })
})
