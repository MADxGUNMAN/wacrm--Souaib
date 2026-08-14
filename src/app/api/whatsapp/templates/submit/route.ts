import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { submitMessageTemplate } from '@/lib/whatsapp/meta-api'
import {
  validateTemplatePayload,
  type TemplatePayload,
} from '@/lib/whatsapp/template-validators'
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components'
import {
  ensureCarouselCardHandles,
  ensureMediaHeaderHandle,
} from '@/lib/whatsapp/template-header-handle'
import {
  deriveFlatColumns,
  type TemplateComponent,
} from '@/lib/whatsapp/template-definition'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'

/**
 * Shared upsert payload builder — both the Meta-failure path and the
 * Meta-success path write nearly identical rows; dropping the shared
 * fields here means adding a column later only touches one spot.
 */
/**
 * Which wizard flow this payload came from. Stored so the editor can
 * reopen the right form instead of re-deriving it from components.
 */
function resolveTemplateType(payload: TemplatePayload) {
  if (payload.category === 'Authentication') return 'authentication'
  // Checked before the rest because an order-status template's components
  // are indistinguishable from a plain Utility template's — the
  // sub_category is the only signal, and losing it here would reopen the
  // template in the wrong editor.
  if (payload.sub_category === 'ORDER_STATUS') return 'order_status'
  if (payload.sub_category === 'CALL_PERMISSION_REQUEST') {
    return 'calling_permission_request'
  }
  if (payload.catalog) return 'catalogue'
  if (payload.mpm) return 'multi_product'
  if (payload.order_details) return 'order_details'
  if (payload.offer) return 'limited_time_offer'
  if (payload.cards && payload.cards.length > 0) return 'carousel'
  if (payload.flow) return 'flows'
  return 'default'
}

function buildUpsertRow(
  accountId: string,
  userId: string,
  payload: TemplatePayload,
  extras: {
    status: 'DRAFT' | string
    metaTemplateId: string | null
    submissionError: string | null
    /** Exactly what was (or would be) POSTed to Meta. */
    components: unknown[]
  },
) {
  return {
    // Account tenancy — required NOT NULL on message_templates as
    // of migration 017. Without this an INSERT throws on the
    // not-null constraint.
    account_id: accountId,
    // Original author — audit only. Uniqueness is enforced on
    // (account_id, name, language) as of migration 060, matching
    // Meta's own one-template-per-name-per-WABA rule.
    user_id: userId,
    name: payload.name,
    category: payload.category,
    language: payload.language,
    // Source of truth (migration 061). These are the exact components
    // handed to Meta — passed in rather than re-derived here so the
    // stored form cannot differ from the one under review. That matters
    // most for AUTHENTICATION, whose shape (a text-less BODY carrying
    // add_security_recommendation) cannot be expressed by the flat
    // payload at all.
    components: extras.components,
    template_type: resolveTemplateType(payload),
    parameter_format: 'POSITIONAL',
    message_send_ttl_seconds: payload.message_send_ttl_seconds ?? null,
    // ---- Derived cache of the above (see template-definition.ts).
    ...deriveFlatColumns({
      name: payload.name,
      category: payload.category,
      language: payload.language,
      template_type: resolveTemplateType(payload),
      parameter_format: 'POSITIONAL',
      components: extras.components as TemplateComponent[],
    }),
    status: extras.status,
    meta_template_id: extras.metaTemplateId,
    submission_error: extras.submissionError,
    // Clear stale rejection_reason whenever we re-submit; the
    // webhook will set it again if Meta still rejects.
    rejection_reason: extras.submissionError ? null : null,
    last_submitted_at: new Date().toISOString(),
  }
}

async function upsertTemplateRow(
  supabase: SupabaseClient,
  row: ReturnType<typeof buildUpsertRow>,
) {
  // Conflict target must match the unique index from migration 060.
  // Account-scoped, because Meta allows exactly one template per
  // (name, language) per WABA — so if a teammate already created
  // `order_update` in en_US, this must UPDATE that row rather than
  // insert a second one that silently fights over the same Meta
  // template.
  return supabase
    .from('message_templates')
    .upsert(row, { onConflict: 'account_id,name,language' })
    .select()
    .single()
}

