import { describe, it, expect } from 'vitest'
import {
  expiresInToTimestamp,
  tokenExpiryStatus,
  TOKEN_EXPIRY_WARNING_DAYS,
  TOKEN_EXPIRY_URGENT_DAYS,
} from './token-expiry'

const NOW = new Date('2026-08-14T12:00:00.000Z')

function inDays(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString()
}

describe('expiresInToTimestamp', () => {
  it('converts a 60-day expires_in into an absolute timestamp', () => {
    const sixtyDays = 60 * 24 * 60 * 60
    expect(expiresInToTimestamp(sixtyDays, NOW)).toBe('2026-10-13T12:00:00.000Z')
  })

  it('returns null for null and undefined', () => {
    expect(expiresInToTimestamp(null, NOW)).toBeNull()
    expect(expiresInToTimestamp(undefined, NOW)).toBeNull()
  })

  /**
   * Meta uses `expires_in: 0` for some non-expiring tokens. Storing now()
   * would report a permanent token as already dead and push the operator
   * into a pointless reconnect.
   */
  it('treats zero as unknown rather than immediate expiry', () => {
    expect(expiresInToTimestamp(0, NOW)).toBeNull()
  })

  it('rejects negative and non-finite values', () => {
    expect(expiresInToTimestamp(-1, NOW)).toBeNull()
    expect(expiresInToTimestamp(Number.NaN, NOW)).toBeNull()
    expect(expiresInToTimestamp(Number.POSITIVE_INFINITY, NOW)).toBeNull()
  })
})

describe('tokenExpiryStatus', () => {
  /**
   * The single most important case. Rows predating migration 072, non-expiring
   * tokens, and manually pasted system user tokens all have no expiry. If null
   * were read as expired, every healthy existing connection would show an
   * outage banner.
   */
  it('reports unknown for a missing expiry and demands no action', () => {
    for (const value of [null, undefined, '']) {
      const s = tokenExpiryStatus(value, NOW)
      expect(s.level).toBe('unknown')
      expect(s.daysRemaining).toBeNull()
      expect(s.message).toBeNull()
      expect(s.actionRequired).toBe(false)
    }
  })

  it('reports unknown for a malformed timestamp instead of throwing', () => {
    const s = tokenExpiryStatus('not-a-date', NOW)
    expect(s.level).toBe('unknown')
    expect(s.actionRequired).toBe(false)
  })

  it('is healthy well before the warning window', () => {
    const s = tokenExpiryStatus(inDays(45), NOW)
    expect(s.level).toBe('healthy')
    expect(s.daysRemaining).toBe(45)
    expect(s.message).toBeNull()
    expect(s.actionRequired).toBe(false)
  })

  it('warns on the warning boundary', () => {
    const s = tokenExpiryStatus(inDays(TOKEN_EXPIRY_WARNING_DAYS), NOW)
    expect(s.level).toBe('warning')
    expect(s.message).toContain('14 days')
    // A warning is advance notice, not an outage — it must not scream yet.
    expect(s.actionRequired).toBe(false)
  })

  it('stays healthy just outside the warning boundary', () => {
    const s = tokenExpiryStatus(inDays(TOKEN_EXPIRY_WARNING_DAYS + 1), NOW)
    expect(s.level).toBe('healthy')
  })

  it('escalates to urgent on the urgent boundary', () => {
    const s = tokenExpiryStatus(inDays(TOKEN_EXPIRY_URGENT_DAYS), NOW)
    expect(s.level).toBe('urgent')
    expect(s.actionRequired).toBe(true)
  })

  it('reports expired once the deadline has passed', () => {
    const s = tokenExpiryStatus(inDays(-1), NOW)
    expect(s.level).toBe('expired')
    expect(s.daysRemaining).toBeLessThan(0)
    expect(s.actionRequired).toBe(true)
    expect(s.message).toContain('expired')
  })

  /**
   * Floor, never round. A token with 23 hours left has 0 whole days, and
   * reporting "1 day" would overstate the remaining safety margin.
   */
  it('floors partial days instead of rounding up', () => {
    const almost = new Date(NOW.getTime() + 23 * 60 * 60 * 1000).toISOString()
    const s = tokenExpiryStatus(almost, NOW)
    expect(s.daysRemaining).toBe(0)
    expect(s.level).toBe('urgent')
    expect(s.message).toContain('less than a day')
  })

  it('says "1 day" rather than "1 days"', () => {
    const s = tokenExpiryStatus(inDays(1), NOW)
    expect(s.message).toContain('1 day.')
    expect(s.message).not.toContain('1 days')
  })

  it('round-trips a freshly exchanged 60-day token as healthy', () => {
    const stored = expiresInToTimestamp(60 * 24 * 60 * 60, NOW)
    const s = tokenExpiryStatus(stored, NOW)
    expect(s.level).toBe('healthy')
    expect(s.daysRemaining).toBe(60)
  })
})
