// ============================================================
// Messaging services for the AI connector (Phase 7, 03 §4.4).
//
// Each send is split in two so a preview (require_preview_for_sends)
// and the real send run the same checks:
//
//   prepare*  — every check, under the user's JWT; changes nothing
//   execute*  — reserve the daily caps, then send through the shared
//               core with the service-role client (PrivilegedOps)
//
// Rules on top of the core (which Meta would otherwise enforce with an
// opaque error, or not at all):
//   * free text needs the 24-hour window to be open
//   * the same AI message to the same conversation is refused for two
//     minutes (a retried tool call must not message a customer twice)
//   * templates must be APPROVED, of a type these tools can fill, and
//     get exactly the variables they declare
//   * a phone that isn't a contact needs the connection's
//     "send to new numbers" switch
// ============================================================

import { createContact } from './contact-writes';
import { ServiceError, UUID_RE, type ServiceContext } from './context';
import { computeReplyWindow, type ReplyWindow } from './conversations';
import type { PrivilegedOps, ReserveOutcome } from './privileged';
import { getTemplate, type TemplateDetail } from './templates';
import { findExistingContact } from '@/lib/contacts/dedupe';
import { findOrCreateConversationRow } from '@/lib/whatsapp/resolve-conversation';
import { interpolateTemplateBody } from '@/lib/whatsapp/template-body-text';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import {
  SendMessageError,
  TEXT_MESSAGE_MAX,
} from '@/lib/whatsapp/send-message';

export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
export const TEMPLATE_PARAM_MAX = 1000;

// ------------------------------------------------------------
// Shared checks
// ------------------------------------------------------------

interface ConversationTarget {
  id: string;
  contactId: string;
}

async function loadConversationTarget(
  ctx: ServiceContext,
  id: string
): Promise<ConversationTarget> {
  if (!UUID_RE.test(id))
    throw new ServiceError('not_found', 'Conversation not found');
  const { data, error } = await ctx.db
    .from('conversations')
    .select('id, contact_id')
    .eq('account_id', ctx.accountId)
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new ServiceError('internal', 'Could not load the conversation');
  if (!data) throw new ServiceError('not_found', 'Conversation not found');
  return { id: data.id as string, contactId: data.contact_id as string };
}

export async function replyWindowFor(
  ctx: ServiceContext,
  conversationId: string,
  now: Date
): Promise<ReplyWindow> {
  const { data, error } = await ctx.db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw new ServiceError('internal', 'Could not check the reply window');
  return computeReplyWindow(
    (data as { created_at: string } | null)?.created_at ?? null,
    now
  );
}

/** Refuse a repeat of the same AI message to this conversation within 2 minutes. */
async function assertNotDuplicate(
  ctx: ServiceContext,
  conversationId: string,
  match: { contentText: string | null; templateName: string | null },
  now: Date
): Promise<void> {
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString();
  const { data, error } = await ctx.db
    .from('messages')
    .select('content_text, template_name, status')
    .eq('conversation_id', conversationId)
    .not('via_ai', 'is', null)
    .gte('created_at', since)
    .limit(20);
  if (error)
    throw new ServiceError('internal', 'Could not check recent messages');
  const dup = (
    (data ?? []) as {
      content_text: string | null;
      template_name: string | null;
      status: string | null;
    }[]
  ).some(
    (m) =>
      m.status !== 'failed' &&
      (m.template_name ?? null) === match.templateName &&
      (m.content_text ?? null) === match.contentText
  );
  if (dup) {
    throw new ServiceError(
      'invalid_input',
      'The same message was sent to this conversation by an AI app less than 2 minutes ago, so it was not sent again. If the user really wants it sent twice, wait two minutes'
    );
  }
}

function capMessage(
  ops: PrivilegedOps,
  r: ReserveOutcome,
  kind: 'messages' | 'recipients',
  requested: number
): string {
  const tz = ops.caps.timezone;
  if (kind === 'recipients') {
    const cap = ops.caps.accountBroadcastRecipientsPerDay;
    return `This would go over the workspace's daily limit of ${cap} AI broadcast recipients (${r.accountRecipients} used today, ${requested} requested). It resets at 00:00 (${tz}). A workspace owner can change it in Settings → AI Connectors`;
  }
  const conn = ops.caps.connectionMessagesPerDay;
  if (r.connectionMessages + requested > conn) {
    return `The daily limit of ${conn} AI-sent messages for this connection has been reached. It resets at 00:00 (${tz}). The user can change it in Settings → AI Connectors`;
  }
  const acct = ops.caps.accountMessagesPerDay;
  return `The workspace's daily limit of ${acct} AI-sent messages has been reached. It resets at 00:00 (${tz}). A workspace owner can change it in Settings → AI Connectors`;
}

