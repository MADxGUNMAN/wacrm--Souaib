import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { AiProvider } from '@/lib/ai/types'

/**
 * POST /api/ai/models
 *
 * Fetch the list of available models for a given provider.
 * Requires the API key (either passed in the request body, or looks it up from the DB).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('owner')

    const limit = checkRateLimit(`ai-models:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const provider = body.provider as AiProvider
    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 })
    }

    const rawKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
    let apiKeyPlain = rawKey

    if (!apiKeyPlain) {
      const { data: existing } = await supabase
        .from('ai_configs')
        .select('api_key')
        .eq('account_id', accountId)
        .maybeSingle()
      
      if (!existing?.api_key) {
        return NextResponse.json({ models: [] })
      }
      try {
        apiKeyPlain = decrypt(existing.api_key)
      } catch {
        return NextResponse.json({ models: [] })
      }
    }

    let models: string[] = []

    try {
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKeyPlain}` },
        })
        if (res.ok) {
          const data = await res.json()
          models = data.data?.map((m: any) => m.id) || []
        }
      } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKeyPlain,
            'anthropic-version': '2023-06-01',
          },
        })
        if (res.ok) {
          const data = await res.json()
          models = data.data?.map((m: any) => m.id) || []
        }
      } else if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeyPlain}`)
        if (res.ok) {
          const data = await res.json()
          models = data.models?.map((m: any) => m.name.replace('models/', '')) || []
        }
      } else if (provider === 'nvidia') {
        const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKeyPlain}` },
        })
        if (res.ok) {
          const data = await res.json()
          models = data.data?.map((m: any) => m.id) || []
        }
      } else if (provider === 'cloudflare') {
        const parts = apiKeyPlain.split(':')
        if (parts.length === 2) {
          const [accountId, token] = parts
          const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const data = await res.json()
            models = data.result?.map((m: any) => m.name) || []
          }
        }
      } else if (provider === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/models')
        if (res.ok) {
          const data = await res.json()
          models = data.data?.map((m: any) => m.id) || []
        }
      } else if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKeyPlain}` },
        })
        if (res.ok) {
          const data = await res.json()
          models = data.data?.map((m: any) => m.id) || []
        }
      } else if (provider === 'xai') {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${apiKeyPlain}` },
        })
        if (res.ok) {
          const data = await res.json()
          models = data.data?.map((m: any) => m.id) || []
        }
      }

      // Filter out non-chat models or just sort them alphabetically
      models = models.sort((a, b) => a.localeCompare(b))

    } catch (err) {
      console.error('[ai/models] fetch error:', err)
      // Return empty list on failure, frontend will allow custom input
    }

    return NextResponse.json({ models })
  } catch (err) {
    return toErrorResponse(err)
  }
}
