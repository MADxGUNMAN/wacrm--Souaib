import { describe, it, expect } from 'vitest'
import { explainMetaSendError, describeSendFailure } from './meta-send-errors'

describe('explainMetaSendError', () => {
  /**
   * The code the operator actually asked about. They assumed HTTP 502 meant
   * "no payment method"; the real payment error is Meta 131042, and it must
   * name the fix rather than the symptom.
   */
  it('explains the payment error and names the fix', () => {
    const out = explainMetaSendError('Meta API error: (#131042) something')
    expect(out?.code).toBe(131042)
    expect(out?.message).toMatch(/payment method/i)
    expect(out?.message).toMatch(/Business Manager/i)
    expect(out?.retryable).toBe(false)
  })

  it('finds a code in several formats', () => {
    for (const raw of [
      '(#131047)',
      'code: 131047',
      'Meta rejected this: 131047 more than 24 hours',
    ]) {
      expect(explainMetaSendError(raw)?.code).toBe(131047)
    }
  })

  it('explains the 24-hour window in terms of what to do', () => {
    const out = explainMetaSendError('(#131047)')
    expect(out?.message).toMatch(/24 hours/i)
    expect(out?.message).toMatch(/template/i)
  })

  it('marks transient errors retryable and business errors not', () => {
    expect(explainMetaSendError('(#131016)')?.retryable).toBe(true)
    expect(explainMetaSendError('(#132001)')?.retryable).toBe(false)
  })

  /**
   * A short code must not be matched inside a longer number, or a message
   * mentioning 131042 could be explained as code 2 ("temporarily overloaded")
   * and send the operator hunting an outage that does not exist.
   */
  it('does not match a short code inside a longer number', () => {
    expect(explainMetaSendError('(#131042)')?.code).toBe(131042)
    expect(explainMetaSendError('request id 9913300412')).toBeNull()
  })

  it('returns null for an unknown code rather than inventing a cause', () => {
    expect(explainMetaSendError('Meta API error: (#999999) mystery')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(explainMetaSendError(null)).toBeNull()
    expect(explainMetaSendError(undefined)).toBeNull()
    expect(explainMetaSendError('')).toBeNull()
  })
})

describe('describeSendFailure', () => {
  /**
   * Meta's wording is authoritative and must be shown verbatim, with our
   * guidance appended rather than substituted. Replacing it would stop the
   * operator quoting what Meta actually said, and would confidently
   * describe the wrong problem if our mapping ever drifted.
   */
  it("shows Meta's wording verbatim and appends guidance", () => {
    const verbatim = 'There was an error related to your payment method. (#131042)'
    const msg = describeSendFailure({
      status: 502,
      error: `Meta API error: ${verbatim}`,
    })
    expect(msg).toContain(verbatim)
    expect(msg).toContain('What to do:')
    expect(msg).toMatch(/payment method/i)
  })

  it('strips our internal prefix from unrecognised Meta wording', () => {
    const msg = describeSendFailure({
      status: 502,
      error: 'Meta API error: something very specific happened',
    })
    expect(msg).toBe('something very specific happened')
  })

  it('adds no guidance when the code is unknown', () => {
    const msg = describeSendFailure({
      status: 502,
      error: 'Meta API error: (#999999) mystery failure',
    })
    expect(msg).toBe('(#999999) mystery failure')
    expect(msg).not.toContain('What to do:')
  })

  /**
   * THE REPORTED BUG. A proxy replacing a 502 body leaves no `error` at all,
   * which previously rendered as "Failed to send template: HTTP 502" — a
   * gateway status masquerading as a business problem.
   */
  it('explains a bodyless 502 instead of printing the status', () => {
    const msg = describeSendFailure({ status: 502 })
    expect(msg).not.toMatch(/^HTTP 502$/)
    expect(msg).toMatch(/try again/i)
    expect(msg).toMatch(/payment method|registration/i)
  })

  it('treats 503 and 504 the same way as 502', () => {
    for (const status of [503, 504]) {
      expect(describeSendFailure({ status })).toMatch(/try again/i)
    }
  })

  it('explains auth, permission, missing and rate-limit statuses', () => {
    expect(describeSendFailure({ status: 401 })).toMatch(/session has expired/i)
    expect(describeSendFailure({ status: 403 })).toMatch(/subscription|permission/i)
    expect(describeSendFailure({ status: 404 })).toMatch(/could not be found/i)
    expect(describeSendFailure({ status: 429 })).toMatch(/too many/i)
  })

  it('falls back to the status only when nothing else is known', () => {
    expect(describeSendFailure({ status: 418 })).toMatch(/HTTP 418/)
  })

  it('ignores a whitespace-only error body', () => {
    expect(describeSendFailure({ status: 502, error: '   ' })).toMatch(/try again/i)
  })
})
