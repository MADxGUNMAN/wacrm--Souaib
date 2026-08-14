import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import type { TemplateButton, TemplateSampleValues } from '@/types'

/**
 * Sync message templates from Meta → local message_templates table.
 *
 * The local catalog stores Meta's status enum verbatim (APPROVED /
 * PENDING / REJECTED / PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION)
 * so the edit / resubmit / delete flows can distinguish recoverable
 * states (PAUSED) from terminal ones (DISABLED) and so webhook events
 * land 1:1 without a translation table.
 *
 * Locally-created templates (no Meta counterpart) are NOT deleted —
 * they remain visible so the user can notice drift and clean up.
 */

import { META_API_BASE } from '@/lib/whatsapp/graph-version'
import {
  resolveBodyText,
  resolveFooterText,
} from '@/lib/whatsapp/template-definition'

interface MetaButton {
  type: string
  text: string
  url?: string
  phone_number?: string
  example?: string[] | string
}

interface MetaTemplateComponent {
  type: string
  text?: string
  format?: string
  buttons?: MetaButton[]
  /** AUTHENTICATION templates carry these instead of body/footer text. */
  add_security_recommendation?: boolean
  code_expiration_minutes?: number
  /** Present on CAROUSEL components — each card has its own components. */
  cards?: { components?: MetaTemplateComponent[] }[]
  example?: {
    header_text?: string[]
    header_handle?: string[]
    header_url?: string[]
    body_text?: string[][]
  }
}

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
  quality_score?: { score?: string } | string
  parameter_format?: string
  message_send_ttl_seconds?: number
}

/**
 * Work out which wizard flow a Meta template corresponds to.
 *
 * Meta has no `template_type` field — the type is implied by the
 * component mix — so it is inferred once here on sync rather than
 * re-guessed on every read. Order matters: a carousel template also has
 * a plain BODY, so the distinctive component has to be checked first.
 */
function inferTemplateType(t: MetaTemplate): string {
  const components = t.components ?? []
  const has = (type: string) =>
    components.some((c) => c.type?.toUpperCase() === type)

  if (has('CAROUSEL')) return 'carousel'
  if (has('LIMITED_TIME_OFFER')) return 'limited_time_offer'
  if (t.category?.toUpperCase() === 'AUTHENTICATION') return 'authentication'

  const buttonTypes = new Set(
    components
      .flatMap((c) => c.buttons ?? [])
      .map((b) => b.type?.toUpperCase()),
  )
  if (buttonTypes.has('ORDER_DETAILS')) return 'order_details'
  if (buttonTypes.has('VOICE_CALL')) return 'calling_permission_request'
  if (buttonTypes.has('CATALOG')) return 'catalogue'
  if (buttonTypes.has('MPM')) return 'multi_product'
  if (buttonTypes.has('FLOW')) return 'flows'

  return 'default'
}

function normalizeCategory(
  meta: string,
): 'Marketing' | 'Utility' | 'Authentication' {
  const upper = meta.toUpperCase()
  if (upper === 'UTILITY') return 'Utility'
  if (upper === 'AUTHENTICATION') return 'Authentication'
  return 'Marketing'
}

function normalizeQualityScore(
  raw: MetaTemplate['quality_score'],
): 'GREEN' | 'YELLOW' | 'RED' | null {
  const score =
    typeof raw === 'string' ? raw : raw?.score ? String(raw.score) : null
  if (!score) return null
  const upper = score.toUpperCase()
  return upper === 'GREEN' || upper === 'YELLOW' || upper === 'RED'
    ? (upper as 'GREEN' | 'YELLOW' | 'RED')
    : null
}

function parseButtons(metaButtons: MetaButton[] | undefined): TemplateButton[] {
  if (!metaButtons?.length) return []
  const out: TemplateButton[] = []
  for (const b of metaButtons) {
    switch (b.type?.toUpperCase()) {
      case 'QUICK_REPLY':
        out.push({ type: 'QUICK_REPLY', text: b.text })
        break
      case 'URL':
        out.push({
          type: 'URL',
          text: b.text,
          url: b.url ?? '',
          example: Array.isArray(b.example) ? b.example[0] : b.example,
        })
        break
      case 'PHONE_NUMBER':
        out.push({
          type: 'PHONE_NUMBER',
          text: b.text,
          phone_number: b.phone_number ?? '',
        })
        break
      case 'COPY_CODE':
        out.push({
          type: 'COPY_CODE',
          text: b.text,
          example: Array.isArray(b.example) ? b.example[0] ?? '' : b.example ?? '',
        })
        break
      // OTP / FLOW / MPM / CATALOG are intentionally absent: the flat
      // `buttons` column is typed as the 4-member legacy TemplateButton
      // union that the send builder switches over exhaustively, so a
      // richer type here would be unsound. They are NOT lost — the raw
      // `components` column keeps them (migration 061).
    }
  }
  return out
}