export async function reserveOrThrow(
  ops: PrivilegedOps,
  kind: 'messages' | 'recipients',
  n: number
): Promise<void> {
  let r: ReserveOutcome;
  try {
    r = await ops.reserve(
      kind === 'messages' ? { messages: n } : { broadcastRecipients: n }
    );
  } catch {
    throw new ServiceError('internal', 'Could not check the daily limit');
  }
  if (!r.allowed)
    throw new ServiceError('invalid_input', capMessage(ops, r, kind, n));
}

/** Caller-fixable send failures become actionable; the rest stay internal. */
export function mapSendError(err: unknown): never {
  if (err instanceof ServiceError) throw err;
  if (err instanceof SendMessageError) {
    if (err.code === 'not_found')
      throw new ServiceError('not_found', 'Conversation not found');
    if (err.status < 500 || err.code === 'meta_error')
      throw new ServiceError(
        'invalid_input',
        err.message.replace(/[.\s]+$/, '')
      );
  }
  throw err;
}

// ------------------------------------------------------------
// Text
// ------------------------------------------------------------

export interface TextSendInput {
  conversationId: string;
  text: string;
  replyToMessageId?: string;
}

export interface PreparedText {
  conversationId: string;
  contactId: string;
  text: string;
  replyToMessageId?: string;
  window: ReplyWindow;
}

export async function prepareTextMessage(
  ctx: ServiceContext,
  input: TextSendInput,
  now: Date
): Promise<PreparedText> {
  const text = input.text.trim();
  if (!text) throw new ServiceError('invalid_input', 'text is empty');
  if (text.length > TEXT_MESSAGE_MAX)
    throw new ServiceError(
      'invalid_input',
      `text is longer than WhatsApp's ${TEXT_MESSAGE_MAX}-character limit`
    );
  const conv = await loadConversationTarget(ctx, input.conversationId);
  const window = await replyWindowFor(ctx, conv.id, now);
  if (!window.open) {
    throw new ServiceError(
      'invalid_input',
      window.lastCustomerMessageAt
        ? `The 24-hour reply window closed at ${window.closesAt}, so WhatsApp only allows an approved template now. Use send_template_message (see list_templates)`
        : 'This customer has never written, so WhatsApp only allows an approved template. Use send_template_message (see list_templates)'
    );
  }
  if (input.replyToMessageId) {
    if (!UUID_RE.test(input.replyToMessageId))
      throw new ServiceError(
        'not_found',
        'reply_to_message_id not found in this conversation'
      );
    const { data } = await ctx.db
      .from('messages')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('id', input.replyToMessageId)
      .maybeSingle();
    if (!data)
      throw new ServiceError(
        'not_found',
        'reply_to_message_id not found in this conversation'
      );
  }
  await assertNotDuplicate(
    ctx,
    conv.id,
    { contentText: text, templateName: null },
    now
  );
  return {
    conversationId: conv.id,
    contactId: conv.contactId,
    text,
    replyToMessageId: input.replyToMessageId,
    window,
  };
}

export async function executeTextMessage(
  ops: PrivilegedOps,
  p: PreparedText
): Promise<{ messageId: string; whatsappMessageId: string }> {
  await reserveOrThrow(ops, 'messages', 1);
  try {
    return await ops.sendMessage({
      conversationId: p.conversationId,
      messageType: 'text',
      contentText: p.text,
      replyToMessageId: p.replyToMessageId ?? null,
    });
  } catch (err) {
    mapSendError(err);
  }
}

// ------------------------------------------------------------
// Templates
// ------------------------------------------------------------

export interface TemplateFill {
  templateName: string;
  language?: string;
  /** Positional templates: values in order. Named: { name: value }. */
  bodyVariables?: string[] | Record<string, string>;
  headerText?: string;
  headerMediaUrl?: string;
  /** URL-button suffixes keyed by button index (from get_template). */
  buttonUrlSuffixes?: Record<string, string>;
}

export interface PreparedTemplate {
  template: Pick<TemplateDetail, 'id' | 'name' | 'language' | 'category'>;
  /** Positional body values (empty for a named template). */
  bodyParams: string[];
  messageParams: SendTimeParams;
  /** The body as the customer will read it, for the inbox and previews. */
  renderedText: string;
}

