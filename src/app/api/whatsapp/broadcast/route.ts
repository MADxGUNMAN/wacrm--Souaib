import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
  normalizePhone,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'

interface BroadcastResult {
  phone: string
  status: 'sent' | 'failed'
  whatsapp_message_id?: string
  error?: string
}

/**
 * Two input shapes are accepted:
 *
 *   NEW (preferred — supports per-recipient variable substitution):
 *     {
 *       recipients: Array<{ phone: string; params: string[] }>,
 *       template_name, template_language
 *     }
 *
 *   LEGACY (all phones receive the same params — kept so existing
 *   callers don't break):
 *     {
 *       phone_numbers: string[],
 *       template_params: string[],
 *       template_name, template_language
 *     }
 *
 * Previous implementation only supported the legacy shape, and the
 * sending hook was forced to ship every batch with `templateParams[0]`
 * — meaning every recipient got contact-0's personalization. The new
 * shape is what actually fixes that.
 */
interface NewRecipient {
  phone: string
  params?: string[]
}

// Lazy-initialized service-role client for DB writes that bypass RLS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminDb: any = null
function adminDb() {
  if (!_adminDb) {
    _adminDb = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminDb
}

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

    // Per-user broadcast budget. Note: this limits how often a user
    // can *start* a campaign, not how many messages go out inside
    // one — the fan-out loop below runs without additional gating.
    const limit = checkRateLimit(`broadcast:${user.id}`, RATE_LIMITS.broadcast)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await request.json()
    const {
      recipients: newRecipients,
      phone_numbers,
      template_name,
      template_language,
      template_params,
    } = body

    // Normalize to a list of {phone, params} regardless of shape.
    let recipients: NewRecipient[]
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params)
        ? template_params
        : []
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }))
    } else {
      return NextResponse.json(
        {
          error:
            'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array',
        },
        { status: 400 }
      )
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration first.',
        },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    const results: BroadcastResult[] = []
    let sentCount = 0
    let failedCount = 0

    for (const recipient of recipients) {
      const sanitized = sanitizePhoneForMeta(recipient.phone)

      if (!isValidE164(sanitized)) {
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: 'Invalid phone number format',
        })
        failedCount++
        continue
      }

      // Retry with phone variants on "not in allowed list" so numbers
      // that differ only in a trunk-prefix 0 still reach recipients.
      const variants = phoneVariants(sanitized)
      let sentMessageId: string | null = null
      let lastError: string | null = null

      for (const variant of variants) {
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: variant,
            templateName: template_name,
            language: template_language || 'en_US',
            params: recipient.params ?? [],
          })
          sentMessageId = result.messageId
          lastError = null
          break
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          if (!isRecipientNotAllowedError(errorMessage)) {
            lastError = errorMessage
            break
          }
          lastError = errorMessage
          // retry with next variant
        }
      }

      if (sentMessageId) {
        results.push({
          phone: recipient.phone,
          status: 'sent',
          whatsapp_message_id: sentMessageId,
        })
        sentCount++

        // ─── Save broadcast message to DB ─────────────────────────
        // Find or create the contact + conversation so the message
        // appears in the admin's / vendor's inbox thread.
        try {
          const normalized = normalizePhone(recipient.phone)

          const cleanPhone = recipient.phone.replace(/[^+\d]/g, '')
          const orQueries = [
            `phone.eq.${normalized}`,
            `phone.eq.+${normalized}`,
            cleanPhone ? `phone.eq.${cleanPhone}` : null
          ].filter(Boolean)

          // Find existing contact by phone
          const { data: existingContact } = await adminDb()
            .from('contacts')
            .select('id')
            .eq('user_id', user.id)
            .or(orQueries.join(','))
            .limit(1)
            .maybeSingle()

          let contactId: string | null = existingContact?.id ?? null

          // Create contact if it doesn't exist
          if (!contactId) {
            const { data: newContact } = await adminDb()
              .from('contacts')
              .insert({
                user_id: user.id,
                phone: normalized,
                name: normalized,
              })
              .select('id')
              .single()
            contactId = newContact?.id ?? null
          }

          if (contactId) {
            // Find or create conversation
            const { data: existingConv } = await adminDb()
              .from('conversations')
              .select('id')
              .eq('user_id', user.id)
              .eq('contact_id', contactId)
              .maybeSingle()

            let conversationId: string | null = existingConv?.id ?? null

            if (!conversationId) {
              const { data: newConv } = await adminDb()
                .from('conversations')
                .insert({
                  user_id: user.id,
                  contact_id: contactId,
                })
                .select('id')
                .single()
              conversationId = newConv?.id ?? null
            }

            if (conversationId) {
              const templateText = `[Template: ${template_name}]`

              // Insert the message record
              await adminDb()
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  sender_type: 'agent',
                  content_type: 'template',
                  content_text: templateText,
                  template_name: template_name,
                  message_id: sentMessageId,
                  status: 'sent',
                })

              // Update conversation preview
              await adminDb()
                .from('conversations')
                .update({
                  last_message_text: templateText,
                  last_message_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', conversationId)
            }
          }
        } catch (dbErr) {
          // Don't fail the broadcast if DB save fails — the message
          // was already sent via Meta successfully.
          console.error(
            `[broadcast] Failed to save message to DB for ${recipient.phone}:`,
            dbErr
          )
        }
      } else {
        console.error(
          `Failed to send broadcast to ${recipient.phone}:`,
          lastError
        )
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: lastError || 'Unknown error',
        })
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
    })
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error)
    return NextResponse.json(
      { error: 'Failed to process broadcast' },
      { status: 500 }
    )
  }
}
