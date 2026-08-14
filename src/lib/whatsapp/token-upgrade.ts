import { createHmac } from 'crypto'
import { encrypt } from '@/lib/whatsapp/encryption'
import { META_API_BASE } from '@/lib/whatsapp/graph-version'

/**
 * Trade a 60-day business token for a non-expiring one.
 *
 * ── The problem this removes ──────────────────────────────────────
 *
 * Embedded Signup issues a business integration system user access token
 * (SUAT) whose lifetime is fixed by the Facebook Login for Business
 * configuration that launched the flow. The configuration in use here is
 * named "WhatsApp embedded sign-up configuration with 60-day expiry
 * token", so every connection made through it dies about 60 days later —
 * silently, mid-conversation, with no error surfaced anywhere.
 *
 * ── Why this is possible at all ───────────────────────────────────
 *
 * Meta documents an endpoint for managing these tokens:
 *
 *   POST /{client-business-id}/system_user_access_tokens
 *
 * It generates a NEW system user token from an existing one. Its
 * `set_token_expires_in_60_days` parameter is described as: "When you
 * generate a new token, set to true so that the token expires in 60 days."
 *
 * The flag is opt-IN. Omit it and the generated token follows the documented
 * default for system user tokens, which Meta states plainly: "Defaults to
 * never expire for the common offline server-to-server communication."
 *
 * That is the whole trick. We are not refreshing or extending the original
 * token — no such grant exists for business tokens. We are minting a fresh
 * one, from the authority of the old one, without asking for an expiry.
 *
 * ── Why it runs at connect time ───────────────────────────────────
 *
 * The call needs a working token, so it has to happen while the current one
 * is still valid. Doing it during onboarding means the stored credential is
 * permanent from the very first minute, and there is never a window where a
 * background job has to race a deadline. If the upgrade fails, the original
 * 60-day token keeps working and `token_expires_at` still drives the warning
 * UI, so the failure costs visibility rather than service.
 *
 * ── Requirements ──────────────────────────────────────────────────
 *
 *   * `business_management` on the incoming token (Meta lists this as
 *     required for the endpoint; the ES config already requests it)
 *   * `appsecret_proof` — mandatory here, unlike most Graph calls
 *   * the client business ID, read from /me?fields=client_business_id
 */

export const TOKEN_UPGRADE_UNSUPPORTED = 'unsupported' as const

export interface TokenUpgradeOutcome {
  /** True when a non-expiring token was generated AND stored. */
  upgraded: boolean
  /** Operator-facing explanation. Never contains token material. */
  message: string
  /**
   * Set when Meta indicated the account or app cannot use this endpoint, as
   * opposed to a transient failure. Callers should not retry on this.
   */
  reason?: typeof TOKEN_UPGRADE_UNSUPPORTED
}

function appsecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex')
}

interface MetaError {
  message?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

function describeMetaError(err: MetaError | undefined): string {
  if (!err) return 'Unknown Meta error'
  const bits = [err.message ?? 'Unknown Meta error']
  if (err.code !== undefined) bits.push(`code ${err.code}`)
  if (err.error_subcode !== undefined) bits.push(`subcode ${err.error_subcode}`)
  return bits.join(', ')
}

/**
 * Resolve the client business ID that a business token belongs to.
 *
 * Returned separately from the upgrade so a failure here is distinguishable
 * from a failure to mint the token — they have different causes and the
 * combined error would be actively misleading.
 */
async function fetchClientBusinessId(
  accessToken: string,
  appSecret: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const proof = appsecretProof(accessToken, appSecret)
  const url =
    `${META_API_BASE}/me?fields=client_business_id` +
    `&appsecret_proof=${proof}`

  let payload: Record<string, unknown>
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    payload = (await res.json()) as Record<string, unknown>
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Network error calling Meta',
    }
  }

  if (payload.error) {
    return { ok: false, message: describeMetaError(payload.error as MetaError) }
  }

  const id = payload.client_business_id
  if (typeof id !== 'string' || !id) {
    // A User-access-token configuration has no client business, so this field
    // is simply absent. Say so, because the fix is to change the login
    // configuration rather than to retry anything here.
    return {
      ok: false,
      message:
        'Meta did not return a client_business_id. This usually means the ' +
        'Embedded Signup login configuration issues a User access token ' +
        'rather than a System-user access token, in which case non-expiring ' +
        'tokens are not available.',
    }
  }

  return { ok: true, id }
}

