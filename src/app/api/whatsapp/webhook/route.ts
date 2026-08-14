import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'
import { parseFlowResponse } from '@/lib/whatsapp/flow-response'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import {
  handleTemplateWebhookChange,
  isTemplateWebhookField,
} from '@/lib/whatsapp/template-webhook'
import {
  historyStatusToMessageStatus,
  isAccountUpdateField,
  isCoexistenceWebhookField,
  isMessageMutation,
  parseAccountUpdate,
  parseAppStateSync,
  parseEdit,
  parseHistory,
  parseMessageEchoes,
  parseRevoke,
  type HistoryThread,
  type MessageEcho,
} from '@/lib/whatsapp/coexistence'

// The `after()` callback in POST runs within this route's max duration.
// Inbound processing can fan out to per-media Meta verification calls, so
// give it headroom beyond the platform default (Vercel clamps this to the
// plan's ceiling). Tune as needed.
export const maxDuration = 60

// Lazy-initialized to avoid build-time crash when env vars are missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

interface WhatsAppMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; caption?: string }
  video?: { id: string; mime_type: string; caption?: string }
  document?: { id: string; mime_type: string; filename?: string; caption?: string }
  audio?: { id: string; mime_type: string }
  sticker?: { id: string; mime_type: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  reaction?: { message_id: string; emoji: string }
  /**
   * Set when the customer taps a button or list row on an interactive
   * message we sent. `button_reply.id` / `list_reply.id` is whatever id
   * we put on the button/row when sending — the Flows engine uses this
   * to advance the per-contact run.
   */
  interactive?: {
    type: 'button_reply' | 'list_reply' | 'nfm_reply'
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
    /**
     * A completed META WhatsApp Flow — the multi-screen form opened by a
     * template's FLOW button. (Not this app's own Flows engine, which
     * uses button_reply / list_reply above.)
     *
     * `response_json` is a JSON STRING, not an object, and contains the
     * flow_token we sent plus one entry per answered field.
     */
    nfm_reply?: { response_json?: string; body?: string; name?: string }
  }
  /** Present when the customer swipe-replies to one of our messages. */
  context?: { id: string }
}

interface WhatsAppWebhookEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata: {
        display_phone_number: string
        phone_number_id: string
      }
      contacts?: Array<{
        profile: { name: string }
        wa_id: string
      }>
      messages?: WhatsAppMessage[]
      statuses?: Array<{
        id: string
        status: string
        timestamp: string
        recipient_id: string
      }>
    }
    field: string
  }>
}

