/**
 * Meta WhatsApp Cloud API helpers.
 *
 * Every function takes a single options object (named parameters) instead
 * of positional arguments. This was a deliberate choice after the same
 * swapped-args bug was found four times in a row with the positional form
 * (e.g. `(accessToken, phoneNumberId)` vs `(phoneNumberId, accessToken)`).
 * With named params, a typo surfaces immediately as a TypeScript error
 * instead of a runtime rejection from Meta.
 */

import { META_API_BASE } from './graph-version';
import {
  DEFAULT_TEMPLATE_ANALYTICS_METRICS,
  TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS,
  type RawTemplateAnalyticsResponse,
  type TemplateAnalyticsMetric,
} from './template-analytics';

export interface MetaSendResult {
  messageId: string;
}

export interface MetaPhoneInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  /**
   * `CLOUD_API`, `ON_PREMISE` or `NOT_APPLICABLE`.
   *
   * NOTE: this does NOT identify coexistence. A coexistence number reports
   * `CLOUD_API` exactly like an ordinary Cloud API number does — verified
   * against three live numbers on this app. Use `is_on_biz_app` for that.
   */
  platform_type?: string;
  /**
   * True when this number is ALSO live on the WhatsApp Business app, i.e.
   * coexistence. This is the only field Meta exposes that separates the two,
   * and it is what makes `connection_mode` verifiable instead of inferred.
   *
   * Optional on purpose. Meta omits it on some responses, and absence must
   * never be read as `false` — see `reconcileConnectionMode`.
   */
  is_on_biz_app?: boolean;
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
    type?: string;
    error_subcode?: number;
    fbtrace_id?: string;
    /** Where Meta puts the useful specifics — often more precise than `message`. */
    error_data?: { details?: string; messaging_product?: string };
    /** Present on send failures: the human sentence shown in WhatsApp Manager. */
    error_user_title?: string;
    error_user_msg?: string;
  };
}

/**
 * A Meta rejection, with Meta's own fields preserved.
 *
 * ── Why this class exists ─────────────────────────────────────────
 *
 * `throwMetaError` used to do `throw new Error(data.error.message)`,
 * keeping only the sentence and discarding the numeric code, the subcode
 * and `error_data.details`. Those discarded fields are the ones that
 * actually identify a failure: Meta reuses generic wording across
 * unrelated causes, and `details` is frequently more specific than
 * `message` (for media and template failures it is the only place the
 * real reason appears).
 *
 * Losing them meant a failed send could only ever be reported vaguely.
 * Everything is retained now so the exact reason can be stored against
 * the message and shown to the operator verbatim.
 *
 * Extends Error, so every existing `catch (err) { err.message }` caller
 * keeps working unchanged.
 */
export class MetaApiError extends Error {
  /** Meta's numeric error code, e.g. 131042. */
  readonly code: number | null;
  readonly subcode: number | null;
  /** `error_data.details` — usually the most precise explanation. */
  readonly details: string | null;
  /** `error_user_msg` — Meta's own operator-facing sentence. */
  readonly userMessage: string | null;
  readonly userTitle: string | null;
  readonly type: string | null;
  readonly fbtraceId: string | null;
  readonly httpStatus: number;

  constructor(args: {
    message: string;
    code?: number | null;
    subcode?: number | null;
    details?: string | null;
    userMessage?: string | null;
    userTitle?: string | null;
    type?: string | null;
    fbtraceId?: string | null;
    httpStatus: number;
  }) {
    super(args.message);
    this.name = 'MetaApiError';
    this.code = args.code ?? null;
    this.subcode = args.subcode ?? null;
    this.details = args.details ?? null;
    this.userMessage = args.userMessage ?? null;
    this.userTitle = args.userTitle ?? null;
    this.type = args.type ?? null;
    this.fbtraceId = args.fbtraceId ?? null;
    this.httpStatus = args.httpStatus;
  }

  /**
   * Meta's reason, verbatim, in the most specific form available.
   *
   * Preference order matters. `error_user_msg` is what Meta itself shows
   * businesses in WhatsApp Manager, so it is the most appropriate text to
   * put in front of an operator. `error_data.details` comes next because
   * it is more precise than the generic `message`. `message` is the last
   * resort.
   *
   * Nothing here is rewritten or paraphrased — the operator sees Meta's
   * words, not ours.
   */
  get operatorText(): string {
    const primary =
      this.userMessage?.trim() || this.details?.trim() || this.message;
    return this.code ? `${primary} (Meta error ${this.code})` : primary;
  }
}

async function throwMetaError(
  response: Response,
  fallback: string
): Promise<never> {
  let message = fallback;
  let err: NonNullable<MetaErrorResponse['error']> = {};
  try {
    const data = (await response.json()) as MetaErrorResponse;
    err = data.error ?? {};
    if (err.message) message = err.message;
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  throw new MetaApiError({
    message,
    code: err.code ?? null,
    subcode: err.error_subcode ?? null,
    details: err.error_data?.details ?? null,
    userMessage: err.error_user_msg ?? null,
    userTitle: err.error_user_title ?? null,
    type: err.type ?? null,
    fbtraceId: err.fbtrace_id ?? null,
    httpStatus: response.status,
  });
}

// ============================================================
// Phone number / account
// ============================================================

export interface VerifyPhoneNumberArgs {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Verify a Meta phone number ID by fetching its public metadata.
 *
 * `platform_type` and `is_on_biz_app` are requested alongside the display
 * fields because this call already runs on every connection path, so asking
 * for them costs nothing and turns coexistence from something we infer from
 * the operator's clicks into something Meta tells us. See
 * `reconcileConnectionMode`.
 */
export async function verifyPhoneNumber(
  args: VerifyPhoneNumberArgs
): Promise<MetaPhoneInfo> {
  const { phoneNumberId, accessToken } = args;
  const url = `${META_API_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  return response.json();
}

// ============================================================
// Cloud API registration (subscription for inbound webhooks)
// ============================================================
//
// Saving a phone_number_id + access_token to whatsapp_config is NOT
// enough to receive inbound events from Meta. Two extra calls are
// required:
//
//   POST /{phone_number_id}/register
//     Subscribes the number for THIS app's webhook. Requires a
//     6-digit 2FA PIN the user previously set in Meta WhatsApp
//     Manager → Two-step verification. Without /register, inbound
//     events are routed to whichever app last claimed the number
//     (often the one that did Embedded Signup) — so a second user
//     adding a second number under the same WABA silently loses
//     every inbound message.
//
//   POST /{waba_id}/subscribed_apps
//     Subscribes the WABA itself to this app. Required exactly
//     once per WABA, but idempotent so calling on every save is
//     safe and cheap.
//
// Both calls are no-ops when already done — Meta returns success +
// the helpers below treat that as success.

export interface RegisterPhoneNumberArgs {
  phoneNumberId: string;
  accessToken: string;
  /**
   * 6-digit PIN the user set in Meta WhatsApp Manager →
   * Two-step verification. If 2FA is not enabled on the number,
   * Meta rejects /register with a clear error and the user is
   * pointed at the right setting in the UI.
   */
  pin: string;
}

export interface RegisterPhoneNumberResult {
  success: boolean;
  /**
   * True when Meta indicated the number was already registered to
   * THIS app — same outcome as a fresh registration from the
   * caller's POV, surfaced separately for logging clarity.
   */
  alreadyRegistered: boolean;
}

/**
 * Register a phone number for inbound webhook events.
 *
 * Errors that should be surfaced verbatim to the user:
 *   * Missing / wrong PIN  → "Two-step verification PIN required..."
 *   * No 2FA enabled       → "Two-factor authentication is not on..."
 *   * Number on other app  → "Number is registered to another app..."
 */
export async function registerPhoneNumber(
  args: RegisterPhoneNumberArgs
): Promise<RegisterPhoneNumberResult> {
  const { phoneNumberId, accessToken, pin } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/register`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });

  if (response.ok) {
    return { success: true, alreadyRegistered: false };
  }

  // Meta returns an error envelope with a code. Code 133005 + the
  // text "already registered" appears when the number is already
  // subscribed to this app — that's success from the caller's
  // perspective, surface it as such.
  let data: {
    error?: { message?: string; code?: number; error_subcode?: number };
  } = {};
  try {
    data = await response.json();
  } catch {
    /* keep empty */
  }
  const message = data.error?.message ?? `Meta API error: ${response.status}`;
  if (/already.*registered/i.test(message)) {
    return { success: true, alreadyRegistered: true };
  }
  throw new Error(message);
}

export interface SubscribeWabaToAppArgs {
  wabaId: string;
  accessToken: string;
}

/**
 * Subscribe the WABA to this Meta app's webhook. Idempotent — Meta
 * returns success even when the subscription already exists.
 */