/**
 * Generate a non-expiring token and persist it over the existing one.
 *
 * Non-fatal by contract: every failure path returns `upgraded: false` with a
 * reason instead of throwing, because a connection with a 60-day token is
 * still a working connection and must not be reported to the customer as a
 * failed setup.
 */
export async function upgradeToNonExpiringToken(args: {
  db: {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        // PromiseLike, not Promise: Supabase's PostgrestFilterBuilder is a
        // thenable that lacks `catch`/`finally`, so requiring a full Promise
        // here rejects the real client.
        eq: (column: string, value: unknown) => PromiseLike<{ error: unknown }>
      }
    }
  }
  configId: string
  accessToken: string
  appSecret: string
}): Promise<TokenUpgradeOutcome> {
  const { db, configId, accessToken, appSecret } = args

  if (!appSecret) {
    return {
      upgraded: false,
      message:
        'META_APP_SECRET is not set, so the appsecret_proof required by this ' +
        'endpoint cannot be computed.',
    }
  }

  const business = await fetchClientBusinessId(accessToken, appSecret)
  if (!business.ok) {
    return { upgraded: false, message: business.message }
  }

  const proof = appsecretProof(accessToken, appSecret)
  // `set_token_expires_in_60_days` is deliberately OMITTED, not set to false.
  // Omission is what selects the documented never-expire default; sending an
  // explicit false would be relying on Meta's coercion of the flag instead of
  // on the documented behaviour.
  const url =
    `${META_API_BASE}/${business.id}/system_user_access_tokens` +
    `?appsecret_proof=${proof}`

  let payload: Record<string, unknown>
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    payload = (await res.json()) as Record<string, unknown>
  } catch (err) {
    return {
      upgraded: false,
      message: err instanceof Error ? err.message : 'Network error calling Meta',
    }
  }

  if (payload.error) {
    const err = payload.error as MetaError
    // 3 = unsupported operation, 200/10 = permission refused. None of these
    // become true by trying again, so they are marked non-retryable to stop a
    // caller burning attempts on a configuration problem.
    const unsupported = err.code === 3 || err.code === 200 || err.code === 10
    return {
      upgraded: false,
      message: describeMetaError(err),
      ...(unsupported ? { reason: TOKEN_UPGRADE_UNSUPPORTED } : {}),
    }
  }

  const newToken = payload.access_token
  if (typeof newToken !== 'string' || !newToken) {
    return {
      upgraded: false,
      message: 'Meta accepted the request but returned no access_token.',
    }
  }

  // Only now overwrite the stored credential. Encrypting first means a
  // failure in encrypt() cannot leave a plaintext token in the database.
  let encrypted: string
  try {
    encrypted = encrypt(newToken)
  } catch (err) {
    return {
      upgraded: false,
      message: `Failed to encrypt the new token: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    }
  }

  const { error } = await db
    .from('whatsapp_config')
    .update({
      access_token: encrypted,
      // Clearing this is the point of the whole exercise: null means "no
      // known expiry", which is exactly what the warning UI must show for a
      // permanent token.
      token_expires_at: null,
    })
    .eq('id', configId)

  if (error) {
    // The new token works but was not saved, so the row still holds the old
    // one. Reported as not upgraded, which is the truthful state of the DB.
    const message = (error as { message?: string })?.message ?? 'unknown error'
    return {
      upgraded: false,
      message: `Generated a non-expiring token but failed to save it: ${message}`,
    }
  }

  return {
    upgraded: true,
    message: 'Upgraded to a non-expiring access token.',
  }
}
