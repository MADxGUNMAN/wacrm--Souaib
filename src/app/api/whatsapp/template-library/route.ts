import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  fetchMessageTemplateByName,
  listTemplateLibrary,
  submitLibraryTemplate,
  type LibraryButtonInput,
} from '@/lib/whatsapp/meta-api'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import {
  buildTemplateColumns,
  definitionFromRow,
} from '@/lib/whatsapp/template-definition'
import { validateTemplateName } from '@/lib/whatsapp/template-validators'

/**
 * Meta's Template Library — browse (GET) and create from it (POST).
 *
 * ─── Why this is worth having ─────────────────────────────────────
 *
 * Library templates are PRE-CATEGORISED by Meta. A template you write
 * yourself can be classified as Marketing by Meta's own classifier even
 * when you meant it as Utility, which changes what it costs to send and
 * whether it can be sent at all outside a conversation window. A library
 * template's category is already settled, so for the common cases —
 * delivery updates, payment reminders — it is both faster and cheaper.
 *
 * The trade is that the WORDING IS FIXED. All the business supplies is a
 * name, a language, and its own button details.
 */

/** The shared account + WhatsApp config lookup both handlers need. */
async function resolveWhatsAppConfig() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id
  if (!accountId) {
    return {
      error: NextResponse.json({ error: 'No account found' }, { status: 400 }),
    }
  }

  const { data: config, error: configError } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single()
  if (configError || !config) {
    return {
      error: NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      ),
    }
  }
  if (!config.waba_id) {
    return {
      error: NextResponse.json(
        {
          error:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      ),
    }
  }

  return {
    supabase,
    userId: user.id,
    accountId,
    wabaId: config.waba_id as string,
    accessToken: decrypt(config.access_token),
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await resolveWhatsAppConfig()
    if ('error' in ctx && ctx.error) return ctx.error

    const url = new URL(request.url)
    const templates = await listTemplateLibrary({
      wabaId: ctx.wabaId!,
      accessToken: ctx.accessToken!,
      search: url.searchParams.get('search') ?? undefined,
      topic: url.searchParams.get('topic') ?? undefined,
      usecase: url.searchParams.get('usecase') ?? undefined,
      industry: url.searchParams.get('industry') ?? undefined,
      language: url.searchParams.get('language') ?? undefined,
    })

    return NextResponse.json({ templates })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    // Upstream failure, not ours — the Template Library needs
    // whatsapp_business_management on the token, and that error message is
    // specific enough to pass through.
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function parseButtonInputs(raw: unknown): LibraryButtonInput[] {
  if (!Array.isArray(raw)) return []
  const out: LibraryButtonInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const b = item as Record<string, unknown>
    if (b.type === 'URL') {
      const url = b.url as Record<string, unknown> | undefined
      const base = typeof url?.base_url === 'string' ? url.base_url.trim() : ''
      const example =
        typeof url?.url_suffix_example === 'string'
          ? url.url_suffix_example.trim()
          : ''
      if (base && example) {
        out.push({
          type: 'URL',
          url: { base_url: base, url_suffix_example: example },
        })
      }
      continue
    }
    if (b.type === 'PHONE_NUMBER' && typeof b.phone_number === 'string') {
      const phone = b.phone_number.trim()
      if (phone) out.push({ type: 'PHONE_NUMBER', phone_number: phone })
    }
  }
  return out
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveWhatsAppConfig()
    if ('error' in ctx && ctx.error) return ctx.error

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const language =
      typeof body?.language === 'string' && body.language.trim()
        ? body.language.trim()
        : 'en_US'
    const libraryTemplateName =
      typeof body?.library_template_name === 'string'
        ? body.library_template_name.trim()
        : ''
    const category = body?.category === 'AUTHENTICATION' ? 'AUTHENTICATION' : 'UTILITY'

    try {
      // Same name rules as any other template — lowercase, digits,
      // underscores. Checked before the network call so a typo is a field
      // error rather than a Meta rejection.
      validateTemplateName(name)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid template name.' },
        { status: 400 },
      )
    }
    if (!libraryTemplateName) {
      return NextResponse.json(
        { error: 'Pick a template from the library first.' },
        { status: 400 },
      )
    }

    const buttonInputs = parseButtonInputs(body?.library_template_button_inputs)

    let created
    try {
      created = await submitLibraryTemplate({
        wabaId: ctx.wabaId!,
        accessToken: ctx.accessToken!,
        name,
        language,
        libraryTemplateName,
        category,
        buttonInputs,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Meta submit failed.'
      const isRateLimit = /\b429\b/.test(message)
      return NextResponse.json(
        {
          error: isRateLimit
            ? 'Meta rate limit hit (100 template creates per hour). Try again later.'
            : message,
        },
        { status: isRateLimit ? 429 : 502 },
      )
    }

    // Read the template back rather than reconstructing it. The create
    // response carries only an id, and the components are Meta's — writing
    // a local guess at the library wording would put a body in the preview
    // and in every broadcast that Meta never approved.
    let fetched = null
    try {
      fetched = await fetchMessageTemplateByName({
        wabaId: ctx.wabaId!,
        accessToken: ctx.accessToken!,
        name,
        language,
      })
    } catch {
      // Non-fatal: the template exists on Meta's side. Fall through to a
      // minimal row and let "Sync from Meta" fill in the rest.
    }

    const definition = definitionFromRow({
      name,
      category: category === 'AUTHENTICATION' ? 'Authentication' : 'Utility',
      language,
      template_type: 'default',
      components: fetched?.components ?? [],
      library_template_name: libraryTemplateName,
      // Only reached when the read-back failed. body_text is NOT NULL and
      // template-row-guard throws on an empty one, which would break the
      // broadcast engine for the whole account — so it is never empty.
      body_text:
        fetched?.components && fetched.components.length > 0
          ? undefined
          : `Created from Meta's template library (${libraryTemplateName}). Run "Sync from Meta" to pull the wording.`,
    })

    const { data: row, error: upsertErr } = await ctx.supabase!
      .from('message_templates')
      .upsert(
        {
          ...buildTemplateColumns(definition),
          account_id: ctx.accountId,
          user_id: ctx.userId,
          status: normalizeStatus(fetched?.status ?? created.status),
          meta_template_id: created.id,
          submission_error: null,
          rejection_reason: null,
          last_submitted_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,name,language' },
      )
      .select()
      .single()

    if (upsertErr) {
      return NextResponse.json(
        {
          error: `Created on Meta but failed to save locally: ${upsertErr.message}. Run "Sync from Meta" to recover.`,
          meta_template_id: created.id,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, template: row })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