export async function subscribeWabaToApp(
  args: SubscribeWabaToAppArgs
): Promise<void> {
  const { wabaId, accessToken } = args;
  const url = `${META_API_BASE}/${wabaId}/subscribed_apps`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
}

export interface GetSubscribedAppsArgs {
  wabaId: string;
  accessToken: string;
}

export interface SubscribedApp {
  whatsapp_business_api_data?: {
    id?: string;
    name?: string;
    link?: string;
  };
}

/**
 * Diagnostic — fetch the list of apps currently subscribed to this
 * WABA. The UI uses this to confirm OUR app is in the list when
 * the user clicks Verify Registration.
 */
export async function getSubscribedApps(
  args: GetSubscribedAppsArgs
): Promise<SubscribedApp[]> {
  const { wabaId, accessToken } = args;
  const url = `${META_API_BASE}/${wabaId}/subscribed_apps`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = (await response.json()) as { data?: SubscribedApp[] };
  return data.data ?? [];
}

// ============================================================
// Read Receipts & Typing Indicators (Parity Plan Phase 1)
// ============================================================

export interface MarkMessageReadArgs {
  phoneNumberId: string;
  accessToken: string;
  /** The wamid of the customer's inbound message to mark as read. */
  messageId: string;
}

export interface MarkMessageReadResult {
  success: boolean;
  /** True when Meta returned error 131009 (message >30 days old / expired) and was safely swallowed. */
  ignored?: boolean;
}

/**
 * Mark a customer's inbound message as read in WhatsApp (sends blue ticks).
 *
 * WhatsApp Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
 *
 * Marking one message as read automatically marks all earlier inbound messages
 * in the same thread. Must be sent within 30 days of message arrival.
 *
 * Tolerates Meta Error 131009 (message too old / cannot be marked as read)
 * without throwing, as an expired receipt must never block conversation opening.
 */
export async function markMessageRead(
  args: MarkMessageReadArgs
): Promise<MarkMessageReadResult> {
  const { phoneNumberId, accessToken, messageId } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return { success: true };
  }

  let data: {
    error?: { message?: string; code?: number; error_subcode?: number };
  } = {};
  try {
    data = await response.json();
  } catch {
    /* keep empty */
  }

  const code = data.error?.code;
  if (
    code === 131009 ||
    (data.error?.message &&
      /message.*old|cannot.*marked.*read/i.test(data.error.message))
  ) {
    console.warn(
      `[meta-api] markMessageRead: message ${messageId} is older than 30 days or invalid (code ${code}) — ignored`
    );
    return { success: false, ignored: true };
  }

  return await throwMetaError(
    response,
    `Meta API mark read error: ${response.status}`
  );
}

export interface SendTypingIndicatorArgs {
  phoneNumberId: string;
  accessToken: string;
  /** The wamid of the customer's inbound message. */
  messageId: string;
}

export interface SendTypingIndicatorResult {
  success: boolean;
  ignored?: boolean;
}

/**
 * Send a typing indicator for a conversation.
 *
 * WhatsApp Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
 *
 * Sends a status: 'read' with typing_indicator: { type: 'text' }.
 * Automatically dismissed when an outbound message is sent, or after 25 seconds.
 */
export async function sendTypingIndicator(
  args: SendTypingIndicatorArgs
): Promise<SendTypingIndicatorResult> {
  const { phoneNumberId, accessToken, messageId } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: {
      type: 'text',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return { success: true };
  }

  let data: { error?: { message?: string; code?: number } } = {};
  try {
    data = await response.json();
  } catch {
    /* keep empty */
  }

  const code = data.error?.code;
  if (
    code === 131009 ||
    (data.error?.message &&
      /message.*old|cannot.*marked.*read/i.test(data.error.message))
  ) {
    console.warn(
      `[meta-api] sendTypingIndicator: message ${messageId} invalid/old (code ${code}) — ignored`
    );
    return { success: false, ignored: true };
  }

  return await throwMetaError(
    response,
    `Meta API typing indicator error: ${response.status}`
  );
}

// ============================================================
// Sending
// ============================================================

export interface WhatsAppContactAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  type?: string;
}

export interface WhatsAppContactEmail {
  email?: string;
  type?: string;
}

export interface WhatsAppContactName {
  formatted_name: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  prefix?: string;
}

export interface WhatsAppContactOrg {
  company?: string;
  department?: string;
  title?: string;
}

export interface WhatsAppContactPhone {
  phone?: string;
  type?: string;
  wa_id?: string;
}

export interface WhatsAppContactUrl {
  url?: string;
  type?: string;
}

export interface WhatsAppContactCard {
  addresses?: WhatsAppContactAddress[];
  birthday?: string;
  emails?: WhatsAppContactEmail[];
  name: WhatsAppContactName;
  org?: WhatsAppContactOrg;
  phones?: WhatsAppContactPhone[];
  urls?: WhatsAppContactUrl[];
}

export interface SendContactsMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  contacts: WhatsAppContactCard[];
  contextMessageId?: string;
}

/**
 * Send a contact card message (type: 'contacts').
 *
 * WhatsApp Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/contacts-messages/
 *
 * Meta allows up to 257 contacts per message.
 * Including `wa_id` on phone numbers provides native "Message" and "Save contact"
 * buttons on the recipient's handset.
 */
export async function sendContactsMessage(
  args: SendContactsMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, contacts, contextMessageId } = args;
  if (!contacts || contacts.length === 0) {
    throw new Error('contacts array is required and must not be empty');
  }
  if (contacts.length > 257) {
    throw new Error('Meta allows a maximum of 257 contacts per message');
  }
  for (const c of contacts) {
    if (!c.name?.formatted_name?.trim()) {
      throw new Error('Each contact must have name.formatted_name');
    }
  }

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'contacts',
    contacts,
  };
  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export interface SendLocationMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  latitude: number | string;
  longitude: number | string;
  name?: string;
  address?: string;
  contextMessageId?: string;
}

/**
 * Send a location pin message (type: 'location').
 *
 * WhatsApp Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/location-messages/
 */
export async function sendLocationMessage(
  args: SendLocationMessageArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    latitude,
    longitude,
    name,
    address,
    contextMessageId,
  } = args;
  const latNum = Number(latitude);
  const lngNum = Number(longitude);
  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    throw new Error(
      `Invalid latitude: ${latitude}. Must be between -90 and 90.`
    );
  }
  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new Error(
      `Invalid longitude: ${longitude}. Must be between -180 and 180.`
    );
  }

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'location',
    location: {
      latitude: String(latitude),
      longitude: String(longitude),
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(address?.trim() ? { address: address.trim() } : {}),
    },
  };
  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export interface SendLocationRequestMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  bodyText: string;
  contextMessageId?: string;
}

/**
 * Send a customer location request message (interactive type: 'location_request_message').
 *
 * WhatsApp Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/location-request-messages/
 */
export async function sendLocationRequestMessage(
  args: SendLocationRequestMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, bodyText, contextMessageId } = args;
  if (!bodyText?.trim()) {
    throw new Error('bodyText is required for location request messages');
  }

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: {
        text: bodyText.trim(),
      },
      action: {
        name: 'send_location',
      },
    },
  };
  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export interface SendTextMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
  /** Meta's message_id of the message being replied to. Adds a `context` field
   *  so WhatsApp renders the new message as a reply with a quote preview. */
  contextMessageId?: string;
}

/**
 * Send a free-form WhatsApp text message.
 * Only works inside the 24-hour customer service window.
 */
export async function sendTextMessage(
  args: SendTextMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, text, contextMessageId } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };
  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export type MediaKind = 'image' | 'video' | 'document' | 'audio';

export interface SendMediaMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  kind: MediaKind;
  /** Public URL Meta fetches at send time. */
  link: string;
  /** Optional caption — Meta caps at 1024 chars. Documents + images + videos accept it; audio does NOT. */
  caption?: string;
  /** Document-only. Shown in the recipient's chat as the file name. Ignored for image/video/audio. */
  filename?: string;
  contextMessageId?: string;
}

/**
 * Send an image, video, document, or audio (voice note) via a public URL.
 *
 * Used by the Flows engine's `send_media` node and the inbox composer's
 * agent-initiated media sends. Mirrors `sendTextMessage` — single fetch,
 * throws on non-2xx, returns Meta's message id.
 *
 * Audio is special-cased: Meta rejects `caption` and `filename` on audio
 * messages, so we send `{ link }` only. WhatsApp auto-renders an
 * OGG/Opus file as a playable voice note (waveform) rather than a file
 * attachment.
 */
