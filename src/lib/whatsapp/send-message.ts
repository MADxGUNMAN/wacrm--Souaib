// ============================================================
// Outbound message send — the core that both the dashboard's
// `/api/whatsapp/send` route and the public `/api/v1/messages`
// endpoint call.
//
// Given a conversation and message params, this:
//   1. validates the params for the message type,
//   2. loads the conversation + contact + WhatsApp config,
//   3. sends to Meta (with phone-variant retry + contact auto-fix),
//   4. persists the message + updates the conversation,
//   5. pauses any active Flow run for the contact (agent stepped in).
//
// It is transport-agnostic: it takes a `SupabaseClient` and an
// `accountId` and throws `SendMessageError` on failure. The callers
// own auth, rate-limiting, body parsing, and mapping the error to
// their respective response shapes (internal `{ error }` vs the v1
// envelope). Behaviour is identical to the original inline route —
// this is a straight extraction so the public endpoint can reuse it
// without duplicating ~250 lines of Meta plumbing.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveCtaUrl,
  sendInteractiveList,
  sendContactsMessage,
  sendLocationMessage,
  sendLocationRequestMessage,
  sendStickerMessage,
  MetaApiError,
  type MediaKind,
  type WhatsAppContactCard,
} from '@/lib/whatsapp/meta-api';
import {
  validateInteractivePayload,
  interactivePayloadPreviewText,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import type { MessageTemplate } from '@/types';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import {
  isMarketingCategory,
  isPhoneOptedOut,
  marketingSuppressionReason,
  recordOptOutFromSendError,
} from '@/lib/whatsapp/marketing-opt-out';

export const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const;
export const VALID_MESSAGE_TYPES = [
  'text',
  'template',
  'interactive',
  'contacts',
  'location',
  'location_request',
  'sticker',
  ...MEDIA_KINDS,
] as const;

/**
 * Typed failure with a machine `code` and a suggested HTTP `status`.
 * Callers map it to their own response shape (`toErrorResponse` for
 * the dashboard route, the v1 envelope for the public endpoint).
 */
export class SendMessageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SendMessageError';
    this.code = code;
    this.status = status;
  }
}

export interface SendMessageParams {
  conversationId: string;
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  /** Legacy positional body params (only used if messageParams.body unset). */
  templateParams?: string[];
  /** Structured template params (header/body/buttons). */
  templateMessageParams?: unknown;
  /** Structured payload for `messageType === 'interactive'`. */
  interactivePayload?: InteractiveMessagePayload | null;
  /** Structured payload for `messageType === 'contacts'`. */
  contactsPayload?: WhatsAppContactCard[] | null;
  /** Structured payload for `messageType === 'location'`. */
  location?: {
    latitude: number | string;
    longitude: number | string;
    name?: string | null;
    address?: string | null;
  } | null;
  replyToMessageId?: string | null;
  /**
   * `auth.users.id` of the human sending this, persisted to
   * `messages.sender_id` so the inbox can name them.
   *
   * Optional, and left NULL by the public API on purpose: an API key has
   * a creator, but that person did not send this message — their
   * integration did. Labelling a machine send with a human's name would
   * be worse than showing no name at all.
   */
  senderUserId?: string | null;
  /** Internal ID of the source message if this send is a forwarded / re-sent message (Phase 6). */
  forwardedFromMessageId?: string | null;
}

export interface SendMessageResult {
  /** Our `messages.id` (the persisted row). */
  messageId: string;
  /** Meta's `wamid` for the delivered message. */
  whatsappMessageId: string;
}

/**
 * Send a message in an existing conversation and persist it.
 *
 * `db` may be an RLS-scoped user client (dashboard) or the service-
 * role client (public API) — every query is filtered by `accountId`
 * either way, so tenancy holds regardless of which client is passed.
 */
/**
 * Validate the message-shape params (type, required content, caption
 * cap) independently of any DB state, throwing `SendMessageError` on a
 * bad payload. Exported so a caller can reject a malformed request
 * *before* it finds-or-creates a contact/conversation — otherwise an
 * invalid payload leaves an orphan empty conversation behind. The send
 * core calls this too, so validation can't be skipped.
 */
