/**
 * Business-token expiry reporting.
 *
 * ── Why this is only a WARNING, not a refresh ─────────────────────
 *
 * Embedded Signup returns a customer-scoped business token. Its lifetime
 * comes from the Facebook Login for Business configuration that launched
 * the flow; the configuration in use here issues 60-day tokens.
 *
 * There is deliberately no `refreshToken()` in this module. Meta publishes
 * no refresh grant for business tokens — `fb_exchange_token` extends USER
 * tokens, not these, and the authorization code is single-use and consumed
 * at connect time. Renewal means the customer re-runs Embedded Signup.
 *
 * Writing a speculative refresh call would be worse than writing nothing:
 * it would appear to work, fail quietly against a real customer's token,
 * and hide the one thing the operator can actually act on — the deadline.
 * So this module reports, and reconnection stays a human decision.
 *
 * ── Why NULL is not "expired" ────────────────────────────────────
 *
 * `token_expires_at` is null for rows predating migration 072, for
 * non-expiring tokens, and for the legacy manual-entry form where an
 * operator pastes their own system user token. Treating null as expired
 * would fire an alarm on every healthy pre-existing connection, so
 * `unknown` is its own state and callers must not coerce it to expired.
 */

/** Warn once a token is inside this window. */
export const TOKEN_EXPIRY_WARNING_DAYS = 14

/** Escalate to urgent inside this window. */
export const TOKEN_EXPIRY_URGENT_DAYS = 3

export type TokenExpiryLevel = 'unknown' | 'healthy' | 'warning' | 'urgent' | 'expired'

export interface TokenExpiryStatus {
  level: TokenExpiryLevel
  /**
   * Whole days until expiry. Negative once expired, null when unknown.
   * Floored, so a token with 23 hours left reports 0 rather than 1 — a
   * warning must never round up into sounding safer than it is.
   */
  daysRemaining: number | null
  expiresAt: string | null
  /** Operator-facing sentence, or null when there is nothing to say. */
  message: string | null
  /** True when the operator needs to reconnect to restore service. */
  actionRequired: boolean
}

const MS_PER_DAY = 86_400_000

/**
 * Convert Meta's `expires_in` (seconds from now) into an absolute ISO
 * timestamp for storage.
 *
 * Returns null for null/undefined, non-finite, and non-positive values.
 * Meta sends `expires_in: 0` to mean "does not expire" on some token
 * types; storing `now()` for that would report an instant expiry on a
 * token that is in fact permanent, so 0 is treated as unknown.
 */
export function expiresInToTimestamp(
  expiresIn: number | null | undefined,
  now: Date = new Date(),
): string | null {
  if (expiresIn === null || expiresIn === undefined) return null
  if (!Number.isFinite(expiresIn)) return null
  if (expiresIn <= 0) return null
  return new Date(now.getTime() + expiresIn * 1000).toISOString()
}

/**
 * Describe a stored expiry.
 *
 * @param expiresAt ISO timestamp from `whatsapp_config.token_expires_at`.
 */
export function tokenExpiryStatus(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): TokenExpiryStatus {
  if (!expiresAt) {
    return {
      level: 'unknown',
      daysRemaining: null,
      expiresAt: null,
      message: null,
      actionRequired: false,
    }
  }

  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) {
    // A malformed value is reported as unknown rather than thrown. This runs
    // on the settings page; a bad column value should not blank the screen.
    return {
      level: 'unknown',
      daysRemaining: null,
      expiresAt: null,
      message: null,
      actionRequired: false,
    }
  }

  const iso = expiry.toISOString()
  const diffMs = expiry.getTime() - now.getTime()
  const daysRemaining = Math.floor(diffMs / MS_PER_DAY)

  if (diffMs <= 0) {
    return {
      level: 'expired',
      daysRemaining,
      expiresAt: iso,
      message:
        'Your WhatsApp connection has expired. Messages cannot be sent or ' +
        'received until you reconnect your number.',
      actionRequired: true,
    }
  }

  if (daysRemaining <= TOKEN_EXPIRY_URGENT_DAYS) {
    return {
      level: 'urgent',
      daysRemaining,
      expiresAt: iso,
      message:
        `Your WhatsApp connection expires in ${describeDays(daysRemaining)}. ` +
        'Reconnect now to avoid an interruption.',
      actionRequired: true,
    }
  }

  if (daysRemaining <= TOKEN_EXPIRY_WARNING_DAYS) {
    return {
      level: 'warning',
      daysRemaining,
      expiresAt: iso,
      message:
        `Your WhatsApp connection expires in ${describeDays(daysRemaining)}. ` +
        'Reconnect before then to keep messaging running.',
      actionRequired: false,
    }
  }

  return {
    level: 'healthy',
    daysRemaining,
    expiresAt: iso,
    message: null,
    actionRequired: false,
  }
}

function describeDays(days: number): string {
  if (days <= 0) return 'less than a day'
  if (days === 1) return '1 day'
  return `${days} days`
}