export async function sendMediaMessage(
  args: SendMediaMessageArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    kind,
    link,
    caption,
    filename,
    contextMessageId,
  } = args;
  if (!link) throw new Error('sendMediaMessage requires a link.');
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;

  // Audio accepts neither caption nor filename per Meta's spec — adding
  // either yields a 400. image/video/document accept a caption; only
  // document accepts a filename.
  const media: Record<string, unknown> = { link };
  if (caption && kind !== 'audio') media.caption = caption;
  if (kind === 'document' && filename) media.filename = filename;

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: kind,
    [kind]: media,
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export interface SendStickerMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  /** Public URL (must point to a WebP image) or uploaded Meta media ID. */
  link?: string;
  mediaId?: string;
  contextMessageId?: string;
}

/**
 * Send a sticker message (type: 'sticker').
 *
 * WhatsApp Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/sticker-messages/
 *
 * Requirements:
 * - Must be an animated or static WebP image.
 * - Static stickers <= 100 KB, animated stickers <= 500 KB.
 * - Stickers do not support captions.
 */
export async function sendStickerMessage(
  args: SendStickerMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, link, mediaId, contextMessageId } =
    args;
  if (!link && !mediaId) {
    throw new Error('sendStickerMessage requires either a link or mediaId.');
  }
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const stickerObj: Record<string, unknown> = {};
  if (mediaId) {
    stickerObj.id = mediaId;
  } else if (link) {
    stickerObj.link = link;
  }

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'sticker',
    sticker: stickerObj,
  };
  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

import type { MessageTemplate } from '@/types';
import {
  buildSendComponents,
  type SendTimeParams,
} from './template-send-builder';

export interface SendTemplateMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  language?: string;
  /**
   * Legacy body-only params. Kept for backward compat with callers
   * that haven't migrated to the structured `template` + `messageParams`
   * pair below. New callers should pass `template` so media headers
   * and URL buttons land on the send.
   */
  params?: string[];
  /**
   * The template row from message_templates. When provided, the helper
   * builds the full components array (header + body + buttons) via
   * buildSendComponents — that's the only way image/video/document
   * headers and URL-with-variable buttons actually reach the recipient.
   */
  template?: MessageTemplate;
  /**
   * Structured per-send values. Body variables go in `body`; header
   * text variables in `headerText`; media overrides in
   * `headerMediaUrl` / `headerMediaId`; URL/COPY_CODE button values
   * in `buttonParams` keyed by index.
   */
  messageParams?: SendTimeParams;
  /** Meta's message_id of the message being replied to. */
  contextMessageId?: string;
}

/**
 * Send a pre-approved WhatsApp message template. Required outside
 * the 24-hour window and for any first-touch messaging.
 *
 * Caller paths:
 *   - Legacy: pass `params: string[]` (body only). Same behaviour as
 *     before this helper learned about media + buttons.
 *   - Structured: pass `template` (and optionally `messageParams`).
 *     The full components array is built from the row so media
 *     headers + URL buttons land correctly.
 */
export async function sendTemplateMessage(
  args: SendTemplateMessageArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    templateName,
    language = 'en_US',
    params,
    template,
    messageParams,
    contextMessageId,
  } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;

  const templatePayload: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  };

  if (template) {
    const components = buildSendComponents(template, {
      // Spread rather than copying field by field. The previous version
      // listed five fields explicitly and therefore SILENTLY DROPPED
      // `offerExpiresAtMs` and `cards` when they were added to
      // SendTimeParams — a limited-time offer would have been sent with
      // no expiry and a carousel with no per-card values, no matter what
      // the caller supplied. Spreading means a new field reaches the
      // builder without needing an edit here.
      ...messageParams,
      // Legacy callers pass body values in `params`; fold them into
      // `messageParams.body` so the new path covers them too.
      body: messageParams?.body ?? params,
    });
    if (components.length > 0) {
      templatePayload.components = components;
    }
  } else if (params && params.length > 0) {
    // Legacy body-only path — no template row available.
    templatePayload.components = [
      {
        type: 'body',
        parameters: params.map((p) => ({ type: 'text', text: String(p) })),
      },
    ];
  }

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: templatePayload,
  };
  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

// ============================================================
// Resumable Upload (media handles for template headers)
// ============================================================
//
// Creating a message template with a media HEADER (image/video/
// document) requires an `example.header_handle` — Meta does NOT accept
// a plain public URL at creation time. The handle comes from the
// two-step Resumable Upload API, which is keyed on the Meta APP id (not
// the phone number / WABA):
//
//   1. POST /{app_id}/uploads?file_name&file_length&file_type&access_token
//        → { id: "upload:<session>" }
//   2. POST /{id}  (Authorization: OAuth <token>, file_offset: 0, raw bytes)
//        → { h: "<handle>" }
//
// See https://developers.facebook.com/docs/graph-api/guides/upload