export function validateSendMessageParams(params: {
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
  interactivePayload?: InteractiveMessagePayload | null;
  contactsPayload?: WhatsAppContactCard[] | null;
  location?: {
    latitude: number | string;
    longitude: number | string;
    name?: string | null;
    address?: string | null;
  } | null;
}): void {
  const {
    messageType,
    contentText,
    mediaUrl,
    templateName,
    interactivePayload,
    contactsPayload,
    location,
  } = params;

  if (!messageType) {
    throw new SendMessageError('bad_request', 'message_type is required', 400);
  }

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    throw new SendMessageError(
      'bad_request',
      `Unsupported message_type "${messageType}"`,
      400
    );
  }

  if (messageType === 'text' && !contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400
    );
  }

  if (messageType === 'template' && !templateName) {
    throw new SendMessageError(
      'bad_request',
      'template_name is required for template messages',
      400
    );
  }

  // Interactive: validate the full structured payload against Meta's
  // limits up front so a bad payload 400s before we touch Meta.
  if (messageType === 'interactive') {
    const result = validateInteractivePayload(interactivePayload);
    if (!result.ok) {
      throw new SendMessageError('bad_request', result.error, 400);
    }
  }

  // Location pin: validate latitude and longitude
  if (messageType === 'location') {
    if (!location) {
      throw new SendMessageError(
        'bad_request',
        'location payload is required for location messages',
        400
      );
    }
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw new SendMessageError(
        'bad_request',
        'Invalid latitude. Must be a number between -90 and 90',
        400
      );
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      throw new SendMessageError(
        'bad_request',
        'Invalid longitude. Must be a number between -180 and 180',
        400
      );
    }
  }

  // Location request: prompt text is required
  if (messageType === 'location_request' && !contentText?.trim()) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for location_request messages',
      400
    );
  }

  // Contacts: validate array and formatted_name on each contact
  if (messageType === 'contacts') {
    if (
      !contactsPayload ||
      !Array.isArray(contactsPayload) ||
      contactsPayload.length === 0
    ) {
      throw new SendMessageError(
        'bad_request',
        'contacts array is required for contacts messages',
        400
      );
    }
    if (contactsPayload.length > 257) {
      throw new SendMessageError(
        'bad_request',
        'Meta allows a maximum of 257 contacts per message',
        400
      );
    }
    for (const c of contactsPayload) {
      if (!c.name?.formatted_name?.trim()) {
        throw new SendMessageError(
          'bad_request',
          'Each contact must have a formatted_name',
          400
        );
      }
    }
  }

  if ((isMediaKind || messageType === 'sticker') && !mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${messageType} messages`,
      400
    );
  }

  // Meta caps media captions at 1024 chars (audio carries none).
  if (
    isMediaKind &&
    messageType !== 'audio' &&
    typeof contentText === 'string' &&
    contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400
    );
  }
}

export async function sendMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  params: SendMessageParams
): Promise<SendMessageResult> {
  const {
    conversationId,
    messageType,
    contentText,
    mediaUrl,
    filename,
    templateName,
    templateLanguage,
    templateParams,
    templateMessageParams,
    interactivePayload,
    contactsPayload,
    location,
    replyToMessageId,
    senderUserId,
    forwardedFromMessageId,
  } = params;

  if (!conversationId) {
    throw new SendMessageError(
      'bad_request',
      'conversation_id is required',
      400
    );
  }

  validateSendMessageParams({
    messageType,
    contentText,
    mediaUrl,
    templateName,
    interactivePayload,
    contactsPayload,
    location,
  });

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  // Conversation + contact, account-scoped.
  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (convError || !conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404);
  }

  const contact = conversation.contact;
  if (!contact?.phone) {
    throw new SendMessageError(
      'bad_request',
      'Contact phone number not found',
      400
    );
  }

  const sanitizedPhone = sanitizePhoneForMeta(contact.phone);
  if (!isValidE164(sanitizedPhone)) {
    throw new SendMessageError(
      'bad_request',
      'Invalid phone number format',
      400
    );
  }

  // WhatsApp config, account-scoped.
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (configError || !config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  const accessToken = decrypt(config.access_token);

  // Self-heal legacy CBC ciphertexts. Fire-and-forget; idempotent.
  if (isLegacyFormat(config.access_token)) {
    void db
      .from('whatsapp_config')
      .update({ access_token: encrypt(accessToken) })
      .eq('id', config.id)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.warn(
            '[send-message] access_token GCM upgrade failed:',
            error.message
          );
        }
      });
  }

  // Resolve the reply target to its Meta message_id. The parent must
  // belong to this same conversation — otherwise a caller could quote
  // messages they can't see by guessing UUIDs.
  let contextMessageId: string | undefined;
  if (replyToMessageId) {
    const { data: parent, error: parentError } = await db
      .from('messages')
      .select('message_id, conversation_id')
      .eq('id', replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (parentError || !parent) {
      throw new SendMessageError(
        'bad_request',
        'reply_to_message_id not found in this conversation',
        400
      );
    }
    if (!parent.message_id) {
      console.warn(
        '[send-message] reply target has no Meta message_id; sending without context'
      );
    } else {
      contextMessageId = parent.message_id;
    }
  }

  // Template row (for header + button components). isMessageTemplate
  // guards against a malformed local row crashing the send-builder.
  let templateRow: MessageTemplate | null = null;
  if (messageType === 'template' && templateName) {
    const { data } = await db
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', templateName)
      .eq('language', templateLanguage || 'en_US')
      .maybeSingle();
    if (data && !isMessageTemplate(data)) {
      throw new SendMessageError(
        'template_malformed',
        'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.',
        500
      );
    }
    templateRow = data ?? null;
  }

  // ── Marketing opt-out suppression ────────────────────────────────
  // Both `/api/whatsapp/send` and `/api/v1/messages` funnel through
  // here, so this one check covers both.
  //
  // Scoped to template sends: a free-form reply inside the 24-hour
  // window is a customer-service message, not marketing, and blocking
  // an agent from answering somebody who unsubscribed would be wrong.
  //
  // Short-circuits deliberately: the suppression lookup only runs for a
  // marketing template, so an ordinary text reply costs no extra query.
  const isMarketingTemplateSend =
    messageType === 'template' && isMarketingCategory(templateRow?.category);
  if (
    isMarketingTemplateSend &&
    (await isPhoneOptedOut(db, accountId, sanitizedPhone))
  ) {
    throw new SendMessageError(
      'recipient_opted_out',
      marketingSuppressionReason(templateRow?.category),
      409
    );
  }

  const attempt = async (phone: string): Promise<string> => {
    if (messageType === 'template') {
      const result = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: templateName!,
        language: templateLanguage || 'en_US',
        template: templateRow ?? undefined,
        messageParams: templateMessageParams ?? undefined,
        params: templateParams || [],
        contextMessageId,
      });
      return result.messageId;
    }
    if (isMediaKind) {
      const result = await sendMediaMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        kind: messageType as MediaKind,
        link: mediaUrl!,
        caption: contentText || undefined,
        filename: filename || undefined,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'interactive') {
      const p = interactivePayload!;
      if (p.kind === 'buttons') {
        const result = await sendInteractiveButtons({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          bodyText: p.body,
          headerText: p.header || undefined,
          footerText: p.footer || undefined,
          buttons: p.buttons,
          contextMessageId,
        });
        return result.messageId;
      }
      if (p.kind === 'cta_url') {
        const result = await sendInteractiveCtaUrl({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          bodyText: p.body,
          buttonLabel: p.button_label,
          url: p.url,
          headerText: p.header || undefined,
          footerText: p.footer || undefined,
          contextMessageId,
        });
        return result.messageId;
      }
      const result = await sendInteractiveList({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        bodyText: p.body,
        buttonLabel: p.button_label,
        headerText: p.header || undefined,
        footerText: p.footer || undefined,
        sections: p.sections,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'contacts') {
      const result = await sendContactsMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        contacts: contactsPayload!,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'location') {
      const result = await sendLocationMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        latitude: location!.latitude,
        longitude: location!.longitude,
        name: location!.name || undefined,
        address: location!.address || undefined,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'location_request') {
      const result = await sendLocationRequestMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        bodyText: contentText!,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'sticker') {
      const result = await sendStickerMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        link: mediaUrl!,
        contextMessageId,
      });
      return result.messageId;
    }
    const result = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: contentText!,
      contextMessageId,
    });
    return result.messageId;
  };

  // Send via Meta — retry across phone-number variants if Meta rejects
  // with "recipient not in allowed list"; persist a working variant
  // back to the contact so the next send goes straight through.
  let waMessageId = '';
  let workingPhone = sanitizedPhone;
  try {
    const variants = phoneVariants(sanitizedPhone);
    let lastError: unknown = null;

    for (const variant of variants) {
      try {
        waMessageId = await attempt(variant);
        workingPhone = variant;
        lastError = null;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(message)) {
          throw err;
        }
        lastError = err;
        console.warn(
          `[send-message] variant "${variant}" rejected by Meta, trying next…`
        );
      }
    }

    if (lastError) throw lastError;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown Meta API error';
    console.error('[send-message] Meta send failed for all variants:', message);

    // Record the failure BEFORE throwing.
    //
    // This insert did not exist. The success insert further down only runs
    // once Meta accepts, so a rejected send left nothing behind: the red
    // cross in the thread was optimistic client state that disappeared on
    // refresh, and the reason lived only in a toast. Operators were left
    // with "it failed" and no way to ever find out why.
    //
    // Meta's own wording is stored verbatim rather than a paraphrase of
    // ours — see MetaApiError.operatorText for the preference order, and
    // migration 073 for why the code and details are kept alongside it.
    //
    // Deliberately best-effort: if this write fails we still throw the
    // original Meta error, because losing the audit trail must not also
    // change what the caller is told went wrong.
    // Meta error 131050 means the customer opted out of marketing at the
    // platform level. Recording it locally is what stops the next
    // broadcast rediscovering the same fact one wasted send at a time.
    await recordOptOutFromSendError(db, {
      accountId,
      phone: sanitizedPhone,
      contactId: contact.id,
      error: err,
    });

    const meta = err instanceof MetaApiError ? err : null;
    const contactsSummary =
      messageType === 'contacts' && contactsPayload?.length
        ? `👤 ${contactsPayload
            .map((c) => c.name?.formatted_name)
            .filter(Boolean)
            .join(', ')}`
        : null;
    const locationSummary =
      messageType === 'location' && location
        ? `📍 ${[location.name, location.address].filter(Boolean).join(', ') || `${location.latitude}, ${location.longitude}`}`
        : messageType === 'location_request'
          ? `📍 ${contentText || 'Location requested'}`
          : null;

    const dbContentType =
      messageType === 'location_request' ? 'interactive' : messageType;
    const storedInteractivePayload =
      messageType === 'interactive'
        ? interactivePayload
        : messageType === 'location_request'
          ? {
              type: 'location_request_message',
              body: {
                text: contentText || 'Please share your location with us.',
              },
              action: { name: 'send_location' },
            }
          : null;

    try {
      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        // Recorded on the failure row too. "Who tried to send this and
        // got an error" is exactly the question a team asks about a
        // failed message, and it is unanswerable after the fact.
        sender_id: senderUserId || null,
        content_type: dbContentType,
        content_text:
          interactivePayload?.body ??
          contactsSummary ??
          locationSummary ??
          contentText ??
          null,
        media_url: mediaUrl || null,
        template_name: templateName || null,
        interactive_payload: storedInteractivePayload,
        contacts_payload:
          messageType === 'contacts'
            ? (contactsPayload as unknown as Record<string, unknown>[])
            : null,
        latitude:
          messageType === 'location' && location
            ? Number(location.latitude)
            : null,
        longitude:
          messageType === 'location' && location
            ? Number(location.longitude)
            : null,
        location_name:
          messageType === 'location' && location ? location.name || null : null,
        location_address:
          messageType === 'location' && location
            ? location.address || null
            : null,
        // No wamid: Meta never accepted it, so there is nothing to
        // reconcile against later status webhooks.
        message_id: null,
        status: 'failed',
        reply_to_message_id: replyToMessageId || null,
        forwarded_from_message_id: forwardedFromMessageId || null,
        error_code: meta?.code != null ? String(meta.code) : 'meta_error',
        error_message: meta ? meta.operatorText : message,
        error_details: meta
          ? {
              code: meta.code,
              subcode: meta.subcode,
              type: meta.type,
              details: meta.details,
              user_title: meta.userTitle,
              user_message: meta.userMessage,
              raw_message: meta.message,
              fbtrace_id: meta.fbtraceId,
              http_status: meta.httpStatus,
            }
          : { raw_message: message },
      });
    } catch (writeErr) {
      console.error(
        '[send-message] could not record the failure reason:',
        writeErr instanceof Error ? writeErr.message : writeErr
      );
    }

    // The conversation preview is deliberately NOT updated. A message that
    // was never delivered must not become the last thing shown in the
    // conversation list, or the list starts advertising failures as
    // activity.

    throw new SendMessageError(
      'meta_error',
      `Meta API error: ${meta ? meta.operatorText : message}`,
      502
    );
  }

  if (workingPhone !== sanitizedPhone) {
    console.log(
      `[send-message] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
    );
    await db
      .from('contacts')
      .update({ phone: workingPhone })
      .eq('id', contact.id);
  }

  // Persist the sent message. Field names MUST match the messages
  // schema (see 001_initial_schema.sql).
  // Interactive messages persist the body as content_text (so the
  // conversation-list preview reads sensibly) plus the full structured
  // payload so the thread can re-render the buttons / rows.
  const interactiveBody =
    messageType === 'interactive' ? interactivePayload!.body : null;
  const contactsSummary =
    messageType === 'contacts' && contactsPayload?.length
      ? `👤 ${contactsPayload
          .map((c) => c.name?.formatted_name)
          .filter(Boolean)
          .join(', ')}`
      : null;
  const locationSummary =
    messageType === 'location' && location
      ? `📍 ${[location.name, location.address].filter(Boolean).join(', ') || `${location.latitude}, ${location.longitude}`}`
      : messageType === 'location_request'
        ? `📍 ${contentText || 'Location requested'}`
        : null;

  const dbContentType =
    messageType === 'location_request' ? 'interactive' : messageType;
  const storedInteractivePayload =
    messageType === 'interactive'
      ? interactivePayload
      : messageType === 'location_request'
        ? {
            type: 'location_request_message',
            body: {
              text: contentText || 'Please share your location with us.',
            },
            action: { name: 'send_location' },
          }
        : null;

  const { data: messageRecord, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      // Migration 075. NULL when the caller is the public API — see the
      // note on SendMessageParams.senderUserId.
      sender_id: senderUserId || null,
      content_type: dbContentType,
      content_text:
        interactiveBody ??
        contactsSummary ??
        locationSummary ??
        contentText ??
        null,
      media_url: mediaUrl || null,
      template_name: templateName || null,
      interactive_payload: storedInteractivePayload,
      contacts_payload:
        messageType === 'contacts'
          ? (contactsPayload as unknown as Record<string, unknown>[])
          : null,
      latitude:
        messageType === 'location' && location
          ? Number(location.latitude)
          : null,
      longitude:
        messageType === 'location' && location
          ? Number(location.longitude)
          : null,
      location_name:
        messageType === 'location' && location ? location.name || null : null,
      location_address:
        messageType === 'location' && location
          ? location.address || null
          : null,
      message_id: waMessageId,
      status: 'sent',
      reply_to_message_id: replyToMessageId || null,
      forwarded_from_message_id: forwardedFromMessageId || null,
    })
    .select()
    .single();

  if (msgError) {
    console.error('[send-message] error inserting sent message:', msgError);
    throw new SendMessageError(
      'db_error',
      `Message sent to Meta but failed to save to DB: ${msgError.message}`,
      500
    );
  }

  const lastMessageText =
    messageType === 'interactive'
      ? interactivePayloadPreviewText(interactivePayload!)
      : contactsSummary || locationSummary || contentText || `[${messageType}]`;

  await db
    .from('conversations')
    .update({
      last_message_text: lastMessageText,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // Pause any active Flow run for this contact — the agent stepping in
  // is the strongest "yield, human is here" signal. Best-effort.
  try {
    const { error: pauseErr } = await supabaseAdmin()
      .from('flow_runs')
      .update({
        status: 'paused_by_agent',
        ended_at: new Date().toISOString(),
        end_reason: 'agent_replied',
      })
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .eq('status', 'active');
    if (pauseErr) {
      console.error('[flows] pause-on-agent-send failed:', pauseErr.message);
    }
  } catch (err) {
    console.error(
      '[flows] pause-on-agent-send threw:',
      err instanceof Error ? err.message : err
    );
  }

  return { messageId: messageRecord.id, whatsappMessageId: waMessageId };
}