// GET - Webhook verification
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const challenge = searchParams.get('hub.challenge')
    const verifyToken = searchParams.get('hub.verify_token')

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 }
      )
    }

    // App-level verify token (App Dashboard → WhatsApp → Configuration →
    // Webhooks). That screen sets ONE callback URL + ONE verify token for
    // the whole app — it's what Meta calls when *you* click "Verify and
    // save" there, independent of any per-account row below.
    //
    // Accounts onboarded through Embedded Signup never get a
    // `whatsapp_config.verify_token` (that column is only populated by the
    // legacy manual-entry form), so without this check the per-account
    // loop below has nothing to match against and dashboard verification
    // fails for every Embedded-Signup-only deployment.
    const appVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
    if (appVerifyToken && verifyToken === appVerifyToken) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Fetch all whatsapp configs to check verify tokens
    const { data: configs, error: configError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id, verify_token')

    if (configError || !configs) {
      console.error('Error fetching configs for verification:', configError)
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 403 }
      )
    }

    // Check if any config's verify_token matches. Also collect the
    // matching row so we can opportunistically upgrade its token to
    // GCM if it was still in the legacy CBC format.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchedConfig: any = null
    for (const config of configs) {
      if (!config.verify_token) continue
      try {
        if (decrypt(config.verify_token) === verifyToken) {
          matchedConfig = config
          break
        }
      } catch {
        // Malformed / wrong-key token row — skip it and keep checking.
      }
    }

    if (matchedConfig) {
      // Fire-and-forget GCM upgrade. Safe to run on every subscribe
      // since it's a no-op once the column is already GCM.
      if (isLegacyFormat(matchedConfig.verify_token)) {
        void supabaseAdmin()
          .from('whatsapp_config')
          .update({ verify_token: encrypt(verifyToken) })
          .eq('id', matchedConfig.id)
          .then(({ error }: { error: unknown }) => {
            if (error) {
              console.warn(
                '[webhook] verify_token GCM upgrade failed:',
                (error as { message?: string })?.message ?? error,
              )
            }
          })
      }
      // Return challenge as plain text
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return NextResponse.json(
      { error: 'Verification token mismatch' },
      { status: 403 }
    )
  } catch (error) {
    console.error('Error in webhook GET verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Receive messages
export async function POST(request: Request) {
  // Read raw body first so we can HMAC-verify the exact bytes Meta
  // signed. request.json() would re-encode and break the signature.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    // 401 (not 200) — we want Meta's delivery dashboard to show failures
    // loudly if a misconfiguration causes signatures to stop matching,
    // rather than silently eating events.
    console.warn('[webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: { entry?: WhatsAppWebhookEntry[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Process AFTER the response so we ack Meta within their ~20s timeout
  // (a slow ack triggers Meta retries + duplicate inserts), while still
  // guaranteeing the work runs to completion.
  //
  // This MUST use `after()` rather than a detached `processWebhook(body)`
  // promise: on serverless platforms (we run on Vercel) the function can
  // be frozen or terminated the moment the response is sent, so a floating
  // promise's DB writes are not guaranteed to finish. That dropped a
  // non-deterministic *subset* of inbound messages — contacts/conversations
  // were created but the message insert never landed, leaving conversations
  // that show in the inbox with an empty thread, and no logs to explain it
  // (see issue #301). `after()` hands the callback to the runtime, which
  // keeps the function alive until it resolves (within the route's
  // maxDuration).
  after(async () => {
    try {
      await processWebhook(body)
    } catch (error) {
      console.error('Error processing webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processWebhook(body: { entry?: WhatsAppWebhookEntry[] }) {
  if (!body.entry) return

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      // Template-lifecycle events (status / quality / components
      // updates from Meta) come in on a different change.field and
      // have a different value shape — route them through the
      // dedicated handler. Skip the messaging branches below so we
      // don't try to read message-shaped fields off a template event.
      if (isTemplateWebhookField(change.field)) {
        await handleTemplateWebhookChange(
          { field: change.field, value: change.value as unknown },
          supabaseAdmin(),
        )
        continue
      }

      const value = change.value

      // ── Account lifecycle ────────────────────────────────────
      // How Meta reports a BROKEN coexistence pairing (and other
      // account-level news). Handled before the messaging branches
      // because its `value` carries no metadata.phone_number_id, so it
      // resolves tenancy by waba_id instead.
      if (isAccountUpdateField(change.field)) {
        await handleAccountUpdate(entry.id, value as unknown)
        continue
      }

      // ── Coexistence: messages sent from the WhatsApp Business App ──
      // These do NOT arrive on the `messages` field and carry no
      // `contacts[]`, which is why the old `if (!value.messages ||
      // !value.contacts) continue` gate dropped every one of them
      // silently. See @/lib/whatsapp/coexistence.
      if (isCoexistenceWebhookField(change.field)) {
        await handleCoexistenceChange(change.field, value as unknown)
        continue
      }

      // Handle status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status)
        }
      }

      // ── Inbound customer messages ────────────────────────────
      // Anything else with no messages/contacts is genuinely not for us,
      // but it is LOGGED rather than dropped in silence. The old silent
      // `continue` here is exactly why nobody noticed coexistence echoes
      // were being discarded: a field we do not handle looked identical
      // to a field with nothing in it.
      if (!value.messages || !value.contacts) {
        if (!value.statuses) {
          console.warn(
            `[webhook] unhandled change.field "${change.field}" — no messages/contacts/statuses in payload`,
          )
        }
        continue
      }

      const config = await resolveConfigByPhoneNumberId(
        value.metadata.phone_number_id,
      )
      if (!config) continue

      const decryptedAccessToken = decrypt(config.access_token)

      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i]
        const contact = value.contacts[i] || value.contacts[0]

        // Edits and deletes CHANGE an existing message rather than
        // adding one. They must divert before processMessage, whose
        // content-type mapping would fall them through to 'text' and
        // insert a new row — showing an edited message twice, and a
        // deleted one as an empty bubble.
        if (isMessageMutation(message.type)) {
          await handleMessageMutation(message, config.account_id)
          continue
        }

        await processMessage(
          message,
          contact,
          // Tenancy — drives every contact / conversation lookup
          // and the engines' active-row dispatch.
          config.account_id,
          // Audit / sender-of-record — used as the user_id on row
          // inserts that need it for NOT NULL FK compliance. Always
          // the admin who saved the WhatsApp config.
          config.user_id,
          decryptedAccessToken
        )
      }
    }
  }
}

/**
 * Resolve the owning account for a business phone number.
 *
 * Extracted so the inbound-message path and the coexistence echo path
 * share one implementation — two copies would drift, and the
 * multiple-rows case below is subtle enough that only one of them would
 * end up handling it.
 *
 * `.single()` is avoided deliberately: it returns PGRST116 for both 0
 * rows AND ≥2 rows, so the two are distinguished here to keep the logs
 * honest. ≥2 rows should not happen post-migration 013 (UNIQUE
 * constraint), but a row created before the constraint, or a race, would
 * still surface here.
 */
async function resolveConfigByPhoneNumberId(phoneNumberId: string): Promise<{
  id: string
  account_id: string
  user_id: string
  access_token: string
  connection_mode?: string
  coexistence_detected_at?: string | null
} | null> {
  const { data: configRows, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('phone_number_id', phoneNumberId)

  if (configError) {
    console.error(
      'Error fetching whatsapp_config for phone_number_id:',
      phoneNumberId,
      configError
    )
    return null
  }

  if (!configRows || configRows.length === 0) {
    console.error('No config found for phone_number_id:', phoneNumberId)
    return null
  }

  if (configRows.length > 1) {
    console.error(
      `Multiple configs (${configRows.length}) found for phone_number_id:`,
      phoneNumberId,
      '— inbound event dropped. Resolve duplicates so each number maps to a single account.',
      'Account owners:',
      configRows.map((r: { account_id: string; user_id: string }) => `${r.account_id} (admin ${r.user_id})`)
    )
    return null
  }

  return configRows[0]
}

// ============================================================
// COEXISTENCE
//
// One number running on the WhatsApp Business App (a phone) and the
// Cloud API (this CRM) at once. Meta mirrors CRM → phone by itself; the
// phone → CRM direction is these webhooks.
// ============================================================

/**
 * Route a coexistence change to its handler.
 *
 * `smb_app_state_sync` (the phone's address book) and `history` (up to
 * six months of past chats) are Phase 2. They are logged EXPLICITLY
 * rather than ignored, because the whole reason echoes went missing for
 * so long is that an unhandled field looked exactly like an empty one.
 */
async function handleCoexistenceChange(field: string, value: unknown) {
  switch (field) {
    case 'smb_message_echoes':
      await handleMessageEchoes(value)
      return
    case 'history':
      await handleHistory(value)
      return
    case 'smb_app_state_sync':
      await handleAppStateSync(value)
      return
    default:
      // isCoexistenceWebhookField said yes but nothing handles it — that
      // means a field was added to the set without a handler. Loud, so it
      // cannot repeat the original silent-drop bug.
      console.warn(
        `[webhook][coexistence] "${field}" is recognised but has no handler`,
      )
  }
}

/**
 * Mirror messages the business sent from their phone.
 *
 * Deliberately does NOT call processMessage. Every side effect in that
 * function assumes a CUSTOMER just spoke, and all of them are wrong here:
 *
 *   unread_count            the business does not have unread messages
 *                           from itself
 *   broadcast "replied"     the business replying to itself is not a
 *                           campaign response
 *   flow runner             would treat the business's own words as the
 *                           customer's menu selection
 *   automation triggers     new_contact_created / first_inbound_message /
 *                           keyword_match would all misfire
 *   AI auto-reply           WOULD REPLY TO THE BUSINESS'S OWN MESSAGE,
 *                           in front of the customer
 *
 * What it does do: create the contact and conversation if needed, store
 * the message as `sender_type: 'business_app'`, and refresh the
 * conversation preview so the inbox list stays truthful.
 */
async function handleMessageEchoes(value: unknown) {
  const batch = parseMessageEchoes(value)
  if (!batch) {
    console.warn('[webhook][coexistence] unusable smb_message_echoes payload')
    return
  }

  const config = await resolveConfigByPhoneNumberId(batch.phoneNumberId)
  if (!config) return

  // An echo is PROOF of coexistence, regardless of what onboarding
  // reported. Onboarding detection relies on the browser telling us which
  // flow variation it used, which a popup blocker or a mid-flow refresh
  // can lose — and a number connected through the legacy manual form
  // never reports it at all. Recorded once; cheap to skip thereafter.
  if (!config.coexistence_detected_at) {
    const { error: markErr } = await supabaseAdmin()
      .from('whatsapp_config')
      .update({
        connection_mode: 'coexistence',
        coexistence_detected_at: new Date().toISOString(),
      })
      .eq('id', config.id)
    if (markErr) {
      console.error(
        '[webhook][coexistence] could not mark config as coexistence:',
        markErr.message,
      )
    }
  }

  const accessToken = decrypt(config.access_token)

  for (const echo of batch.echoes) {
    await processEcho(echo, config.account_id, config.user_id, accessToken)
  }
}

async function processEcho(
  echo: MessageEcho,
  accountId: string,
  configOwnerUserId: string,
  accessToken: string,
) {
  // THE CUSTOMER IS `to`, NOT `from`. In an echo `from` is the business's
  // own number — resolving the contact from it would create a contact for
  // the business itself and a conversation with itself.
  const customerPhone = normalizePhone(echo.to)

  // No profile name is included in an echo payload, so the phone number
  // is the only name available for a contact we have never seen. Passing
  // '' lets findOrCreateContact fall back to the number WITHOUT
  // overwriting a good existing name with a worse one.
  const contactOutcome = await findOrCreateContact(
    accountId,
    configOwnerUserId,
    customerPhone,
    '',
  )
  if (!contactOutcome) return
  const contactRecord = contactOutcome.contact

  const convResult = await findOrCreateConversation(
    accountId,
    configOwnerUserId,
    contactRecord.id,
  )
  if (!convResult) return
  const conversation = convResult.conversation

  if (convResult.created) {
    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })
  }

  // Already stored? Then this is Meta echoing back a message THIS CRM
  // sent — the send path already wrote the row with the same wamid and
  // sender_type 'agent'. Storing it again would show the operator their
  // own message twice, once as theirs and once as if it came from the
  // phone. Checked explicitly rather than relying on upsert because the
  // unique index (migration 069) is partial, and Supabase's onConflict
  // cannot express an index predicate.
  const { data: existing } = await supabaseAdmin()
    .from('messages')
    .select('id, sender_type')
    .eq('conversation_id', conversation.id)
    .eq('message_id', echo.id)
    .maybeSingle()

  if (existing) return

  // Echo content is shaped exactly like inbound content — a property
  // named after `type` — so the existing parser is reused rather than
  // duplicated. Casting because parseMessageContent is typed for inbound
  // messages; the fields it reads are identical.
  const { contentText, mediaUrl, interactiveReplyId } = await parseMessageContent(
    echo as unknown as WhatsAppMessage,
    accessToken,
  )

  const ALLOWED_CONTENT_TYPES = new Set([
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive',
  ])
  const contentType = ALLOWED_CONTENT_TYPES.has(echo.type)
    ? echo.type
    : echo.type === 'sticker'
      ? 'image'
      : 'text'

  // A missing timestamp falls back to now. Being a few seconds out beats
  // dropping a message the operator can see on their phone.
  const sentAt = echo.timestamp
    ? new Date(parseInt(echo.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  const { error: msgError } = await supabaseAdmin().from('messages').insert({
    conversation_id: conversation.id,
    // The whole point of migration 069's fourth sender_type. Not 'agent':
    // no CRM user sent this, and folding it in would credit it to
    // whoever happened to be looked up and corrupt per-agent reporting.
    sender_type: 'business_app',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: echo.id,
    // Meta accepted it — it left the phone. Delivery/read then arrive as
    // ordinary status webhooks against the same wamid.
    status: 'sent',
    created_at: sentAt,
    interactive_reply_id: interactiveReplyId,
  })

  if (msgError) {
    // Lost a race with a concurrent delivery of the same echo. The unique
    // index did its job; nothing more to do.
    if (isUniqueViolation(msgError)) return
    console.error('[webhook][coexistence] error inserting echo:', msgError)
    return
  }

  // Refresh the preview so the conversation list is not stale, but do NOT
  // touch unread_count — see the note on handleMessageEchoes.
  const { error: convError } = await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[${echo.type}]`,
      last_message_at: sentAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  if (convError) {
    console.error('[webhook][coexistence] error updating conversation:', convError)
  }

  // Public-API subscribers get told, with a sender that names where it
  // came from — an integration reconciling its own sends needs to know
  // this was typed on a phone, not sent through the API.
  await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.sent', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: echo.id,
    content_type: contentType,
    text: contentText,
    sender_type: 'business_app',
  })
}

// ============================================================
// HISTORY BACKFILL
//
// Up to ~6 months of past chats, streamed in chunks after onboarding.
// ============================================================

/**
 * Extract content from a history message WITHOUT touching the network.
 *
 * Deliberately not `parseMessageContent`: that verifies every media id
 * against Meta before building a URL, which is right for a single live
 * message and fatal here. A backfill can carry thousands of messages and
 * this route has a 60s budget — a Meta round trip per media item would
 * time out and lose the rest of the chunk.
 *
 * So media is recorded by id, pointing at the same proxy route the live
 * path uses. If an id turns out to be dead the image simply fails to
 * load later, which is a far better outcome than dropping the import.
 */
function historyContent(message: MessageEcho | Record<string, unknown>): {
  contentType: string
  contentText: string | null
  mediaUrl: string | null
} {
  const type = String((message as Record<string, unknown>).type ?? 'text')
  const get = (key: string) =>
    (message as Record<string, unknown>)[key] as
      | Record<string, unknown>
      | undefined

  // Meta omits the contents when it is not shipping the asset in this
  // chunk. For anything older than two weeks the follow-up webhook never
  // comes, so this is stored as a visible placeholder rather than waited
  // on or silently skipped — the message DID happen and the thread should
  // show that something was there.
  if (type === 'media_placeholder') {
    return {
      contentType: 'text',
      contentText: '[Media message — not included in history export]',
      mediaUrl: null,
    }
  }

  // Meta could not export this one (e.g. code 131051, unknown type).
  if (type === 'errors' || Array.isArray((message as Record<string, unknown>).errors)) {
    return {
      contentType: 'text',
      contentText: '[Unsupported message]',
      mediaUrl: null,
    }
  }

  switch (type) {
    case 'text':
      return {
        contentType: 'text',
        contentText: (get('text')?.body as string) ?? null,
        mediaUrl: null,
      }
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
    case 'sticker': {
      const media = get(type)
      const mediaId = media?.id as string | undefined
      return {
        // Stickers have no content_type of their own in our CHECK, and
        // they are images — same mapping the live path uses.
        contentType: type === 'sticker' ? 'image' : type,
        contentText: (media?.caption as string) ?? null,
        mediaUrl: mediaId ? `/api/whatsapp/media/${mediaId}` : null,
      }
    }
    case 'location': {
      const loc = get('location')
      const name = (loc?.name as string) ?? ''
      return {
        contentType: 'location',
        contentText: name || '[Location]',
        mediaUrl: null,
      }
    }
    default:
      // Anything unrecognised is kept as text with a marker rather than
      // dropped. Losing a message from someone's history is worse than
      // rendering it plainly.
      return {
        contentType: 'text',
        contentText: `[${type}]`,
        mediaUrl: null,
      }
  }
}

/**
 * Ingest a chat-history chunk.
 *
 * ─── What this must NOT do ────────────────────────────────────────
 *
 * Every message here is from the PAST. None of the live reactions may
 * fire: no automations, no flow runner, no AI auto-reply, no unread
 * bump, no broadcast "replied" flag. Importing six months of history
 * through the live path would replay half a year of triggers in one go
 * and could send a wall of messages to every customer at once.
 *
 * That is the single biggest risk in this feature, which is why history
 * has its own insert path rather than reusing processMessage.
 */
async function handleHistory(value: unknown) {
  const parsed = parseHistory(value)
  if (!parsed) {
    console.warn('[webhook][coexistence] unusable history payload')
    return
  }

  const config = await resolveConfigByPhoneNumberId(parsed.phoneNumberId)
  if (!config) return

  // Chunks can arrive out of order, so sort by chunk_order before
  // applying. Progress is monotonic per phase and processing a later
  // chunk first would make the UI count backwards.
  const chunks = [...parsed.chunks].sort(
    (a, b) => (a.chunkOrder ?? 0) - (b.chunkOrder ?? 0),
  )

  for (const chunk of chunks) {
    // ---- The business refused, or Meta failed ----
    if (chunk.error) {
      await upsertHistoryImport(config, chunk.phase, {
        status: chunk.error.isDeclined ? 'declined' : 'failed',
        progress: 100,
        last_chunk_order: chunk.chunkOrder,
        error_code: chunk.error.code != null ? String(chunk.error.code) : null,
        error_message: chunk.error.message,
      })
      console.log(
        `[webhook][coexistence] history phase ${chunk.phase} ` +
          (chunk.error.isDeclined
            ? 'declined by the business — nothing to import'
            : `failed: ${chunk.error.message ?? 'unknown error'}`),
      )
      continue
    }

    let stored = 0
    let skipped = 0

    for (const thread of chunk.threads) {
      const result = await ingestHistoryThread(
        thread,
        config.account_id,
        config.user_id,
      )
      stored += result.stored
      skipped += result.skipped
    }

    await upsertHistoryImport(config, chunk.phase, {
      // Meta's own figure. Never computed locally — the total chunk count
      // is unknown in advance, so any local maths would disagree with it.
      progress: chunk.progress,
      last_chunk_order: chunk.chunkOrder,
      status: chunk.progress >= 100 ? 'completed' : 'running',
      threads_delta: chunk.threads.length,
      stored_delta: stored,
      skipped_delta: skipped,
    })

    console.log(
      `[webhook][coexistence] history phase ${chunk.phase} chunk ${chunk.chunkOrder ?? '?'}: ` +
        `${chunk.threads.length} thread(s), ${stored} stored, ${skipped} already present, ${chunk.progress}%`,
    )
  }
}

/**
 * Create or advance the progress row for one phase.
 *
 * Counters are applied as DELTAS read-then-written rather than as
 * absolute values, because chunks are cumulative: each one adds messages
 * to a phase that is already part-imported. Writing absolutes would make
 * the final count equal the last chunk's size instead of the total.
 */
async function upsertHistoryImport(
  config: { id: string; account_id: string },
  phase: number,
  patch: {
    status: 'running' | 'completed' | 'declined' | 'failed'
    progress: number
    last_chunk_order: number | null
    error_code?: string | null
    error_message?: string | null
    threads_delta?: number
    stored_delta?: number
    skipped_delta?: number
  },
) {
  const { data: existing } = await supabaseAdmin()
    .from('coexistence_history_imports')
    .select('id, threads_seen, messages_stored, messages_skipped, progress')
    .eq('config_id', config.id)
    .eq('phase', phase)
    .maybeSingle()

  const row = {
    account_id: config.account_id,
    config_id: config.id,
    phase,
    status: patch.status,
    // Never let progress regress. A retried or replayed chunk arriving
    // late would otherwise drag the bar backwards, which reads as the
    // import having broken.
    progress: Math.max(patch.progress, existing?.progress ?? 0),
    last_chunk_order: patch.last_chunk_order,
    error_code: patch.error_code ?? null,
    error_message: patch.error_message ?? null,
    threads_seen: (existing?.threads_seen ?? 0) + (patch.threads_delta ?? 0),
    messages_stored:
      (existing?.messages_stored ?? 0) + (patch.stored_delta ?? 0),
    messages_skipped:
      (existing?.messages_skipped ?? 0) + (patch.skipped_delta ?? 0),
  }

  const query = existing
    ? supabaseAdmin()
        .from('coexistence_history_imports')
        .update(row)
        .eq('id', existing.id)
    : supabaseAdmin().from('coexistence_history_imports').insert(row)

  const { error } = await query
  if (error) {
    // A racing chunk created the row between our read and insert. The
    // unique constraint on (config_id, phase) did its job; the next chunk
    // will pick up the existing row.
    if (!isUniqueViolation(error)) {
      console.error(
        '[webhook][coexistence] history progress write failed:',
        error.message,
      )
    }
  }
}

/**
 * Store one thread's worth of history.
 *
 * BATCHED on purpose. The naive version — check-then-insert per message —
 * is two round trips per message, and a phase can carry thousands. This
 * does one SELECT for the wamids already present and one bulk INSERT for
 * the rest, which is what keeps a large import inside the route's budget.
 */
async function ingestHistoryThread(
  thread: HistoryThread,
  accountId: string,
  configOwnerUserId: string,
): Promise<{ stored: number; skipped: number }> {
  if (thread.messages.length === 0) return { stored: 0, skipped: 0 }

  const contactOutcome = await findOrCreateContact(
    accountId,
    configOwnerUserId,
    normalizePhone(thread.customerPhone),
    // History carries no profile name, so pass '' and let the helper fall
    // back to the number rather than overwriting a better existing name.
    '',
  )
  if (!contactOutcome) return { stored: 0, skipped: 0 }

  const convResult = await findOrCreateConversation(
    accountId,
    configOwnerUserId,
    contactOutcome.contact.id,
  )
  if (!convResult) return { stored: 0, skipped: 0 }
  const conversationId = convResult.conversation.id

  // Which of these do we already hold? Covers a re-sync, an overlapping
  // chunk, and — importantly — messages the CRM itself sent or received
  // live before the backfill arrived.
  const wamids = thread.messages.map((m) => m.id)
  const { data: existingRows } = await supabaseAdmin()
    .from('messages')
    .select('message_id')
    .eq('conversation_id', conversationId)
    .in('message_id', wamids)

  const existing = new Set(
    ((existingRows ?? []) as { message_id: string }[]).map((r) => r.message_id),
  )

  const rows: Record<string, unknown>[] = []
  const seenInBatch = new Set<string>()
  for (const message of thread.messages) {
    if (existing.has(message.id)) continue
    // Meta has been observed repeating a message inside one chunk. A bulk
    // insert containing the same wamid twice would violate the unique
    // index and fail the WHOLE batch, so de-dupe in memory first.
    if (seenInBatch.has(message.id)) continue
    seenInBatch.add(message.id)

    const { contentType, contentText, mediaUrl } = historyContent(message)

    rows.push({
      conversation_id: conversationId,
      // fromMe is derived from the PRESENCE of history_context.from_me —
      // customer messages omit it rather than sending false. A historical
      // business message was typed in the Business App, hence
      // 'business_app' rather than 'agent'.
      sender_type: message.fromMe ? 'business_app' : 'customer',
      content_type: contentType,
      content_text: contentText,
      media_url: mediaUrl,
      message_id: message.id,
      status: historyStatusToMessageStatus(message.historyStatus),
      // Backdated to when it actually happened, so the thread reads in the
      // right order instead of the whole history appearing as "now".
      created_at: message.timestamp
        ? new Date(parseInt(message.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    })
  }

  const skipped = thread.messages.length - rows.length
  if (rows.length === 0) return { stored: 0, skipped }

  const { error } = await supabaseAdmin().from('messages').insert(rows)

  if (error) {
    // A concurrent chunk stored one of these first. Fall back to
    // one-at-a-time so the rest of the batch still lands — a single
    // collision must not cost thousands of messages.
    if (isUniqueViolation(error)) {
      let stored = 0
      for (const row of rows) {
        const { error: rowErr } = await supabaseAdmin()
          .from('messages')
          .insert(row)
        if (!rowErr) stored++
      }
      return { stored, skipped: thread.messages.length - stored }
    }
    console.error(
      '[webhook][coexistence] history batch insert failed:',
      error.message,
    )
    return { stored: 0, skipped: thread.messages.length }
  }

  await refreshConversationPreviewFromHistory(conversationId)

  return { stored: rows.length, skipped }
}

/**
 * Point the conversation's preview at its genuinely newest message.
 *
 * Recomputed from the table rather than taken from the chunk, because a
 * backfill is arbitrary-order OLD data. Assigning the last imported
 * message to `last_message_text` would overwrite a live conversation's
 * current preview with something from months ago — the inbox list would
 * disagree with the thread and look broken.
 *
 * Deliberately does NOT touch unread_count. These messages have all been
 * seen already; marking them unread would show a badge for six months of
 * history the operator has read on their phone.
 */
async function refreshConversationPreviewFromHistory(conversationId: string) {
  const { data: newest } = await supabaseAdmin()
    .from('messages')
    .select('content_text, content_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!newest) return

  const { error } = await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text:
        newest.content_text || `[${newest.content_type ?? 'message'}]`,
      last_message_at: newest.created_at,
    })
    .eq('id', conversationId)

  if (error) {
    console.error(
      '[webhook][coexistence] conversation preview refresh failed:',
      error.message,
    )
  }
}

// ============================================================
// ADDRESS BOOK SYNC
// ============================================================

/**
 * Stage the phone's contacts for review.
 *
 * These do NOT become CRM contacts automatically, and that is the whole
 * point. `smb_app_state_sync` sends the owner's ENTIRE address book —
 * family, friends, the plumber, every one-off number they ever saved.
 * Writing that into `contacts` would pollute the CRM permanently and
 * silently inflate every broadcast audience built from "all contacts",
 * so someone's mother receives a marketing campaign.
 *
 * A human approves them instead. The cost is one review step; the
 * alternative cannot be undone without knowing which rows came from where.
 */
async function handleAppStateSync(value: unknown) {
  const parsed = parseAppStateSync(value)
  if (!parsed) {
    console.warn('[webhook][coexistence] unusable smb_app_state_sync payload')
    return
  }

  const config = await resolveConfigByPhoneNumberId(parsed.phoneNumberId)
  if (!config) return

  let staged = 0
  let removed = 0

  for (const entry of parsed.contacts) {
    const phone = normalizePhone(entry.phone)
    if (!phone) continue

    if (entry.action === 'remove') {
      // The number left the phone's address book. Mark the STAGING row
      // only — never delete a CRM contact. The operator may have imported
      // and since built a whole relationship around it; a phonebook edit
      // is not authority to destroy CRM data.
      const { error } = await supabaseAdmin()
        .from('coexistence_staged_contacts')
        .update({ status: 'removed', reviewed_at: new Date().toISOString() })
        .eq('config_id', config.id)
        .eq('phone', phone)
        .eq('status', 'pending')
      if (error) {
        console.error(
          '[webhook][coexistence] staged contact removal failed:',
          error.message,
        )
      } else {
        removed++
      }
      continue
    }

    // Flagged so an operator reviewing hundreds of numbers can skip the
    // ones already in the CRM. Uses the shared dedupe helper, so "already
    // known" means the same thing here as everywhere else (issue #212).
    const alreadyKnown = await findExistingContact(
      supabaseAdmin(),
      config.account_id,
      phone,
    )

    const { data: existingStaged } = await supabaseAdmin()
      .from('coexistence_staged_contacts')
      .select('id, status')
      .eq('config_id', config.id)
      .eq('phone', phone)
      .maybeSingle()

    // A decision already made stays made. Re-staging a 'skipped' number
    // would re-offer the owner's family on every sync, and re-staging an
    // 'imported' one would offer a duplicate.
    if (
      existingStaged &&
      (existingStaged.status === 'skipped' ||
        existingStaged.status === 'imported')
    ) {
      continue
    }

    const row = {
      account_id: config.account_id,
      config_id: config.id,
      phone,
      phone_normalized: phone,
      full_name: entry.fullName,
      first_name: entry.firstName,
      status: 'pending',
      already_known: Boolean(alreadyKnown),
    }

    const { error } = existingStaged
      ? await supabaseAdmin()
          .from('coexistence_staged_contacts')
          .update(row)
          .eq('id', existingStaged.id)
      : await supabaseAdmin().from('coexistence_staged_contacts').insert(row)

    if (error) {
      if (!isUniqueViolation(error)) {
        console.error(
          '[webhook][coexistence] staging contact failed:',
          error.message,
        )
      }
      continue
    }
    staged++
  }

  console.log(
    `[webhook][coexistence] address book sync: ${staged} staged for review, ${removed} marked removed`,
  )
}

/**
 * Account-level lifecycle events.
 *
 * The one that matters today is a broken coexistence pairing. Meta
 * reports six different causes as the SAME event with the real reason in
 * a code, so the reason is persisted verbatim — otherwise every cause
 * looks like "disconnected", and most of them are things the operator
 * could fix in two minutes if only they were told which one happened.
 *
 * Tenancy resolves by waba_id, because this payload carries no
 * phone_number_id.
 */
async function handleAccountUpdate(wabaIdFromEntry: string, value: unknown) {
  const update = parseAccountUpdate(value)
  if (!update) return

  if (!update.isDisconnect) {
    // Informational — verification updates and the like also land on
    // account_update. Logged so it is visible, but deliberately NOT
    // treated as a disconnect: doing so would take a working number
    // offline in the UI the day Meta ships a new notification type.
    console.log(
      `[webhook][account_update] "${update.event}" — informational, no action taken`,
    )
    return
  }

  const wabaId = update.wabaId || wabaIdFromEntry
  if (!wabaId) {
    console.error('[webhook][account_update] disconnect with no resolvable waba_id')
    return
  }

  const { data: rows, error } = await supabaseAdmin()
    .from('whatsapp_config')
    .update({
      status: 'disconnected',
      disconnect_event: update.event,
      disconnect_reason: update.reason,
      disconnected_at: new Date().toISOString(),
    })
    .eq('waba_id', wabaId)
    .select('id, account_id')

  if (error) {
    console.error('[webhook][account_update] could not mark disconnected:', error.message)
    return
  }

  if (!rows || rows.length === 0) {
    console.warn(`[webhook][account_update] no config matched waba_id ${wabaId}`)
    return
  }

  console.warn(
    `[webhook][account_update] ${update.event}` +
      (update.reason ? ` (${update.reason})` : '') +
      ` — marked ${rows.length} config(s) disconnected for waba_id ${wabaId}`,
  )

  // Tell each affected account's subscribers. A disconnected number stops
  // every send silently otherwise, and an integration cannot poll for
  // something it has no idea happened.
  for (const row of rows as { id: string; account_id: string }[]) {
    await dispatchWebhookEvent(
      supabaseAdmin(),
      row.account_id,
      'whatsapp.disconnected',
      {
        event: update.event,
        reason: update.reason,
        initiated_by: update.initiatedBy,
        waba_id: wabaId,
      },
    )
  }
}

/**
 * Apply an `edit` or `revoke` to a message we already stored.
 *
 * Without this both fall through processMessage's content-type mapping to
 * 'text' and get INSERTED as new rows — so an edited message shows the
 * conversation twice with two different texts, and a deleted one adds a
 * blank bubble. Coexistence makes both common, because editing and
 * deleting are everyday phone actions.
 *
 * A mutation for a message we never stored is a no-op: WhatsApp keeps
 * history far longer than this CRM has existed for any given account.
 */
async function handleMessageMutation(
  message: WhatsAppMessage,
  accountId: string,
) {
  const edit = parseEdit(message)
  if (edit) {
    // Reuse the ordinary content parser on the replacement payload. No
    // access token is passed: re-verifying media on an edit is not worth a
    // Meta round trip, and the caption is the part that usually changed.
    const { contentText } = await parseMessageContent(
      { ...edit.newMessage, id: edit.editMessageId, type: edit.newType } as unknown as WhatsAppMessage,
      '',
    )

    const { data, error } = await supabaseAdmin()
      .from('messages')
      .update({
        content_text: contentText,
        edited_at: new Date().toISOString(),
      })
      .eq('message_id', edit.originalMessageId)
      .select('id, conversation_id')

    if (error) {
      console.error('[webhook] failed to apply message edit:', error.message)
      return
    }
    if (!data || data.length === 0) {
      console.log(
        `[webhook] edit for unknown message ${edit.originalMessageId} — ignored`,
      )
      return
    }

    // Keep the conversation preview in step, but ONLY when the edited
    // message is still the newest one in its thread. Editing an older
    // message must not overwrite the preview with text from the middle of
    // the conversation — that would make the list disagree with the
    // thread for no reason the operator could work out.
    for (const row of data as { id: string; conversation_id: string }[]) {
      const { data: newest } = await supabaseAdmin()
        .from('messages')
        .select('id')
        .eq('conversation_id', row.conversation_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (newest?.id !== row.id) continue

      await supabaseAdmin()
        .from('conversations')
        .update({ last_message_text: contentText })
        .eq('id', row.conversation_id)
    }

    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.edited', {
      whatsapp_message_id: edit.originalMessageId,
      text: contentText,
    })
    return
  }

  const revoke = parseRevoke(message)
  if (!revoke) return

  // SOFT delete. The row stays so the thread can render "This message was
  // deleted" in place — removing it would silently reflow the
  // conversation and lose the fact that something was there, and would
  // dangle any reply_to_message_id pointing at it.
  const { data, error } = await supabaseAdmin()
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('message_id', revoke.originalMessageId)
    .select('id')

  if (error) {
    console.error('[webhook] failed to apply message revoke:', error.message)
    return
  }
  if (!data || data.length === 0) {
    console.log(
      `[webhook] revoke for unknown message ${revoke.originalMessageId} — ignored`,
    )
    return
  }

  await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.deleted', {
    whatsapp_message_id: revoke.originalMessageId,
  })
}

// The happy-path status ladder — pending → sent → delivered → read →
// replied. Webhook replays must never regress a recipient back down
// this ladder.
//
// `failed` is NOT on this ladder. It's a terminal side branch that is
// only valid from the early states (pending / sent) — once Meta has
// delivered or the user has read or replied, a later "failed" status
// event is a bug in Meta's pipeline or a spoof attempt and must be
// ignored.
const RECIPIENT_STATUS_LADDER = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
] as const

function ladderLevel(s: string): number {
  const idx = (RECIPIENT_STATUS_LADDER as readonly string[]).indexOf(s)
  return idx < 0 ? -1 : idx
}

/**
 * Can a recipient transition from `current` to `incoming`?
 *   - Along the ladder, only forward moves are allowed.
 *   - `failed` is accepted only from `pending` or `sent`; it's refused
 *     once the recipient has reached any of the success states.
 */
function isValidStatusTransition(current: string, incoming: string): boolean {
  if (incoming === 'failed') {
    return current === 'pending' || current === 'sent'
  }
  if (current === 'failed') {
    return false // failed is terminal
  }
  const ci = ladderLevel(current)
  const ii = ladderLevel(incoming)
  if (ii < 0) return false // unknown incoming status
  if (ci < 0) return true // unknown current — accept anything on the ladder
  return ii > ci
}

async function handleStatusUpdate(status: {
  id: string
  status: string
  timestamp: string
  recipient_id: string
}) {
  // 1) Mirror onto messages (legacy behavior) — Meta's status values
  //    already match the CHECK constraint on messages.status. No
  //    `.select()`: message_id is NOT unique (migration 009 — Meta ids
  //    repeat across numbers), so this updates 0..N rows and must not
  //    assume a single row.
  const { error: msgErr } = await supabaseAdmin()
    .from('messages')
    .update({ status: status.status })
    .eq('message_id', status.id)

  if (msgErr) {
    console.error('Error updating message status:', msgErr)
  }

  // Webhook fan-out for this status change happens at the END of this
  // handler (after the broadcast mirror below), so a slow subscriber
  // endpoint can't delay the broadcast_recipients update.

  // 2) Mirror onto broadcast_recipients via whatsapp_message_id
  //    (added in migration 003). The aggregate trigger on
  //    broadcast_recipients re-derives the parent broadcast's
  //    sent/delivered/read/failed counts automatically.
  const tsIso = new Date(parseInt(status.timestamp) * 1000).toISOString()

  const { data: recipient, error: recFetchErr } = await supabaseAdmin()
    .from('broadcast_recipients')
    .select('id, status')
    .eq('whatsapp_message_id', status.id)
    .maybeSingle()

  if (recFetchErr) {
    console.error('Error fetching broadcast recipient:', recFetchErr)
  } else if (
    recipient &&
    // Guard transitions — forward-only on the success ladder, and
    // `failed` only from pre-delivered states.
    isValidStatusTransition(recipient.status, status.status)
  ) {
    const update: Record<string, unknown> = { status: status.status }
    if (status.status === 'sent' && !('sent_at' in update)) update.sent_at = tsIso
    if (status.status === 'delivered') update.delivered_at = tsIso
    if (status.status === 'read') update.read_at = tsIso

    const { error: recUpdateErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update(update)
      .eq('id', recipient.id)

    if (recUpdateErr) {
      console.error('Error updating broadcast recipient status:', recUpdateErr)
    }
  }

  // 3) Webhook fan-out for messages we store (inbox / API sends).
  //    Runs last so a slow subscriber can't delay the mirrors above.
  //    Bounded to one row (message_id isn't unique) purely to resolve
  //    the owning account for delivery.
  const { data: msgRow } = await supabaseAdmin()
    .from('messages')
    .select('conversation_id, conversations(account_id)')
    .eq('message_id', status.id)
    .limit(1)
    .maybeSingle()

  if (msgRow) {
    const conv = msgRow.conversations as { account_id: string } | null
    const accountId = conv?.account_id
    if (accountId) {
      await dispatchWebhookEvent(
        supabaseAdmin(),
        accountId,
        'message.status_updated',
        {
          whatsapp_message_id: status.id,
          conversation_id: msgRow.conversation_id,
          status: status.status,
        }
      )
    }
  }
}

/**
 * If an inbound message's sender is on a still-unreplied
 * broadcast_recipients row, flip it to `replied` so the reply count
 * advances on the parent broadcast.
 *
 * Runs on a best-effort basis — failures here must not break the
 * main inbound-message flow, so errors are swallowed with a log.
 */
async function flagBroadcastReplyIfAny(accountId: string, contactId: string) {
  try {
    // Most recent outbound broadcast in this account that hasn't
    // been replied to yet. Account-scoped so a shared inbox reply
    // marks the broadcast as replied regardless of which teammate
    // sent it.
    const { data: recs, error } = await supabaseAdmin()
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    const { error: updErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updErr) {
      console.error('Error marking broadcast recipient replied:', updErr)
    }
  } catch (err) {
    console.error('flagBroadcastReplyIfAny failed:', err)
  }
}

/**
 * Resolve a Meta-side message_id into the matching internal UUID, scoped
 * to one conversation. Returns null when we never received the parent
 * (e.g. a swipe-reply to a message older than this CRM install).
 */
async function lookupInternalIdByMetaId(
  metaId: string,
  conversationId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('messages')
    .select('id')
    .eq('message_id', metaId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error) {
    console.error('[webhook] lookupInternalIdByMetaId failed:', error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * Persist an inbound reaction. WhatsApp reactions are not new messages —
 * they're per-(target, actor) state. We upsert / delete on
 * `message_reactions`, never write a row into `messages`.
 *
 * Best-effort: a missing parent (we never received it) is logged and
 * skipped so the webhook still acks 200 to Meta.
 */
async function handleReaction(
  message: WhatsAppMessage,
  conversationId: string,
  contactId: string
) {
  const reaction = message.reaction
  if (!reaction?.message_id) return

  const targetInternalId = await lookupInternalIdByMetaId(
    reaction.message_id,
    conversationId
  )
  if (!targetInternalId) {
    console.warn(
      '[webhook] reaction target message not found; skipping',
      reaction.message_id
    )
    return
  }

  // Empty emoji = removal (per Meta's Cloud API spec).
  if (!reaction.emoji) {
    const { error: delError } = await supabaseAdmin()
      .from('message_reactions')
      .delete()
      .eq('message_id', targetInternalId)
      .eq('actor_type', 'customer')
      .eq('actor_id', contactId)
    if (delError) {
      console.error('[webhook] reaction delete failed:', delError.message)
    }
    return
  }

  const { error: upsertError } = await supabaseAdmin()
    .from('message_reactions')
    .upsert(
      {
        message_id: targetInternalId,
        conversation_id: conversationId,
        actor_type: 'customer',
        actor_id: contactId,
        emoji: reaction.emoji,
      },
      { onConflict: 'message_id,actor_type,actor_id' }
    )
  if (upsertError) {
    console.error('[webhook] reaction upsert failed:', upsertError.message)
  }
}

async function processMessage(
  message: WhatsAppMessage,
  contact: { profile: { name: string }; wa_id: string },
  // Tenancy. Resolved from the matched whatsapp_config row; every
  // contact / conversation / message row created downstream is
  // stamped with this so any member of the account can see it.
  accountId: string,
  // Sender-of-record for inserts that need a NOT NULL user_id FK
  // (contacts, conversations). Always the admin who saved the
  // WhatsApp config; the choice is arbitrary post-017 but stable.
  configOwnerUserId: string,
  accessToken: string
) {
  const senderPhone = normalizePhone(message.from)
  const contactName = contact.profile.name

  // Find or create contact
  const contactOutcome = await findOrCreateContact(
    accountId,
    configOwnerUserId,
    senderPhone,
    contactName
  )
  if (!contactOutcome) return
  const contactRecord = contactOutcome.contact

  // Find or create conversation
  const convResult = await findOrCreateConversation(
    accountId,
    configOwnerUserId,
    contactRecord.id
  )
  if (!convResult) return
  const conversation = convResult.conversation

  // Emit conversation.created as soon as the thread is opened — BEFORE
  // the reaction short-circuit below — so a conversation first opened by
  // a reaction still fires the event, and a subscriber always sees the
  // thread open before its first message.received.
  if (convResult.created) {
    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })
  }

  // Reactions short-circuit here — they aren't messages. We never insert
  // into `messages`, never bump unread_count, never update last_message_text.
  // Done before parseMessageContent so the media-URL fetch is skipped.
  if (message.type === 'reaction') {
    await handleReaction(message, conversation.id, contactRecord.id)
    return
  }

  // Parse message content based on type
  const { contentText, mediaUrl, mediaType, interactiveReplyId } =
    await parseMessageContent(message, accessToken)

  // Resolve swipe-reply context if present. A missing parent is fine —
  // we just store NULL and the UI renders the message without a quote.
  let replyToInternalId: string | null = null
  if (message.context?.id) {
    replyToInternalId = await lookupInternalIdByMetaId(
      message.context.id,
      conversation.id
    )
    if (!replyToInternalId) {
      console.warn(
        '[webhook] reply context parent not found:',
        message.context.id
      )
    }
  }

  // Insert message — field names MUST match the messages table schema
  // (see supabase/migrations/001_initial_schema.sql):
  //   conversation_id, sender_type, content_type, content_text,
  //   media_url, template_name, message_id, status, created_at
  // `mediaType` is intentionally unused — the schema has no media_type
  // column; the MIME type is only used to construct the proxy URL during
  // parseMessageContent. Silence the unused-var warning:
  void mediaType

  // The messages.content_type CHECK constraint (widened in migration 010
  // to add 'interactive' for button/list taps) allows:
  //   text, image, document, audio, video, location, template, interactive
  // Map incoming WhatsApp types that aren't in that list to the closest
  // allowed value so the INSERT doesn't fail with a constraint error.
  const ALLOWED_CONTENT_TYPES = new Set([
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive',
  ])
  const contentType = ALLOWED_CONTENT_TYPES.has(message.type)
    ? message.type
    : message.type === 'sticker'
      ? 'image'   // stickers are images
      : 'text'    // reaction, unknown → text fallback

  // Determine whether this is the contact's very first inbound message
  // BEFORE we insert, so the count is accurate. Covers the case where
  // the contact row already exists (manual add / CSV import) but they've
  // never messaged us before — which new_contact_created wouldn't catch.
  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  const { error: msgError } = await supabaseAdmin().from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: message.id,
    status: 'delivered',
    created_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    reply_to_message_id: replyToInternalId,
    // Only populated for content_type='interactive'. Migration 010 added
    // the column; null for every other content_type so existing inserts
    // behave identically.
    interactive_reply_id: interactiveReplyId,
  })

  if (msgError) {
    console.error('Error inserting message:', msgError)
    return
  }

  // Update conversation
  const { error: convError } = await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[${message.type}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  if (convError) {
    console.error('Error updating conversation:', convError)
  }

  // If this contact was a recent broadcast recipient, flag the reply
  // so the broadcast's `replied_count` advances (via the aggregate
  // trigger installed in migration 003).
  await flagBroadcastReplyIfAny(accountId, contactRecord.id)

  // ============================================================
  // Flow runner dispatch.
  //
  // If the runner consumes the message (it either advanced an active
  // run or started a new one), we suppress the `new_message_received`
  // + `keyword_match` automation triggers for this inbound. Customer
  // is navigating the bot menu, not sending a fresh trigger word
  // that should fork into automations.
  //
  // The relationship-level triggers (`new_contact_created`,
  // `first_inbound_message`) still fire even when consumed — those
  // are about WHO is messaging, not what they said.
  //
  // Awaited (not fire-and-forget) because we need the `consumed`
  // result before deciding whether to dispatch automations. The
  // runner has its own try/catch and never throws. Accounts with
  // no active flows take the runner's early-exit "no_match" path
  // basically for free (one indexed SELECT for the active run).
  // ============================================================
  const flowResult = await dispatchInboundToFlows({
    accountId,
    userId: configOwnerUserId,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    message:
      interactiveReplyId
        ? {
            kind: 'interactive_reply',
            reply_id: interactiveReplyId,
            reply_title: contentText ?? '',
            meta_message_id: message.id,
          }
        : {
            kind: 'text',
            text: contentText ?? message.text?.body ?? '',
            meta_message_id: message.id,
          },
    isFirstInboundMessage,
  })
  const flowConsumed = flowResult.consumed

  // Fire any automations that react to this webhook event. All dispatches
  // run here (not earlier) so the contact, conversation, and inbound
  // message all exist before any step — including send_message — runs.
  // Fire-and-forget: a slow or failing automation must not block the
  // webhook's 200 OK response to Meta.
  const inboundText = contentText ?? message.text?.body ?? ''
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
    | 'interactive_reply'
  )[] = []
  // Content-level triggers are suppressed when a flow consumed the
  // message — see the comment block above.
  if (!flowConsumed) {
    automationTriggers.push('new_message_received', 'keyword_match')
    // Interactive tap → fire the interactive_reply trigger too (only
    // meaningful when a button/list reply actually arrived). Enables
    // automation-only chained menus; when a Flow owns the menu it will
    // have consumed the reply and this is skipped.
    if (interactiveReplyId) {
      automationTriggers.push('interactive_reply')
    }
  }
  // new_contact_created fires only when the webhook just auto-created the
  // contact row. first_inbound_message fires whenever this is the contact's
  // first-ever customer-sent message — a superset that also catches
  // manually-imported contacts sending for the first time. We dispatch both
  // so users can pick whichever semantic they want; an automation that
  // listens to only one trigger runs only when that trigger matches.
  if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')
  for (const triggerType of automationTriggers) {
    runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contactRecord.id,
      context: {
        message_text: inboundText,
        conversation_id: conversation.id,
        // Only set on interactive taps; drives the interactive_reply
        // trigger's exact-id match.
        interactive_reply_id: interactiveReplyId ?? undefined,
      },
    }).catch((err) => console.error('[automations] dispatch failed:', err))
  }

  // AI auto-reply. Runs only for plain-text inbound the deterministic
  // flow runner did NOT consume (flows win over the LLM), and only when
  // the account has enabled it. Awaited inside `after()` (same reason as
  // the webhook dispatch below); `dispatchInboundToAiReply` owns its
  // eligibility gates + try/catch and never throws.
  if (!flowConsumed && !interactiveReplyId && inboundText.trim()) {
    await dispatchInboundToAiReply({
      accountId,
      conversationId: conversation.id,
      contactId: contactRecord.id,
      configOwnerUserId,
    })
  }

  // message.received webhook (public API). Awaited — not fire-and-forget
  // — because we're inside the route's `after()` block, which only keeps
  // the function alive for promises it can see; a detached promise could
  // be frozen before it delivers. `dispatchWebhookEvent` early-exits
  // when the account has no matching endpoint and never throws.
  // (conversation.created is emitted earlier, right after the thread is
  // opened.)
  await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: message.id,
    content_type: contentType,
    text: contentText,
  })
}

async function parseMessageContent(
  message: WhatsAppMessage,
  accessToken: string
): Promise<{
  contentText: string | null
  mediaUrl: string | null
  mediaType: string | null
  /**
   * For interactive button / list replies: the stable id of the tapped
   * option (whatever we put on the button when sending). Used by the
   * Flows engine to advance the per-contact run; persisted to
   * `messages.interactive_reply_id` so the inbox bubble can render the
   * tap with the right affordance. Null for everything else.
   */
  interactiveReplyId: string | null
}> {
  // getMediaUrl signature is (mediaId, accessToken) — earlier code had
  // the args swapped, so every verification hit an invalid Meta URL and
  // fell through to the catch block, leaving mediaUrl as null. That's
  // why images showed up as empty bubbles in the inbox.
  const verifyAndBuildUrl = async (
    mediaId: string
  ): Promise<string | null> => {
    try {
      await getMediaUrl({ mediaId, accessToken })
      return `/api/whatsapp/media/${mediaId}`
    } catch (error) {
      console.error(
        `Failed to verify media ${mediaId} with Meta:`,
        error instanceof Error ? error.message : error
      )
      return null
    }
  }

  // Default shape — each case overrides only the fields it cares about.
  // Keeps the new `interactiveReplyId` field DRY across every return site.
  const empty = {
    contentText: null,
    mediaUrl: null,
    mediaType: null,
    interactiveReplyId: null,
  }

  switch (message.type) {
    case 'text':
      return { ...empty, contentText: message.text?.body || null }

    case 'image':
      if (message.image?.id) {
        return {
          ...empty,
          contentText: message.image.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.image.id),
          mediaType: message.image.mime_type,
        }
      }
      return empty

    case 'video':
      if (message.video?.id) {
        return {
          ...empty,
          contentText: message.video.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.video.id),
          mediaType: message.video.mime_type,
        }
      }
      return empty

    case 'document':
      if (message.document?.id) {
        return {
          ...empty,
          contentText:
            message.document.caption || message.document.filename || null,
          mediaUrl: await verifyAndBuildUrl(message.document.id),
          mediaType: message.document.mime_type,
        }
      }
      return empty

    case 'audio':
      if (message.audio?.id) {
        return {
          ...empty,
          mediaUrl: await verifyAndBuildUrl(message.audio.id),
          mediaType: message.audio.mime_type,
        }
      }
      return empty

    case 'sticker':
      // Stickers are images under the hood. Treat them as such so the
      // MessageBubble renders the <img>. The caller maps the DB
      // content_type to 'image' for the CHECK constraint.
      if (message.sticker?.id) {
        return {
          ...empty,
          mediaUrl: await verifyAndBuildUrl(message.sticker.id),
          mediaType: message.sticker.mime_type,
        }
      }
      return empty

    case 'location':
      if (message.location) {
        const loc = message.location
        const locationText = [loc.name, loc.address, `${loc.latitude},${loc.longitude}`]
          .filter(Boolean)
          .join(' - ')
        return { ...empty, contentText: locationText }
      }
      return empty

    case 'reaction':
      return { ...empty, contentText: message.reaction?.emoji || null }

    case 'interactive': {
      // The customer tapped a reply button or a list row on a message
      // we previously sent. Meta delivers `interactive.button_reply` for
      // 3-button messages and `interactive.list_reply` for list messages.
      // Use the human-readable title as contentText so the inbox bubble
      // renders the tap legibly ("Existing customer"), and stash the
      // stable id separately so the Flows engine can route on it.
      const reply =
        message.interactive?.button_reply ?? message.interactive?.list_reply
      if (reply?.id) {
        return {
          ...empty,
          contentText: reply.title || reply.id,
          interactiveReplyId: reply.id,
        }
      }

      // A completed Meta WhatsApp Flow. Until this existed the answers
      // fell through to '[Interactive reply]' and were DISCARDED — the
      // customer filled in a form and the business received a placeholder.
      if (message.interactive?.nfm_reply) {
        const parsed = parseFlowResponse(message.interactive.nfm_reply)
        return {
          ...empty,
          contentText: parsed.text,
          // The flow_token we generated when sending, so a submission can
          // be tied back to the message that started it.
          interactiveReplyId: parsed.flowToken,
        }
      }

      return { ...empty, contentText: '[Interactive reply]' }
    }

    default:
      return {
        ...empty,
        contentText: `[Unsupported message type: ${message.type}]`,
      }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any

interface ContactOutcome {
  contact: ContactRow
  /** True when this call created the row; drives new_contact_created
   *  automation dispatch in processMessage. */
  wasCreated: boolean
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string
): Promise<ContactOutcome | null> {
  // Find an existing contact for this account by phone. The shared
  // helper pre-filters in SQL by the last-8-digit suffix (so we don't
  // pull every contact on every inbound message) then applies the
  // strict `phonesMatch` in JS on the small candidate set. The same
  // helper backs the manual contact form and CSV import, so all three
  // paths agree on what "same number" means (issue #212).
  const existingContact = await findExistingContact(
    supabaseAdmin(),
    accountId,
    phone,
  )

  if (existingContact) {
    // Update name if it changed
    if (name && name !== existingContact.name) {
      await supabaseAdmin()
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
    }
    return { contact: existingContact, wasCreated: false }
  }

  // Create new contact. account_id is the tenancy column;
  // user_id is the NOT NULL FK audit column (no inbound message
  // has a single "user who created" it — we attribute to the
  // WhatsApp config owner as a stable default).
  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
    })
    .select()
    .single()

  if (createError) {
    // Lost a race: a concurrent inbound delivery (or another path)
    // created this contact between our lookup and insert, and the
    // unique index (migration 022) rejected the duplicate. Re-resolve
    // the existing row instead of dropping the message.
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContact(supabaseAdmin(), accountId, phone)
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('Error creating contact:', createError)
    return null
  }

  return { contact: newContact, wasCreated: true }
}

async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
) {
  // Look for an existing conversation in this account, oldest-first.
  //
  // We deliberately do NOT use `.single()` here. `.single()` errors on
  // *both* 0 rows and ≥2 rows, and the old code treated any error as
  // "none found" and inserted a new row. So once two conversations
  // existed for a contact (from a race — Meta retries a delivery, or a
  // batch fans out to concurrent runs), every subsequent inbound
  // message errored on the lookup and created yet another conversation,
  // snowballing into a wall of duplicate chats (issue #363).
  //
  // Ordering oldest-first and taking one row makes the lookup resolve to
  // the same canonical survivor the dedup migration (036) keeps, so any
  // pre-existing duplicates converge instead of compounding.
  const { data: existingRows, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (findError) {
    console.error('Error finding conversation:', findError)
    return null
  }

  if (existingRows && existingRows.length > 0) {
    return { conversation: existingRows[0], created: false }
  }

  // Create new conversation. Same tenancy + audit split as
  // findOrCreateContact above.
  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    // Lost a race: a concurrent inbound delivery created the
    // conversation between our lookup and insert, and the unique index
    // (migration 036) rejected the duplicate. Re-resolve the winning
    // row instead of dropping the message — mirrors findOrCreateContact.
    if (isUniqueViolation(createError)) {
      const { data: raced } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (raced && raced.length > 0) {
        return { conversation: raced[0], created: false }
      }
    }
    console.error('Error creating conversation:', createError)
    return null
  }

  return { conversation: newConv, created: true }
}
