import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { upgradeToNonExpiringToken, TOKEN_UPGRADE_UNSUPPORTED } from './token-upgrade'

vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: (v: string) => `enc(${v})`,
}))

const APP_SECRET = 'test-app-secret'
const OLD_TOKEN = 'OLD_BUSINESS_TOKEN'
const NEW_TOKEN = 'NEW_PERMANENT_TOKEN'
const CONFIG_ID = 'cfg-1'
const CLIENT_BUSINESS_ID = '999888777'

/** Capture what was written to the DB so assertions can inspect it. */
function makeDb() {
  const updates: Record<string, unknown>[] = []
  const db = {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updates.push(values)
        return {
          eq: async () => ({ error: null }),
        }
      },
    }),
  }
  return { db, updates }
}

function failingDb(message: string) {
  return {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: { message } }),
      }),
    }),
  }
}

function jsonResponse(body: unknown) {
  return { json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('upgradeToNonExpiringToken', () => {
  it('generates a non-expiring token and clears token_expires_at', async () => {
    const { db, updates } = makeDb()
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID, id: 'x' })
        }
        return jsonResponse({ access_token: NEW_TOKEN })
      }),
    )

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.upgraded).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].access_token).toBe(`enc(${NEW_TOKEN})`)
    // The entire purpose: a permanent token must report "no known expiry".
    expect(updates[0].token_expires_at).toBeNull()
    expect(calls[1]).toContain(`/${CLIENT_BUSINESS_ID}/system_user_access_tokens`)
  })

  /**
   * The flag is opt-in: sending it at all would request a 60-day token, which
   * is the exact thing being removed. Omission selects Meta's documented
   * never-expire default.
   */
  it('never sends set_token_expires_in_60_days', async () => {
    const { db } = makeDb()
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
        }
        return jsonResponse({ access_token: NEW_TOKEN })
      }),
    )

    await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    for (const url of calls) {
      expect(url).not.toContain('set_token_expires_in_60_days')
    }
  })

  it('sends a correct appsecret_proof on both calls', async () => {
    const { db } = makeDb()
    const expected = createHmac('sha256', APP_SECRET).update(OLD_TOKEN).digest('hex')
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
        }
        return jsonResponse({ access_token: NEW_TOKEN })
      }),
    )

    await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(calls).toHaveLength(2)
    for (const url of calls) {
      expect(url).toContain(`appsecret_proof=${expected}`)
    }
  })

  it('refuses to run without an app secret', async () => {
    const { db, updates } = makeDb()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: '',
    })

    expect(out.upgraded).toBe(false)
    expect(out.message).toContain('META_APP_SECRET')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  /**
   * A User-access-token configuration has no client business. The message must
   * point at the login configuration, since no amount of retrying fixes it.
   */
  it('explains a missing client_business_id in terms of the login config', async () => {
    const { db } = makeDb()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'x' })))

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.upgraded).toBe(false)
    expect(out.message).toContain('login configuration')
  })

  it('marks permission and unsupported errors as non-retryable', async () => {
    for (const code of [3, 200, 10]) {
      const { db } = makeDb()
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('client_business_id')) {
            return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
          }
          return jsonResponse({ error: { message: 'nope', code } })
        }),
      )

      const out = await upgradeToNonExpiringToken({
        db,
        configId: CONFIG_ID,
        accessToken: OLD_TOKEN,
        appSecret: APP_SECRET,
      })

      expect(out.upgraded).toBe(false)
      expect(out.reason).toBe(TOKEN_UPGRADE_UNSUPPORTED)
    }
  })

  it('leaves a transient error retryable', async () => {
    const { db } = makeDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
        }
        return jsonResponse({ error: { message: 'try later', code: 1 } })
      }),
    )

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.upgraded).toBe(false)
    expect(out.reason).toBeUndefined()
  })

  it('does not overwrite the stored token when Meta returns none', async () => {
    const { db, updates } = makeDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
        }
        return jsonResponse({ ok: true })
      }),
    )

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.upgraded).toBe(false)
    expect(updates).toHaveLength(0)
  })

  /**
   * If the write fails the row still holds the old 60-day token, so reporting
   * success would leave the warning UI silent on a token that really does expire.
   */
  it('reports not-upgraded when the database write fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
        }
        return jsonResponse({ access_token: NEW_TOKEN })
      }),
    )

    const out = await upgradeToNonExpiringToken({
      db: failingDb('permission denied'),
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.upgraded).toBe(false)
    expect(out.message).toContain('failed to save')
  })

  it('never leaks token material into the outcome message', async () => {
    const { db } = makeDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('client_business_id')) {
          return jsonResponse({ client_business_id: CLIENT_BUSINESS_ID })
        }
        return jsonResponse({ access_token: NEW_TOKEN })
      }),
    )

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.message).not.toContain(NEW_TOKEN)
    expect(out.message).not.toContain(OLD_TOKEN)
    expect(out.message).not.toContain(APP_SECRET)
  })

  it('survives a network throw', async () => {
    const { db } = makeDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up')
      }),
    )

    const out = await upgradeToNonExpiringToken({
      db,
      configId: CONFIG_ID,
      accessToken: OLD_TOKEN,
      appSecret: APP_SECRET,
    })

    expect(out.upgraded).toBe(false)
    expect(out.message).toContain('socket hang up')
  })
})