function checkParam(label: string, v: unknown): string {
  if (typeof v !== 'string' || !v.trim())
    throw new ServiceError('invalid_input', `${label} is empty`);
  // Meta rejects template parameters with new lines, tabs or more than
  // four consecutive spaces (error 132018).
  if (/[\n\t]| {5,}/.test(v))
    throw new ServiceError(
      'invalid_input',
      `${label} can't contain line breaks, tabs or long runs of spaces (WhatsApp rule for template variables)`
    );
  if (v.length > TEMPLATE_PARAM_MAX)
    throw new ServiceError(
      'invalid_input',
      `${label} is longer than ${TEMPLATE_PARAM_MAX} characters`
    );
  return v.trim();
}

function httpsUrl(label: string, v: string): string {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new ServiceError('invalid_input', `${label} is not a valid URL`);
  }
  if (u.protocol !== 'https:')
    throw new ServiceError('invalid_input', `${label} must be an https URL`);
  return u.toString();
}

/** Validate a template + its values; returns what the send core needs. */
export async function prepareTemplateFill(
  ctx: ServiceContext,
  fill: TemplateFill
): Promise<PreparedTemplate> {
  const t = await getTemplate(ctx, {
    name: fill.templateName,
    language: fill.language,
  });
  if (t.status !== 'APPROVED')
    throw new ServiceError(
      'invalid_input',
      `Template "${t.name}" is ${t.status}; only APPROVED templates can be sent`
    );
  const req = t.requirements;
  if (req.special_type)
    throw new ServiceError(
      'invalid_input',
      `Template "${t.name}" is a ${req.special_type} template, which can't be sent from here yet. Send it from Replai`
    );
  if (req.header.type === 'location')
    throw new ServiceError(
      'invalid_input',
      `Template "${t.name}" has a location header, which can't be sent from here yet. Send it from Replai`
    );

  const messageParams: SendTimeParams = {};
  let bodyParams: string[] = [];
  let rendered = t.body_text;
  const vars = fill.bodyVariables;

  if (req.parameter_format === 'NAMED') {
    const names = req.body_variables.names;
    const given =
      vars && !Array.isArray(vars) ? vars : ({} as Record<string, string>);
    if (Array.isArray(vars) && vars.length && names.length)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" uses named variables: pass body_variables as an object with ${names.join(', ')}`
      );
    const missing = names.filter((n) => !(n in given));
    if (missing.length)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" needs body variables ${missing.join(', ')}`
      );
    const extra = Object.keys(given).filter((k) => !names.includes(k));
    if (extra.length)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" has no variables named ${extra.join(', ')}`
      );
    const named: Record<string, string> = {};
    for (const n of names) named[n] = checkParam(`Variable "${n}"`, given[n]);
    if (names.length) messageParams.namedBody = named;
    rendered = t.body_text.replace(
      /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi,
      (w, n) => (n in named ? named[n] : w)
    );
  } else {
    const count = req.body_variables.count;
    const given = Array.isArray(vars) ? vars : vars ? null : [];
    if (given === null)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" uses numbered variables: pass body_variables as a list of ${count} values`
      );
    if (given.length !== count)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" needs exactly ${count} body variable${count === 1 ? '' : 's'}, got ${given.length}`
      );
    bodyParams = given.map((v, i) => checkParam(`Variable {{${i + 1}}}`, v));
    if (count) messageParams.body = bodyParams;
    rendered = interpolateTemplateBody(t.body_text, bodyParams) ?? '';
  }

  if (req.header.type === 'text' && req.header.needs_value) {
    if (!fill.headerText)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" needs header_text for its header variable`
      );
    messageParams.headerText = checkParam('header_text', fill.headerText);
  } else if (fill.headerText) {
    throw new ServiceError(
      'invalid_input',
      `Template "${t.name}" has no header variable; leave header_text out`
    );
  }

  if (fill.headerMediaUrl) {
    if (!['image', 'video', 'document'].includes(req.header.type))
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" has no media header; leave header_media_url out`
      );
    messageParams.headerMediaUrl = httpsUrl(
      'header_media_url',
      fill.headerMediaUrl
    );
  }

  const suffixes = fill.buttonUrlSuffixes ?? {};
  const needed = req.url_buttons_needing_suffix;
  const unknown = Object.keys(suffixes).filter(
    (k) => !needed.includes(Number(k))
  );
  if (unknown.length)
    throw new ServiceError(
      'invalid_input',
      `Template "${t.name}" has no URL button needing a value at index ${unknown.join(', ')}`
    );
  if (needed.length) {
    const missing = needed.filter((i) => !(String(i) in suffixes));
    if (missing.length)
      throw new ServiceError(
        'invalid_input',
        `Template "${t.name}" needs button_url_suffixes for button index ${missing.join(', ')}`
      );
    messageParams.buttonParams = Object.fromEntries(
      needed.map((i) => [
        i,
        checkParam(`button_url_suffixes["${i}"]`, suffixes[String(i)]),
      ])
    );
  }

  return {
    template: {
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
    },
    bodyParams,
    messageParams,
    renderedText: rendered || `[template: ${t.name}]`,
  };
}