/**
 * Submit a template to Meta for approval AND persist it locally.
 *
 * Auth → fetch whatsapp_config → validate → (DRY_RUN short-circuit) →
 * POST to Meta → upsert local row by (user_id, name, language) with
 * status, meta_template_id, sample_values, last_submitted_at.
 *
 * When WHATSAPP_TEMPLATES_DRY_RUN=true, we skip the network call and
 * insert a row with a synthetic `dry-run-<uuid>` meta_template_id so
 * CI / local dev can exercise the full UI without a real Meta App.
 *
 * On the Meta side this is a one-way trip — a row can only be
 * submitted; editing or deleting requires hsm_id and lives in PR 4.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the caller's account_id — whatsapp_config + the
    // message_templates row are account-scoped post-multi-user.
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

    let payload: TemplatePayload
    try {
      payload = (await request.json()) as TemplatePayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    // AUTHENTICATION used to be rejected here. It is supported now — the
    // validators branch on the category and the payload builder emits the
    // OTP component shape Meta requires.
    //
    // Worth knowing: Meta additionally gates this category on the WABA
    // itself (business verification plus a 2,000/day messaging limit). We
    // cannot check that from here, so a rejection surfaces as Meta's own
    // error message rather than something we invent.
    try {
      validateTemplatePayload(payload)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Validation failed.' },
        { status: 400 },
      )
    }

    const dryRun =
      process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
      process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'

    let metaTemplateId: string
    let metaStatus: string

    if (dryRun) {
      metaTemplateId = `dry-run-${crypto.randomUUID()}`
      metaStatus = 'PENDING'
    } else {
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

      // Media headers (image, video, document) need a Resumable-Upload
      // handle — Meta rejects a plain URL at creation. Derive it from
      // header_media_url before building the payload. Surfaces a 400
      // with an actionable message (missing META_APP_ID, unreachable
      // URL, wrong type/size).
      try {
        await ensureMediaHeaderHandle(payload, accessToken)
        // Carousel cards each carry their own media asset, so a 10-card
        // carousel performs 10 uploads. Sequential by design — see the
        // helper.
        await ensureCarouselCardHandles(payload, accessToken)
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Header media upload failed.' },
          { status: 400 },
        )
      }

      // Recomputed here rather than reusing the outer `storedComponents`
      // because ensureMediaHeaderHandle has just mutated `payload` with a
      // fresh header handle, and the handle must be part of what Meta
      // receives.
      const metaPayload = buildMetaTemplatePayload(payload)
      try {
        const meta = await submitMessageTemplate({
          wabaId: config.waba_id,
          accessToken,
          payload: metaPayload,
        })
        metaTemplateId = meta.id
        metaStatus = meta.status
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Meta submit failed.'
        // Persist the failure so the user can retry; row stays DRAFT
        // until they fix and re-submit.
        await upsertTemplateRow(
          supabase,
          buildUpsertRow(accountId, user.id, payload, {
            status: 'DRAFT',
            metaTemplateId: null,
            submissionError: message,
            components: metaPayload.components,
          }),
        )
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
    }

    // Built from the final payload — after any header handle was derived
    // — so what is stored is what Meta was asked to approve.
    const storedComponents = buildMetaTemplatePayload(payload).components

    const { data: row, error: upsertErr } = await upsertTemplateRow(
      supabase,
      buildUpsertRow(accountId, user.id, payload, {
        status: normalizeStatus(metaStatus),
        metaTemplateId,
        submissionError: null,
        components: storedComponents,
      }),
    )

    if (upsertErr) {
      // The submit succeeded on Meta's side but we failed to persist
      // locally. That's a data-drift state — surface the meta_template_id
      // so the user can recover via "Sync from Meta".
      return NextResponse.json(
        {
          error: `Submitted to Meta but failed to save locally: ${upsertErr.message}. Run "Sync from Meta" to recover.`,
          meta_template_id: metaTemplateId,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      template: row,
      dry_run: dryRun,
    })
  } catch (error) {
    console.error('Error submitting template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to submit template.',
      },
      { status: 500 },
    )
  }
}