export interface UploadResumableMediaArgs {
  /** Meta App id (env META_APP_ID) — resumable upload is app-scoped. */
  appId: string;
  accessToken: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Upload a file via the Resumable Upload API and return the media
 * handle to use as `example.header_handle` when creating/editing a
 * template with a media header.
 */
export async function uploadResumableMedia(
  args: UploadResumableMediaArgs
): Promise<{ handle: string }> {
  const { appId, accessToken, fileName, mimeType, bytes } = args;

  // Step 1 — open an upload session.
  const startParams = new URLSearchParams({
    file_name: fileName,
    file_length: String(bytes.byteLength),
    file_type: mimeType,
    access_token: accessToken,
  });
  const startRes = await fetch(
    `${META_API_BASE}/${appId}/uploads?${startParams.toString()}`,
    { method: 'POST' }
  );
  if (!startRes.ok) {
    await throwMetaError(
      startRes,
      `Resumable upload start failed: ${startRes.status}`
    );
  }
  const startData = (await startRes.json()) as { id?: string };
  if (!startData.id) {
    throw new Error('Resumable upload did not return a session id.');
  }

  // Step 2 — upload the bytes. Note the `OAuth` auth scheme (not Bearer)
  // and the file_offset header, both required by this endpoint.
  const uploadRes = await fetch(`${META_API_BASE}/${startData.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: '0',
    },
    // Uint8Array is a valid BodyInit at runtime; cast around the
    // lib.dom ArrayBufferLike-vs-ArrayBuffer generic mismatch.
    body: bytes as unknown as BodyInit,
  });
  if (!uploadRes.ok) {
    await throwMetaError(
      uploadRes,
      `Resumable upload failed: ${uploadRes.status}`
    );
  }
  const uploadData = (await uploadRes.json()) as { h?: string };
  if (!uploadData.h) {
    throw new Error('Resumable upload did not return a file handle.');
  }
  return { handle: uploadData.h };
}

// ============================================================
// Template submission (Business Management API)
// ============================================================

import type { MetaTemplateSubmitPayload } from './template-components';

export interface SubmitMessageTemplateArgs {
  wabaId: string;
  accessToken: string;
  payload: MetaTemplateSubmitPayload;
}

export interface SubmitMessageTemplateResult {
  id: string;
  status: string;
  category?: string;
}

/**
 * Submit a message template to Meta for approval.
 *
 * Returns Meta's assigned template id + initial status (typically
 * PENDING). Caller persists `id` as `meta_template_id` so the
 * upcoming edit/delete flows can scope to this exact template (and
 * language variant) via `hsm_id`, rather than nuking every variant
 * with the same name.
 *
 * 429s from Meta (rate limit: 100 creates/hour/WABA) surface as a
 * regular `Error('Meta API error: 429')`. The route handler
 * distinguishes 429 and shows a more actionable toast.
 */
export async function submitMessageTemplate(
  args: SubmitMessageTemplateArgs
): Promise<SubmitMessageTemplateResult> {
  const { wabaId, accessToken, payload } = args;
  const url = `${META_API_BASE}/${wabaId}/message_templates`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  if (!data?.id) {
    throw new Error('Meta accepted the template but returned no id.');
  }
  return {
    id: String(data.id),
    status: typeof data.status === 'string' ? data.status : 'PENDING',
    category: typeof data.category === 'string' ? data.category : undefined,
  };
}

// ============================================================
// Template Library (Meta's pre-written templates)
// ============================================================
//
// Meta maintains a library of ready-made UTILITY and AUTHENTICATION
// templates for common cases — delivery updates, payment reminders and so
// on. They are PRE-CATEGORISED, which is the real draw: a template you
// write yourself can be re-categorised as Marketing by Meta's classifier
// and cost more to send, while a library template's category is settled.
//
// The content is FIXED and cannot be edited. All you supply is your own
// template name, the language, and the button details (your URL, your
// phone number). Anything else means writing a normal template instead.
//
// https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/utility-templates

export interface LibraryTemplateButton {
  /** URL, PHONE_NUMBER, QUICK_REPLY, FLOW, … */
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
}

export interface LibraryTemplate {
  id: string;
  /** The library's own name — this is what `library_template_name` takes. */
  name: string;
  language: string;
  category: string;
  topic?: string;
  usecase?: string;
  industry?: string[];
  /** Fixed wording, with {{n}} where your values go. */
  body?: string;
  /** Meta's own sample values, one per {{n}}. */
  body_params?: string[];
  /** TEXT | ADDRESS | AMOUNT | DATE | PHONE_NUMBER | EMAIL | NUMBER. */
  body_param_types?: string[];
  header?: string;
  footer?: string;
  buttons?: LibraryTemplateButton[];
}

export interface ListTemplateLibraryArgs {
  wabaId: string;
  accessToken: string;
  /** Substring match across the library template's content and name. */
  search?: string;
  /** ACCOUNT_UPDATE | CUSTOMER_FEEDBACK | ORDER_MANAGEMENT | PAYMENTS. */
  topic?: string;
  usecase?: string;
  /** E_COMMERCE | FINANCIAL_SERVICES. */
  industry?: string;
  language?: string;
}

/**
 * Browse Meta's Template Library.
 *
 * Filters are passed straight through as query parameters; an unknown or
 * misspelled enum returns an empty list rather than an error, so the UI
 * says "nothing matched" rather than inventing a reason.
 */
export async function listTemplateLibrary(
  args: ListTemplateLibraryArgs
): Promise<LibraryTemplate[]> {
  const { wabaId, accessToken, search, topic, usecase, industry, language } =
    args;

  const query = new URLSearchParams();
  if (search?.trim()) query.set('search', search.trim());
  if (topic) query.set('topic', topic);
  if (usecase) query.set('usecase', usecase);
  if (industry) query.set('industry', industry);
  if (language) query.set('language', language);
  query.set('limit', '200');

  const url = `${META_API_BASE}/${wabaId}/message_template_library?${query.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];

  return rows
    .filter((t: unknown): t is Record<string, unknown> => Boolean(t))
    .map((t: Record<string, unknown>) => ({
      id: String(t.id ?? ''),
      name: typeof t.name === 'string' ? t.name : '',
      language: typeof t.language === 'string' ? t.language : '',
      category: typeof t.category === 'string' ? t.category : 'UTILITY',
      topic: typeof t.topic === 'string' ? t.topic : undefined,
      usecase: typeof t.usecase === 'string' ? t.usecase : undefined,
      industry: Array.isArray(t.industry)
        ? (t.industry as string[])
        : undefined,
      body: typeof t.body === 'string' ? t.body : undefined,
      body_params: Array.isArray(t.body_params)
        ? (t.body_params as string[])
        : undefined,
      body_param_types: Array.isArray(t.body_param_types)
        ? (t.body_param_types as string[])
        : undefined,
      header: typeof t.header === 'string' ? t.header : undefined,
      footer: typeof t.footer === 'string' ? t.footer : undefined,
      buttons: Array.isArray(t.buttons)
        ? (t.buttons as LibraryTemplateButton[])
        : undefined,
    }))
    .filter((t: LibraryTemplate) => t.name !== '');
}

/**
 * One button's details, supplied by the business at creation.
 *
 * A URL button takes a base URL plus an example of the filled-in form,
 * because the library template's URL carries a `{{1}}` suffix.
 */
export type LibraryButtonInput =
  | {
      type: 'URL';
      url: { base_url: string; url_suffix_example: string };
    }
  | { type: 'PHONE_NUMBER'; phone_number: string };

export interface SubmitLibraryTemplateArgs {
  wabaId: string;
  accessToken: string;
  /** Your name for the new template. */
  name: string;
  language: string;
  /** The library template's own name, from listTemplateLibrary. */
  libraryTemplateName: string;
  category?: 'UTILITY' | 'AUTHENTICATION';
  buttonInputs?: LibraryButtonInput[];
}

/**
 * Create a template from the Template Library.
 *
 * Same endpoint as a normal create, but the body carries
 * `library_template_name` INSTEAD of components — Meta supplies those.
 * Sending components alongside it is what makes this fail confusingly, so
 * this helper does not accept any.
 *
 * `library_template_button_inputs` is sent as a real ARRAY. Meta's
 * documentation types it as an array of objects but its own example shows
 * a quoted string containing single-quoted JSON, which is not valid JSON
 * at all; the array form is what the Graph API parses. Noted because the
 * example is the first thing anyone debugging this will find.
 */
export async function submitLibraryTemplate(
  args: SubmitLibraryTemplateArgs
): Promise<SubmitMessageTemplateResult> {
  const {
    wabaId,
    accessToken,
    name,
    language,
    libraryTemplateName,
    category = 'UTILITY',
    buttonInputs,
  } = args;

  const body: Record<string, unknown> = {
    name,
    language,
    category,
    library_template_name: libraryTemplateName,
  };
  if (buttonInputs && buttonInputs.length > 0) {
    body.library_template_button_inputs = buttonInputs;
  }

  const response = await fetch(`${META_API_BASE}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  if (!data?.id) {
    throw new Error('Meta accepted the template but returned no id.');
  }
  return {
    id: String(data.id),
    // Library templates are frequently APPROVED immediately, since the
    // wording is already reviewed. Do not assume PENDING.
    status: typeof data.status === 'string' ? data.status : 'PENDING',
    category: typeof data.category === 'string' ? data.category : undefined,
  };
}

export interface FetchMessageTemplateArgs {
  wabaId: string;
  accessToken: string;
  name: string;
  language?: string;
}

export interface FetchedMessageTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown[];
  library_template_name?: string;
}

/**
 * Read one template back from Meta by name.
 *
 * Used after creating from the Template Library, where the create response
 * carries only an id: the components are Meta's, so the only way to store
 * what was actually created — rather than a local guess at the library
 * wording — is to ask for it. Guessing would leave the preview and the
 * broadcast body showing something Meta never approved.
 */
export async function fetchMessageTemplateByName(
  args: FetchMessageTemplateArgs
): Promise<FetchedMessageTemplate | null> {
  const { wabaId, accessToken, name, language } = args;
  const url = `${META_API_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(
    name
  )}&fields=id,name,language,status,category,components,library_template_name&limit=50`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  const rows: Record<string, unknown>[] = Array.isArray(data?.data)
    ? data.data
    : [];

  // `name=` is a filter, not an exact lookup — Meta returns every language
  // variant, and can return near-matches. Pick the exact pair.
  const hit =
    rows.find(
      (r) => r.name === name && (language ? r.language === language : true)
    ) ?? null;
  if (!hit) return null;

  return {
    id: String(hit.id ?? ''),
    name: String(hit.name ?? ''),
    language: String(hit.language ?? ''),
    status: typeof hit.status === 'string' ? hit.status : 'PENDING',
    category: typeof hit.category === 'string' ? hit.category : 'UTILITY',
    components: Array.isArray(hit.components) ? hit.components : [],
    library_template_name:
      typeof hit.library_template_name === 'string'
        ? hit.library_template_name
        : undefined,
  };
}

// ============================================================
// Account-level analytics (WABA node fields)
// ============================================================
//
// These four all read the SAME node with different `fields` specs, using
// Meta's dotted-filter syntax:
//
//   GET /{waba-id}?fields=analytics.start(X).end(Y).granularity(DAY)
//
// They are four separate functions, and the route calls them in
// parallel with allSettled, deliberately: bundling them into one
// comma-separated `fields` request would be one round trip instead of
// four, but any single unavailable metric (calling not enabled, cost
// withheld on a partner credit line) fails the WHOLE request and blanks
// an entire dashboard. Isolation is worth the extra calls.
//
// Filter-syntax note: each function mirrors the array form used in
// Meta's own documented example for THAT field — bracketed and quoted
// for conversation_analytics, bare comma-separated for
// pricing_analytics. Meta is inconsistent here and the safest choice is
// to copy its own examples rather than normalise them.

export interface WabaAnalyticsArgs {
  wabaId: string;
  accessToken: string;
  /** UNIX seconds, inclusive. */
  startSec: number;
  /** UNIX seconds, exclusive. */
  endSec: number;
  /** DAY/MONTH for messaging; DAILY/MONTHLY for the rest. */
  granularity: string;
}

/**
 * Read one dotted-filter field off the WABA node, following pagination.
 *
 * These fields paginate too, and with the same trap as
 * template_analytics: the first page carries the OLDEST buckets, so
 * reading one page makes a long window report less than a short one.
 * Pages are merged into the field's own shape — `data_points` for
 * messaging and call analytics, `data[]` groups for conversation and
 * pricing analytics — so the parsers see one complete payload.
 */
async function fetchWabaAnalyticsField(args: {
  wabaId: string;
  accessToken: string;
  fieldSpec: string;
  field: string;
}): Promise<unknown> {
  const { wabaId, accessToken, fieldSpec, field } = args;
  const params = new URLSearchParams({ fields: fieldSpec });

  let nextUrl: string | null =
    `${META_API_BASE}/${wabaId}?${params.toString()}`;
  const PAGE_CAP = 25;
  let page = 0;

  /** The first page's field object, used as the shape to merge into. */
  let merged: Record<string, unknown> | null = null;
  const dataPoints: unknown[] = [];
  const groups: unknown[] = [];

  while (nextUrl && page < PAGE_CAP) {
    page++;
    const response: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      await throwMetaError(response, `Meta API error: ${response.status}`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    const payload = body[field];
    if (!payload || typeof payload !== 'object') break;

    const obj = payload as Record<string, unknown>;
    if (!merged) merged = { ...obj };
    if (Array.isArray(obj.data_points)) dataPoints.push(...obj.data_points);
    if (Array.isArray(obj.data)) groups.push(...obj.data);

    // Paging can sit on the field object or, for a plain field
    // expansion, on the response root.
    const fieldPaging = obj.paging as { next?: string } | undefined;
    const rootPaging = body.paging as { next?: string } | undefined;
    nextUrl = fieldPaging?.next ?? rootPaging?.next ?? null;
  }

  if (!merged) return null;
  if (dataPoints.length > 0) merged.data_points = dataPoints;
  if (groups.length > 0) merged.data = groups;
  return merged;
}

/** Sent/delivered message counts. Granularity: HALF_HOUR | DAY | MONTH. */
export async function fetchMessagingAnalytics(
  args: WabaAnalyticsArgs
): Promise<unknown> {
  const { wabaId, accessToken, startSec, endSec, granularity } = args;
  return fetchWabaAnalyticsField({
    wabaId,
    accessToken,
    field: 'analytics',
    fieldSpec: `analytics.start(${startSec}).end(${endSec}).granularity(${granularity})`,
  });
}

/**
 * Conversation counts and cost, broken down every way Meta offers.
 *
 * Note this measures 24-hour CONVERSATIONS, not messages. Meta moved
 * most accounts to per-message pricing in July 2025, so on a newer
 * account this can legitimately return nothing while pricing_analytics
 * is full — which is why the two are presented separately rather than
 * reconciled into one "cost" figure.
 */
export async function fetchConversationAnalytics(
  args: WabaAnalyticsArgs
): Promise<unknown> {
  const { wabaId, accessToken, startSec, endSec, granularity } = args;
  const dimensions =
    '["CONVERSATION_CATEGORY","CONVERSATION_TYPE","CONVERSATION_DIRECTION","COUNTRY"]';
  return fetchWabaAnalyticsField({
    wabaId,
    accessToken,
    field: 'conversation_analytics',
    // metric_types omitted on purpose: Meta returns every available
    // metric when it is absent, and asking for COST alone throws
    // outright on partner-billed WABAs.
    fieldSpec: `conversation_analytics.start(${startSec}).end(${endSec}).granularity(${granularity}).phone_numbers([]).dimensions(${dimensions})`,
  });
}

/** Per-message volume and cost by category, type, country and tier. */
export async function fetchPricingAnalytics(
  args: WabaAnalyticsArgs
): Promise<unknown> {
  const { wabaId, accessToken, startSec, endSec, granularity } = args;
  return fetchWabaAnalyticsField({
    wabaId,
    accessToken,
    field: 'pricing_analytics',
    // PHONE is deliberately NOT requested. Every extra dimension
    // multiplies the number of data points Meta returns, and a per-number
    // split is not shown anywhere — asking for it only made a year-long
    // daily response larger for no benefit.
    fieldSpec: `pricing_analytics.start(${startSec}).end(${endSec}).granularity(${granularity}).dimensions(PRICING_CATEGORY,PRICING_TYPE,TIER,COUNTRY)`,
  });
}

/**
 * Call count, cost and average duration.
 *
 * Only meaningful once WhatsApp Business Calling is enabled on a number;
 * otherwise Meta may reject the field outright. Callers treat a failure
 * here as "section unavailable", never as a page-level error.
 */
export async function fetchCallAnalytics(
  args: WabaAnalyticsArgs
): Promise<unknown> {
  const { wabaId, accessToken, startSec, endSec, granularity } = args;
  return fetchWabaAnalyticsField({
    wabaId,
    accessToken,
    field: 'call_analytics',
    fieldSpec: `call_analytics.start(${startSec}).end(${endSec}).granularity(${granularity})`,
  });
}

// ============================================================
// Template analytics
// ============================================================

export interface FetchTemplateAnalyticsArgs {
  wabaId: string;
  accessToken: string;
  /** Meta template ids (`meta_template_id`), not our row ids. Max 10. */
  templateIds: string[];
  /** UNIX seconds, 00:00 UTC. See resolveAnalyticsWindow. */
  startSec: number;
  /** UNIX seconds, exclusive. */
  endSec: number;
  metricTypes?: TemplateAnalyticsMetric[];
}

/**
 * Read per-template send/delivery/read/click counts from Meta.
 *
 * Returns the raw response; `normalizeTemplateAnalytics` in
 * template-analytics.ts turns it into totals and a daily series. The
 * split keeps the awkward parts of the payload — uniques mixed into the
 * `clicked` array, cost absent on partner credit lines — in a pure
 * function that can be reasoned about without a network call.
 *
 * Two parameter-encoding details that Meta is strict about:
 *   • `template_ids` must be a bracketed array literal — `[123,456]`.
 *     A bare `123` is rejected.
 *   • `granularity` must be exactly DAILY. There is no hourly option.
 *
 * Requires template analytics to have been enabled on the WABA
 * (`enableTemplateInsights`); until then Meta answers every request with
 * error 200005 / subcode 4182002 regardless of the parameters.
 */
export async function fetchTemplateAnalytics(
  args: FetchTemplateAnalyticsArgs
): Promise<RawTemplateAnalyticsResponse> {
  const {
    wabaId,
    accessToken,
    templateIds,
    startSec,
    endSec,
    metricTypes = DEFAULT_TEMPLATE_ANALYTICS_METRICS,
  } = args;

  if (templateIds.length === 0) {
    throw new Error(
      'fetchTemplateAnalytics requires at least one template id.'
    );
  }
  if (templateIds.length > TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS) {
    throw new Error(
      `Meta accepts at most ${TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS} template ids per analytics request (got ${templateIds.length}).`
    );
  }

  const params = new URLSearchParams({
    start: String(startSec),
    end: String(endSec),
    granularity: 'DAILY',
    // Bracketed literal, per Meta's own documented example. URLSearchParams
    // percent-encodes the brackets and commas, which Graph accepts.
    template_ids: `[${templateIds.join(',')}]`,
    metric_types: metricTypes.join(','),
  });

  // ─── Pagination is NOT optional here ──────────────────────────
  //
  // Meta paginates template_analytics with cursors, and the FIRST page
  // holds the OLDEST days in the requested range. Reading only page one
  // therefore does not return "less detail", it returns the wrong end of
  // the window: a 30-day request came back with two sends from three
  // weeks ago while silently dropping three sends from yesterday that a
  // 7-day request over the same data reported fine.
  //
  // That is what made a wider window show a SMALLER total than a
  // narrower one — the single most trust-destroying way for an analytics
  // screen to be wrong, because both numbers look plausible in
  // isolation. Every page is followed and the groups concatenated;
  // normalizeTemplateAnalytics already flattens groups, so the merged
  // response parses identically to a single-page one.
  let nextUrl: string | null =
    `${META_API_BASE}/${wabaId}/template_analytics?${params.toString()}`;
  const groups: NonNullable<RawTemplateAnalyticsResponse['data']> = [];
  // Same guard as the template sync loop: a cursor that never terminates
  // must not become an infinite request loop.
  const PAGE_CAP = 25;
  let page = 0;

  while (nextUrl && page < PAGE_CAP) {
    page++;
    const response: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      await throwMetaError(response, `Meta API error: ${response.status}`);
    }
    const body = (await response.json()) as RawTemplateAnalyticsResponse & {
      paging?: { next?: string };
    };
    if (Array.isArray(body.data)) groups.push(...body.data);
    nextUrl = body.paging?.next ?? null;
  }

  return { data: groups };
}

/**
 * Read template analytics across a range, in slices Meta will answer.
 *
 * ─── Why slicing is necessary ─────────────────────────────────────
 *
 * Meta documents a 90-day lookback, but in practice a request spanning
 * the full 90 days can come back completely empty on an account whose
 * 7-day and 30-day requests return data perfectly. The observed shape is
 * "narrow windows answer, wide windows do not" — which made a Spent
 * column disappear entirely the moment the list switched from a 30-day
 * request to a 90-day one.
 *
 * Rather than trusting one wide request, the range is walked in slices
 * of `sliceDays` and the groups concatenated. `normalizeTemplateAnalytics`
 * flattens groups, so the merged result parses exactly like a single
 * response, and totals are unaffected by where the slice boundaries fall
 * because each data point still lands in its own day bucket.
 *
 * Partial success beats failure here: if some slices answer and others
 * error, the answered ones are returned. Only a total failure throws, so
 * a genuine problem (insights not enabled, bad token) still surfaces
 * instead of silently rendering as "no data".
 */
export async function fetchTemplateAnalyticsWindowed(
  args: FetchTemplateAnalyticsArgs & { sliceDays?: number }
): Promise<RawTemplateAnalyticsResponse> {
  const { startSec, endSec, sliceDays = 30, ...rest } = args;
  const SECONDS_PER_DAY = 86_400;
  const step = Math.max(1, sliceDays) * SECONDS_PER_DAY;

  // Slices run in PARALLEL. Sequentially, a 90-day window over 8
  // templates was ~30 round trips end to end (Meta paginates at 25 data
  // points per page), which is how a page load reached two minutes.
  // They are independent ranges, so there is no ordering requirement.
  const slices: { from: number; to: number }[] = [];
  for (let from = startSec; from < endSec; from += step) {
    slices.push({ from, to: Math.min(from + step, endSec) });
  }

  const settled = await Promise.allSettled(
    slices.map((slice) =>
      fetchTemplateAnalytics({
        ...rest,
        startSec: slice.from,
        endSec: slice.to,
      })
    )
  );

  const groups: NonNullable<RawTemplateAnalyticsResponse['data']> = [];
  const errors: unknown[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      if (Array.isArray(result.value.data)) groups.push(...result.value.data);
    } else {
      errors.push(result.reason);
    }
  }

  if (groups.length === 0 && errors.length > 0) throw errors[0];
  return { data: groups };
}

/**
 * Turn on template analytics for a WABA.
 *
 * Meta captures nothing until this is confirmed, so a brand-new account
 * sees empty insights forever without it. Confirming also opts the
 * account into Meta's link tracking and anonymised chat analysis, which
 * is why this is a deliberate action behind a button rather than
 * something the app does silently on first view.
 *
 * One-way: Meta does not allow disabling it again afterwards.
 */
export async function enableTemplateInsights(args: {
  wabaId: string;
  accessToken: string;
}): Promise<void> {
  const { wabaId, accessToken } = args;
  const response = await fetch(
    `${META_API_BASE}/${wabaId}?is_enabled_for_insights=true`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
}

/**
 * Read whether template analytics are switched on for a WABA.
 *
 * ─── Why this exists alongside the error classifier ───────────────
 *
 * Asking the WABA directly is authoritative; inferring the state from a
 * failed analytics call is not. Meta was observed answering
 * `template_analytics` on a WABA with insights off using code **1**
 * (generic `API Unknown`) and putting the real explanation in
 * `error_user_msg` — so the code/subcode pair the classifier was built
 * around (200005 / 4182002) never appeared, and the app reported a
 * fixable setting as an unexplained failure.
 *
 * One field on one node, so it is cheap enough to use as a follow-up
 * question whenever a window comes back empty.
 *
 * Returns null when the flag could not be read (bad token, network,
 * Meta withholding the field). Null means "unknown" and callers must
 * treat it as such — claiming insights are off when we could not check
 * would push the operator at an irreversible switch for no reason.
 */
export async function fetchInsightsEnabled(args: {
  wabaId: string;
  accessToken: string;
}): Promise<boolean | null> {
  const { wabaId, accessToken } = args;
  try {
    const response = await fetch(
      `${META_API_BASE}/${wabaId}?fields=is_enabled_for_insights`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      is_enabled_for_insights?: unknown;
    };
    return typeof body.is_enabled_for_insights === 'boolean'
      ? body.is_enabled_for_insights
      : null;
  } catch {
    return null;
  }
}

/**
 * True when Meta is refusing analytics because insights were never
 * confirmed for this WABA, rather than because the request was wrong.
 *
 * Codes are checked first because they are stable. The wording check is
 * a fallback, and it deliberately reads every text field Meta might have
 * put the reason in — `error_user_msg` and `error_data.details` as well
 * as `message`.
 *
 * Testing only `message` was the bug: Meta sent "Template insights have
 * not been enabled for this WhatsApp Business account." as
 * `error_user_msg` under the generic code 1, so a classifier looking at
 * `message` alone for the phrase "are not available" matched nothing and
 * the operator got no route to the fix.
 *
 * Prefer `fetchInsightsEnabled` where an extra request is acceptable —
 * a flag beats a sentence.
 */
export function isTemplateInsightsDisabledError(error: unknown): boolean {
  const candidates: string[] = [];
  if (error instanceof MetaApiError) {
    if (error.subcode === 4182002) return true;
    if (error.code === 200005) return true;
    if (error.userMessage) candidates.push(error.userMessage);
    if (error.details) candidates.push(error.details);
  }
  if (error instanceof Error) candidates.push(error.message);

  // "insights" plus any of Meta's ways of saying off. Kept narrow enough
  // that an unrelated failure mentioning insights in passing does not
  // send the operator to an irreversible switch.
  return candidates.some((text) =>
    /insights?\b[\s\S]*\b(not (?:been )?enabled|not available|not turned on|disabled)/i.test(
      text
    )
  );
}

/**
 * Is this Meta's refusal to run an operation on a Coexistence number?
 *
 * Meta calls a number that also lives on the WhatsApp Business phone app an
 * "SMB business type", and refuses template analytics on one outright:
 *
 *   (#10) This operation can not be performed on SMB business type
 *
 * This is a PERMANENT product limit, not a setting. Template insights are
 * only available on pure Cloud API numbers, so on a Coexistence number the
 * enable call can never succeed no matter how often it is retried, who is
 * signed in, or what is changed in WhatsApp Manager.
 *
 * Verified across all five WABAs on this installation: both Coexistence ones
 * report `is_enabled_for_insights: false` and answer the enable call with #10,
 * while all three Cloud API ones report `true`.
 *
 * Kept separate from `isTemplateInsightsDisabledError` because the two lead to
 * opposite UI: that one means "you can switch this on", this one means "no one
 * can, stop offering it".
 */
export function isSmbBusinessTypeError(error: unknown): boolean {
  const candidates: string[] = [];
  if (error instanceof MetaApiError) {
    // Code 10 is Meta's generic "permission denied for this operation", so it
    // is matched together with the SMB wording rather than on its own — other
    // refusals share the code and must not be reported as a Coexistence limit.
    if (error.message) candidates.push(error.message);
    if (error.userMessage) candidates.push(error.userMessage);
    if (error.details) candidates.push(error.details);
  }
  if (error instanceof Error) candidates.push(error.message);

  return candidates.some((text) => /\bSMB\b[\s\S]*business\s*type/i.test(text));
}

/**
 * The one honest explanation for a Coexistence number, shared by every
 * surface so they cannot drift apart.
 *
 * Names where the numbers CAN be seen, because "not supported" on its own
 * reads as a dead end when the data does in fact exist in two other places.
 */
export const SMB_INSIGHTS_UNSUPPORTED_MESSAGE =
  'Meta does not support template insights on numbers connected through the WhatsApp Business app (Coexistence). ' +
  'This is a permanent Meta limitation for this connection type, not a setting — it cannot be switched on from here or in WhatsApp Manager. ' +
  'Delivery and read rates for your sends are still available in this CRM under Broadcasts, and per-template stats are in the WhatsApp Business app on your phone under Settings → Business tools → Statistics.';

// ============================================================
// WhatsApp Flows (WABA assets)
// ============================================================
//
// IMPORTANT, because the naming collides with this app's own feature:
// these are META's WhatsApp Flows — multi-screen forms that open inside
// WhatsApp, built in Meta's Flow Builder and living on the WABA. They are
// NOT the `flows` table behind /flows in this app, which is an in-house
// chatbot graph driven by ordinary interactive messages.
//
// A template FLOW button can only reference a Meta Flow, by its Flow ID.
// There is no way to point one at an internal automation, which is why
// the operator picks from this list rather than from /flows.
//
// https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi

export interface MetaFlowSummary {
  id: string;
  name: string;
  /**
   * DRAFT | PUBLISHED | DEPRECATED | BLOCKED | THROTTLED.
   *
   * Only PUBLISHED can be sent to customers. A DRAFT Flow is sendable
   * only in test mode, which templates do not use — so offering one for
   * a template would produce an approved template that fails on send.
   */
  status: string;
  categories?: string[];
  validation_errors?: unknown[];
}

export interface ListWhatsAppFlowsArgs {
  wabaId: string;
  accessToken: string;
}

/**
 * List the Flows on a WhatsApp Business Account.
 *
 * Returns every status, not just PUBLISHED — the picker shows the
 * unpublishable ones greyed out with the reason. Hiding them would look
 * like the Flow the operator just built in Meta's builder had not
 * appeared, sending them to look for a sync problem that does not exist.
 */
export async function listWhatsAppFlows(
  args: ListWhatsAppFlowsArgs
): Promise<MetaFlowSummary[]> {
  const { wabaId, accessToken } = args;
  const url = `${META_API_BASE}/${wabaId}/flows?fields=id,name,status,categories,validation_errors&limit=200`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .filter((f: unknown): f is Record<string, unknown> => Boolean(f))
    .map((f: Record<string, unknown>) => ({
      id: String(f.id ?? ''),
      name: typeof f.name === 'string' ? f.name : '',
      status: typeof f.status === 'string' ? f.status : 'UNKNOWN',
      categories: Array.isArray(f.categories)
        ? (f.categories as string[])
        : undefined,
      validation_errors: Array.isArray(f.validation_errors)
        ? f.validation_errors
        : undefined,
    }))
    .filter((f: MetaFlowSummary) => f.id !== '');
}

export interface EditMessageTemplateArgs {
  /** Meta's template id (stored locally as `meta_template_id`). */
  metaTemplateId: string;
  accessToken: string;
  /** Send the full components array — Meta replaces, not patches. */
  components: MetaTemplateSubmitPayload['components'];
  /** Optional — only certain category transitions are allowed by Meta. */
  category?: MetaTemplateSubmitPayload['category'];
  /**
   * MUST be resent on every edit of a NAMED template.
   *
   * Meta's docs: "If you do not specify a format, the template uses
   * positional format by default." That default applies per REQUEST, not
   * per template — so omitting this on an edit makes Meta read the
   * incoming components as POSITIONAL even though the stored template is
   * NAMED. It then sees `{{customer}}` placeholders and a
   * `body_text_named_params` example block inside what it believes is a
   * positional template, and rejects the whole request.
   *
   * This was omitted entirely, which is why editing a named template
   * failed from this app while the identical change succeeded from
   * WhatsApp Manager — the dashboard sends the format, we did not.
   */
  parameterFormat?: MetaTemplateSubmitPayload['parameter_format'];
}

export interface EditMessageTemplateResult {
  success: boolean;
}

/**
 * Edit an existing (APPROVED or REJECTED) message template.
 *
 * Meta caps edits at 10 per 30 days (and 1 per 24h for APPROVED
 * templates). Every edit re-triggers review, so the status flips
 * back to PENDING until Meta approves the new components.
 *
 * Note: PENDING / DISABLED / IN_APPEAL templates cannot be edited
 * — the route handler enforces that before calling here.
 */
export async function editMessageTemplate(
  args: EditMessageTemplateArgs
): Promise<EditMessageTemplateResult> {
  const { metaTemplateId, accessToken, components, category, parameterFormat } =
    args;
  const body: Record<string, unknown> = { components };
  if (category) body.category = category;
  // See the field docs above: Meta defaults an edit to POSITIONAL when
  // this is absent, which breaks every named template.
  if (parameterFormat) body.parameter_format = parameterFormat;
  const response = await fetch(`${META_API_BASE}/${metaTemplateId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // Log the outbound body alongside the failure. Meta's template-edit
    // errors are frequently generic ("the status can't be changed") and do
    // not name the offending field, so the only way to diagnose one is to
    // see exactly what was sent next to exactly what came back. Without
    // this the request was invisible and the cause unknowable from logs.
    console.error(
      '[meta-api] template edit rejected. Request body was:',
      JSON.stringify(body)
    );
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json().catch(() => ({}));
  return { success: data?.success !== false };
}

export interface DeleteMessageTemplateArgs {
  wabaId: string;
  accessToken: string;
  name: string;
  /**
   * Without `hsm_id`, Meta deletes EVERY language variant of the
   * template with this `name`. Pass the row's `meta_template_id`
   * to scope to a single variant.
   */
  metaTemplateId?: string;
}

/**
 * Delete a message template on Meta. Pass `metaTemplateId` to scope
 * to a single language variant — otherwise Meta nukes every variant
 * sharing the same `name`.
 */
export async function deleteMessageTemplate(
  args: DeleteMessageTemplateArgs
): Promise<void> {
  const { wabaId, accessToken, name, metaTemplateId } = args;

  // First attempt: try with hsm_id to scope deletion to one variant.
  if (metaTemplateId) {
    const params = new URLSearchParams({ name, hsm_id: metaTemplateId });
    const url = `${META_API_BASE}/${wabaId}/message_templates?${params.toString()}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404) return;
    if (response.ok) return;

    // If Meta rejected the hsm_id (e.g. "Invalid parameter"), fall
    // through and retry by name only. This deletes ALL language
    // variants, but is better than failing the entire operation.
    //
    // The body is read exactly once and the message reused for both
    // decisions. A Response body can only be consumed once, so the
    // earlier shape here — parse to test for "invalid param", then hand
    // the same Response to throwMetaError — meant every non-404 delete
    // failure surfaced as a bare "Meta API error: 500" with Meta's
    // actual explanation already thrown away.
    let metaMessage = '';
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      metaMessage = data.error?.message ?? '';
    } catch {
      /* body wasn't JSON — fall back to the status code below */
    }
    if (!/invalid param/i.test(metaMessage)) {
      // Some other error — surface it immediately, with Meta's wording
      // when we have it.
      throw new Error(metaMessage || `Meta API error: ${response.status}`);
    }
  }

  // Fallback (or no hsm_id): delete by name.
  const fallbackParams = new URLSearchParams({ name });
  const fallbackUrl = `${META_API_BASE}/${wabaId}/message_templates?${fallbackParams.toString()}`;
  const fallbackRes = await fetch(fallbackUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (fallbackRes.status === 404) return;
  if (!fallbackRes.ok) {
    await throwMetaError(fallbackRes, `Meta API error: ${fallbackRes.status}`);
  }
}

// ============================================================
// Reactions
// ============================================================

export interface SendReactionMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  /** Meta's message_id of the message being reacted to. */
  targetMessageId: string;
  /** Single emoji, or empty string to remove an existing reaction. */
  emoji: string;
}

/**
 * Send a reaction (or removal) to a previously-exchanged message.
 * Empty `emoji` removes the reaction per Meta's spec.
 */
export async function sendReactionMessage(
  args: SendReactionMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, targetMessageId, emoji } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: targetMessageId, emoji },
    }),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

// ============================================================
// Interactive (button replies + list messages)
// ============================================================
//
// Meta's two flavours of interactive message — used by the Flows
// engine to drive scripted chatbot menus. Caller passes plain
// JS values; helpers shape the Meta payload and enforce Meta's
// limits BEFORE the network call so the failure mode is a
// developer-facing error rather than a customer-facing one.

/**
 * Meta limits for interactive messages, hard-coded so violations
 * fail at build/save time rather than as a 400 from the Meta API
 * mid-conversation. See:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages
 */
export const INTERACTIVE_LIMITS = {
  maxButtons: 3,
  buttonTitleMaxLength: 20,
  maxListSections: 10,
  maxListRowsTotal: 10,
  listRowTitleMaxLength: 24,
  listRowDescriptionMaxLength: 72,
  bodyMaxLength: 1024,
  footerMaxLength: 60,
  headerTextMaxLength: 60,
} as const;

export interface InteractiveButton {
  /** Stable id sent back in the webhook when tapped (≤ 256 chars). */
  id: string;
  /** Visible label (≤ 20 chars per Meta). */
  title: string;
}

export interface SendInteractiveButtonsArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  /** The body text — what the customer reads above the buttons. */
  bodyText: string;
  /** Optional plain-text header (≤ 60 chars). */
  headerText?: string;
  /** Optional grey footer line under the buttons (≤ 60 chars). */
  footerText?: string;
  /** 1–3 buttons. Validated against Meta's limits before sending. */
  buttons: InteractiveButton[];
  /** Meta's message_id of the message being replied to (quote preview). */
  contextMessageId?: string;
}

/**
 * Send an interactive message with up to 3 inline reply buttons. The
 * customer taps one and Meta delivers a webhook with
 * `messages[0].interactive.button_reply.id` set to the matching button.id.
 *
 * Validation throws BEFORE the network call so misconfigured flows
 * fail at save time, not during a live conversation.
 */
export async function sendInteractiveButtons(
  args: SendInteractiveButtonsArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    bodyText,
    headerText,
    footerText,
    buttons,
    contextMessageId,
  } = args;
  validateInteractiveBody(bodyText);
  validateInteractiveHeaderFooter(headerText, footerText);
  if (buttons.length < 1 || buttons.length > INTERACTIVE_LIMITS.maxButtons) {
    throw new Error(
      `Interactive button message requires 1-${INTERACTIVE_LIMITS.maxButtons} buttons (got ${buttons.length}).`
    );
  }
  const seenButtonIds = new Set<string>();
  for (const btn of buttons) {
    if (!btn.id) throw new Error('Interactive button missing id.');
    // Duplicate button ids make the tapped-button webhook ambiguous —
    // Meta rejects them, and the pre-flight validator (interactive.ts)
    // rejects them too, so guard here to keep the two paths in step.
    if (seenButtonIds.has(btn.id)) {
      throw new Error(
        `Interactive message has duplicate button id "${btn.id}".`
      );
    }
    seenButtonIds.add(btn.id);
    if (!btn.title)
      throw new Error(`Interactive button "${btn.id}" missing title.`);
    if (btn.title.length > INTERACTIVE_LIMITS.buttonTitleMaxLength) {
      throw new Error(
        `Interactive button title "${btn.title}" exceeds ${INTERACTIVE_LIMITS.buttonTitleMaxLength} chars.`
      );
    }
  }

  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map((b) => ({
        type: 'reply',
        reply: { id: b.id, title: b.title },
      })),
    },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export interface SendInteractiveCtaUrlArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  /** Body text — what the customer reads above the button. */
  bodyText: string;
  /** Visible button label (≤ 20 chars). */
  buttonLabel: string;
  /** Destination opened in the customer's browser. */
  url: string;
  /** Optional plain-text header (≤ 60 chars). */
  headerText?: string;
  /** Optional grey footer line (≤ 60 chars). */
  footerText?: string;
  /** Meta's message_id of the message being replied to (quote preview). */
  contextMessageId?: string;
}

/**
 * Send a single button that opens a URL — Meta's `cta_url` type.
 *
 * Distinct from {@link sendInteractiveButtons} in a way that matters:
 * a reply button returns a webhook when tapped, whereas this opens the
 * customer's browser and produces no webhook at all. There is exactly one
 * button, and it cannot be combined with reply buttons in the same
 * message — Meta treats them as different message types.
 *
 * The point of it is that the customer sees a label instead of a long,
 * opaque link, which they are far more likely to tap.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-cta-url-messages/
 */
export async function sendInteractiveCtaUrl(
  args: SendInteractiveCtaUrlArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    bodyText,
    buttonLabel,
    url: targetUrl,
    headerText,
    footerText,
    contextMessageId,
  } = args;
  validateInteractiveBody(bodyText);
  validateInteractiveHeaderFooter(headerText, footerText);
  if (!buttonLabel)
    throw new Error('Interactive CTA URL requires a buttonLabel.');
  if (buttonLabel.length > INTERACTIVE_LIMITS.buttonTitleMaxLength) {
    throw new Error(
      `Interactive CTA URL buttonLabel "${buttonLabel}" exceeds ${INTERACTIVE_LIMITS.buttonTitleMaxLength} chars.`
    );
  }
  if (!targetUrl) throw new Error('Interactive CTA URL requires a url.');
  // Scheme allowlist, mirroring the pre-flight validator in
  // interactive.ts. The label hides the destination from the customer,
  // so a non-http scheme must never reach a handset.
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new Error(`Interactive CTA URL "${targetUrl}" is not a valid URL.`);
  }
  if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
    throw new Error('Interactive CTA URL must use http or https.');
  }

  const interactive: Record<string, unknown> = {
    type: 'cta_url',
    body: { text: bodyText },
    action: {
      name: 'cta_url',
      parameters: { display_text: buttonLabel, url: targetUrl },
    },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };

  const endpoint = `${META_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

export interface InteractiveListRow {
  /** Stable id sent back in the webhook when tapped (≤ 200 chars). */
  id: string;
  /** Visible row title (≤ 24 chars per Meta). */
  title: string;
  /** Optional secondary line shown under the title (≤ 72 chars). */
  description?: string;
}

export interface InteractiveListSection {
  /** Optional section header shown above its rows. */
  title?: string;
  rows: InteractiveListRow[];
}

export interface SendInteractiveListArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  bodyText: string;
  /** Label of the tap-to-expand button on the message bubble. */
  buttonLabel: string;
  headerText?: string;
  footerText?: string;
  /**
   * 1–10 rows TOTAL across all sections. Meta caps the *total*, not
   * per-section. Validation enforces this before send.
   */
  sections: InteractiveListSection[];
  contextMessageId?: string;
}

/**
 * Send an interactive message with a tap-to-expand list of selectable
 * rows. Use when there are more options than the 3-button limit allows.
 * Webhook arrives with `messages[0].interactive.list_reply.id` set to
 * the matching row.id.
 */
export async function sendInteractiveList(
  args: SendInteractiveListArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    bodyText,
    buttonLabel,
    headerText,
    footerText,
    sections,
    contextMessageId,
  } = args;
  validateInteractiveBody(bodyText);
  validateInteractiveHeaderFooter(headerText, footerText);
  if (!buttonLabel) throw new Error('Interactive list requires a buttonLabel.');
  if (buttonLabel.length > INTERACTIVE_LIMITS.buttonTitleMaxLength) {
    throw new Error(
      `Interactive list buttonLabel "${buttonLabel}" exceeds ${INTERACTIVE_LIMITS.buttonTitleMaxLength} chars.`
    );
  }
  if (
    sections.length < 1 ||
    sections.length > INTERACTIVE_LIMITS.maxListSections
  ) {
    throw new Error(
      `Interactive list requires 1-${INTERACTIVE_LIMITS.maxListSections} sections (got ${sections.length}).`
    );
  }
  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows < 1 || totalRows > INTERACTIVE_LIMITS.maxListRowsTotal) {
    throw new Error(
      `Interactive list requires 1-${INTERACTIVE_LIMITS.maxListRowsTotal} rows total across all sections (got ${totalRows}).`
    );
  }
  const seenIds = new Set<string>();
  for (const section of sections) {
    for (const row of section.rows) {
      if (!row.id) throw new Error('Interactive list row missing id.');
      if (seenIds.has(row.id)) {
        throw new Error(`Interactive list has duplicate row id "${row.id}".`);
      }
      seenIds.add(row.id);
      if (!row.title)
        throw new Error(`Interactive list row "${row.id}" missing title.`);
      if (row.title.length > INTERACTIVE_LIMITS.listRowTitleMaxLength) {
        throw new Error(
          `Interactive list row title "${row.title}" exceeds ${INTERACTIVE_LIMITS.listRowTitleMaxLength} chars.`
        );
      }
      if (
        row.description &&
        row.description.length > INTERACTIVE_LIMITS.listRowDescriptionMaxLength
      ) {
        throw new Error(
          `Interactive list row description for "${row.id}" exceeds ${INTERACTIVE_LIMITS.listRowDescriptionMaxLength} chars.`
        );
      }
    }
  }

  const interactive: Record<string, unknown> = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: buttonLabel,
      sections: sections.map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        rows: s.rows.map((r) => ({
          id: r.id,
          title: r.title,
          ...(r.description ? { description: r.description } : {}),
        })),
      })),
    },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`);
  }
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

function validateInteractiveBody(bodyText: string): void {
  if (!bodyText) throw new Error('Interactive message requires bodyText.');
  if (bodyText.length > INTERACTIVE_LIMITS.bodyMaxLength) {
    throw new Error(
      `Interactive bodyText exceeds ${INTERACTIVE_LIMITS.bodyMaxLength} chars.`
    );
  }
}

function validateInteractiveHeaderFooter(
  headerText: string | undefined,
  footerText: string | undefined
): void {
  if (
    headerText &&
    headerText.length > INTERACTIVE_LIMITS.headerTextMaxLength
  ) {
    throw new Error(
      `Interactive headerText exceeds ${INTERACTIVE_LIMITS.headerTextMaxLength} chars.`
    );
  }
  if (footerText && footerText.length > INTERACTIVE_LIMITS.footerMaxLength) {
    throw new Error(
      `Interactive footerText exceeds ${INTERACTIVE_LIMITS.footerMaxLength} chars.`
    );
  }
}

// ============================================================
// Media
// ============================================================

export interface GetMediaUrlArgs {
  mediaId: string;
  accessToken: string;
}

/**
 * Resolve a media ID to Meta's (short-lived, authenticated) CDN URL
 * plus the MIME type. Step one of the media-proxy flow.
 */
export async function getMediaUrl(
  args: GetMediaUrlArgs
): Promise<{ url: string; mimeType: string }> {
  const { mediaId, accessToken } = args;
  const response = await fetch(`${META_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwMetaError(response, `Media fetch failed: ${response.status}`);
  }
  const data = await response.json();
  if (!data.url) throw new Error('Media URL not found in Meta response');
  return {
    url: data.url,
    mimeType: data.mime_type || 'application/octet-stream',
  };
}

export interface DownloadMediaArgs {
  downloadUrl: string;
  accessToken: string;
}

/**
 * Fetch the binary bytes for a media URL obtained from getMediaUrl.
 * Step two of the media-proxy flow.
 */
export async function downloadMedia(
  args: DownloadMediaArgs
): Promise<{ buffer: Buffer; contentType: string }> {
  const { downloadUrl, accessToken } = args;
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Media download failed: ${response.status}`);
  }
  const contentType =
    response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}