function extractSampleValues(
  body: MetaTemplateComponent | undefined,
  header: MetaTemplateComponent | undefined,
): TemplateSampleValues | null {
  // Meta returns body_text as a 2D array — one row per example set.
  // We take the first row (most templates have exactly one).
  const bodySample = body?.example?.body_text?.[0]
  const headerSample = header?.example?.header_text
  if (!bodySample?.length && !headerSample?.length) return null
  const sv: TemplateSampleValues = {}
  if (bodySample?.length) sv.body = bodySample
  if (headerSample?.length) sv.header = headerSample
  return sv
}

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the caller's account_id — both whatsapp_config and
    // the message_templates we sync into are account-scoped.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      )
    }

    if (!config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    const metaTemplates: MetaTemplate[] = []
    let nextUrl:
      | string
      | null = `${META_API_BASE}/${config.waba_id}/message_templates?limit=100&fields=id,name,language,status,category,components,quality_score,parameter_format,message_send_ttl_seconds`
    const PAGE_CAP = 20
    let pageCount = 0

    while (nextUrl && pageCount < PAGE_CAP) {
      pageCount++
      const metaRes: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!metaRes.ok) {
        let metaErr = `Meta API error: ${metaRes.status}`
        try {
          const body = await metaRes.json()
          if (body?.error?.message) metaErr = body.error.message
        } catch {
          // response wasn't JSON — keep the fallback
        }
        return NextResponse.json({ error: metaErr }, { status: 502 })
      }

      const metaBody: {
        data?: MetaTemplate[]
        paging?: { next?: string }
      } = await metaRes.json()
      if (metaBody.data) metaTemplates.push(...metaBody.data)
      nextUrl = metaBody.paging?.next ?? null
    }

    let inserted = 0
    let updated = 0
    const errors: { name: string; language: string; message: string }[] = []

    for (const t of metaTemplates) {
      const body = (t.components ?? []).find((c) => c.type === 'BODY')
      const header = (t.components ?? []).find((c) => c.type === 'HEADER')
      const footer = (t.components ?? []).find((c) => c.type === 'FOOTER')
      const buttons = (t.components ?? []).find((c) => c.type === 'BUTTONS')

      const parsedButtons = parseButtons(buttons?.buttons)
      const sampleValues = extractSampleValues(body, header)

      const headerFormat = header?.format?.toUpperCase()
      const headerType =
        headerFormat === 'TEXT' ||
        headerFormat === 'IMAGE' ||
        headerFormat === 'VIDEO' ||
        headerFormat === 'DOCUMENT' ||
        headerFormat === 'LOCATION'
          ? headerFormat.toLowerCase()
          : null

      const row = {
        // Account tenancy + user audit, same split as the submit
        // route. account_id is NOT NULL on message_templates
        // post-017, so an INSERT without it errors.
        account_id: accountId,
        user_id: user.id,
        name: t.name,
        category: normalizeCategory(t.category),
        language: t.language,
        // ---- Source of truth: Meta's components array, stored verbatim.
        // Everything below this is a derived cache of it.
        //
        // This is what stops the data loss that `parseButtons` used to
        // cause on its own: OTP, FLOW, MPM and CATALOG buttons, carousel
        // cards and limited-time-offer components were parsed away and
        // gone. Now a template that Meta knows about survives the round
        // trip intact even for types the UI cannot yet render.
        components: t.components ?? [],
        template_type: inferTemplateType(t),
        parameter_format: t.parameter_format === 'NAMED' ? 'NAMED' : 'POSITIONAL',
        // ---- Derived cache (see template-definition.ts).
        header_type: headerType,
        header_content: header?.text ?? null,
        header_handle: header?.example?.header_handle?.[0] ?? null,
        // resolveBodyText/resolveFooterText synthesise Meta's preset
        // wording for AUTHENTICATION templates, whose BODY may come back
        // with no `text` at all. Storing '' there would make
        // template-row-guard.ts throw on the next broadcast — it requires
        // a truthy body_text — taking down sends for the whole account
        // because of one synced OTP template.
        body_text: resolveBodyText({
          type: 'BODY',
          text: body?.text,
          add_security_recommendation: body?.add_security_recommendation,
        }),
        footer_text: resolveFooterText({
          type: 'FOOTER',
          text: footer?.text,
          code_expiration_minutes: footer?.code_expiration_minutes,
        }),
        buttons: parsedButtons.length ? parsedButtons : null,
        sample_values: sampleValues,
        status: normalizeStatus(t.status),
        meta_template_id: t.id,
        quality_score: normalizeQualityScore(t.quality_score),
        updated_at: new Date().toISOString(),
      }

      const { data: existing, error: lookupErr } = await supabase
        .from('message_templates')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', t.name)
        .eq('language', t.language)
        .maybeSingle()

      if (lookupErr) {
        errors.push({
          name: t.name,
          language: t.language,
          message: lookupErr.message,
        })
        continue
      }

      if (existing?.id) {
        const { error: updErr } = await supabase
          .from('message_templates')
          .update(row)
          .eq('id', existing.id)
        if (updErr) {
          errors.push({
            name: t.name,
            language: t.language,
            message: updErr.message,
          })
        } else {
          updated++
        }
      } else {
        const { error: insErr } = await supabase
          .from('message_templates')
          .insert(row)
        if (insErr) {
          errors.push({
            name: t.name,
            language: t.language,
            message: insErr.message,
          })
        } else {
          inserted++
        }
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      total: metaTemplates.length,
      inserted,
      updated,
      errors,
      truncated: pageCount >= PAGE_CAP && nextUrl !== null,
    })
  } catch (error) {
    console.error('Error syncing WhatsApp templates:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to sync templates',
      },
      { status: 500 },
    )
  }
}