export type TemplateTarget =
  { conversationId: string } | { contactId: string } | { toPhone: string };

export interface PreparedTemplateSend {
  fill: PreparedTemplate;
  /** Set when the conversation exists already. */
  conversationId: string | null;
  /** Set when the contact exists already. */
  contactId: string | null;
  /** Digits only; set when the contact must be created. */
  newPhone: string | null;
}

async function contactInAccount(
  ctx: ServiceContext,
  id: string
): Promise<void> {
  if (!UUID_RE.test(id))
    throw new ServiceError('not_found', 'Contact not found');
  const { data, error } = await ctx.db
    .from('contacts')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ServiceError('internal', 'Could not load the contact');
  if (!data) throw new ServiceError('not_found', 'Contact not found');
}

async function existingConversationFor(
  ctx: ServiceContext,
  contactId: string
): Promise<string | null> {
  const { data, error } = await ctx.db
    .from('conversations')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error)
    throw new ServiceError('internal', 'Could not load the conversation');
  return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
}

export async function prepareTemplateMessage(
  ctx: ServiceContext,
  target: TemplateTarget,
  fill: TemplateFill,
  opts: { allowNewNumbers: boolean; now: Date }
): Promise<PreparedTemplateSend> {
  let conversationId: string | null = null;
  let contactId: string | null = null;
  let newPhone: string | null = null;

  if ('conversationId' in target) {
    const conv = await loadConversationTarget(ctx, target.conversationId);
    conversationId = conv.id;
    contactId = conv.contactId;
  } else if ('contactId' in target) {
    await contactInAccount(ctx, target.contactId);
    contactId = target.contactId;
    conversationId = await existingConversationFor(ctx, contactId);
  } else {
    const digits = sanitizePhoneForMeta(target.toPhone);
    if (!isValidE164(digits))
      throw new ServiceError(
        'invalid_input',
        'to_phone must be in E.164 format, e.g. +919876543210'
      );
    const existing = await findExistingContact(ctx.db, ctx.accountId, digits);
    if (existing) {
      contactId = existing.id;
      conversationId = await existingConversationFor(ctx, existing.id);
    } else if (!opts.allowNewNumbers) {
      throw new ServiceError(
        'invalid_input',
        'That number is not a contact in this workspace, and sending to new numbers is off for this connection. Add the contact first (create_contact), or the user can turn on "Send to new numbers" in Settings → AI Connectors'
      );
    } else {
      newPhone = digits;
    }
  }

  const prepared = await prepareTemplateFill(ctx, fill);
  if (conversationId) {
    await assertNotDuplicate(
      ctx,
      conversationId,
      {
        contentText: prepared.renderedText,
        templateName: prepared.template.name,
      },
      opts.now
    );
  }
  return { fill: prepared, conversationId, contactId, newPhone };
}

export async function executeTemplateMessage(
  ctx: ServiceContext,
  ops: PrivilegedOps,
  p: PreparedTemplateSend
): Promise<{
  messageId: string;
  whatsappMessageId: string;
  conversationId: string;
  contactId: string;
  contactCreated: boolean;
}> {
  await reserveOrThrow(ops, 'messages', 1);

  let contactId = p.contactId;
  let contactCreated = false;
  if (!contactId) {
    // createContact finds-or-creates by phone, so a race is harmless.
    const r = await createContact(ctx, { phone: `+${p.newPhone}` });
    contactId = r.contact.id;
    contactCreated = r.created;
  }
  let conversationId = p.conversationId;
  try {
    if (!conversationId) {
      conversationId = await findOrCreateConversationRow(
        ctx.db,
        ctx.accountId,
        contactId,
        ctx.userId
      );
    }
    const sent = await ops.sendMessage({
      conversationId,
      messageType: 'template',
      templateName: p.fill.template.name,
      templateLanguage: p.fill.template.language,
      templateParams: p.fill.bodyParams,
      templateMessageParams: p.fill.messageParams,
      contentText: p.fill.renderedText,
    });
    return { ...sent, conversationId, contactId, contactCreated };
  } catch (err) {
    mapSendError(err);
  }
}
