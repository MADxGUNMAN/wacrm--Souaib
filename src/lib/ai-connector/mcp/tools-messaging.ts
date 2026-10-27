// ============================================================
// AI connector — Phase 7 tools: messaging, broadcasts, automations
// (03 §4.4, §4.6, §4.7).
//
//   * Sends are checked under the user's JWT first (the conversation,
//     contact, template and audience must be in this workspace), then
//     go out through the shared send core with the service-role client
//     (PrivilegedOps) — the AI's JWT can't read WhatsApp credentials.
//   * Daily caps are reserved BEFORE the send and are not refunded.
//   * Free text needs the 24-hour window; outside it, a template.
//   * The same AI message to the same conversation within 2 minutes is
//     refused, so a retried call can't message a customer twice.
//   * When the workspace requires a preview for sends, both send tools
//     are two-step. A broadcast is always two-step: preview_broadcast
//     returns the confirmation_id that send_broadcast needs.
//   * Every message the AI sends carries messages.via_ai, shown in the
//     inbox as "via Claude" / "via ChatGPT".
// ============================================================

import { z } from 'zod';
import {
  setAutomationActive,
  setFlowStatus,
} from '@/lib/services/automation-writes';
import {
  MAX_BROADCAST_AUDIENCE,
  cancelScheduledBroadcast,
  previewBroadcast,
  sendBroadcast,
} from '@/lib/services/broadcast-ai';
import { ServiceError } from '@/lib/services/context';
import {
  executeTemplateMessage,
  executeTextMessage,
  prepareTemplateMessage,
  prepareTextMessage,
  type TemplateFill,
  type TemplateTarget,
} from '@/lib/services/messaging';
import { TEXT_MESSAGE_MAX } from '@/lib/whatsapp/send-message';
import { defineTool, zId, type ToolEnv } from './runtime';

const zConfirmation = z
  .string()
  .max(40)
  .optional()
  .describe(
    "Only when a previous call returned confirmation_required: that call's confirmation_id."
  );

const zTemplateFill = {
  template_name: z.string().min(1).max(512).describe('From list_templates.'),
  language: z
    .string()
    .min(2)
    .max(15)
    .optional()
    .describe('e.g. en_US. Needed when the name exists in several languages.'),
  body_variables: z
    .union([
      z.array(z.string().max(1000)).max(20),
      z.record(z.string().max(60), z.string().max(1000)),
    ])
    .optional()
    .describe(
      'Numbered templates: a list in order ({{1}}, {{2}}…). Named templates: an object { name: value }. get_template shows what is needed.'
    ),
  header_text: z
    .string()
    .max(60)
    .optional()
    .describe('Value for a text-header variable, when the template has one.'),
  header_media_url: z
    .string()
    .url()
    .max(2000)
    .optional()
    .describe(
      'https URL to replace the image/video/document header for this send.'
    ),
  button_url_suffixes: z
    .record(z.string().regex(/^\d$/), z.string().max(1000))
    .optional()
    .describe(
      'For URL buttons with a variable: { "<button index>": "value" } (indexes from get_template).'
    ),
};

type FillInput = {
  template_name: string;
  language?: string;
  body_variables?: string[] | Record<string, string>;
  header_text?: string;
  header_media_url?: string;
  button_url_suffixes?: Record<string, string>;
};

function toFill(i: FillInput): TemplateFill {
  return {
    templateName: i.template_name,
    language: i.language,
    bodyVariables: i.body_variables,
    headerText: i.header_text,
    headerMediaUrl: i.header_media_url,
    buttonUrlSuffixes: i.button_url_suffixes,
  };
}

const zSendOutput = z.object({
  confirmation_required: z.boolean(),
  confirmation_id: z.string().nullable(),
  expires_at: z.string().nullable(),
  sent: z.boolean(),
  message_id: z.string().nullable(),
  conversation_id: z.string().nullable(),
  contact_id: z.string().nullable(),
  contact_created: z.boolean(),
  preview_text: z.string(),
  message: z.string(),
});
type SendOutput = z.infer<typeof zSendOutput>;

const INVALID_CONFIRMATION =
  'That confirmation is not valid for this exact message, has expired, or was already used. Call again without confirmation_id for a new preview';

/**
 * Workspace "require a preview for sends": the first call returns a
 * preview + confirmation_id, the same call with that id sends once.
 * Returns the pending output, or null when the send may go ahead.
 */
async function sendPreviewGate(
  tool: string,
  input: { confirmation_id?: string },
  env: ToolEnv,
  preview: { text: string; to: string }
): Promise<SendOutput | null> {
  if (!env.gate.policy.require_preview_for_sends) return null;
  const { confirmation_id, ...args } = input;
  if (confirmation_id) {
    const ok = await env.connection.consumeConfirmation(
      confirmation_id,
      tool,
      args
    );
    if (!ok) throw new ServiceError('invalid_input', INVALID_CONFIRMATION);
    return null;
  }
  const c = await env.connection.createConfirmation(tool, args, preview);
  return {
    confirmation_required: true,
    confirmation_id: c.id,
    expires_at: c.expiresAt.toISOString(),
    sent: false,
    message_id: null,
    conversation_id: null,
    contact_id: null,
    contact_created: false,
    preview_text: preview.text,
    message: `This workspace asks for a preview before AI sends. Show the user this message to ${preview.to}; if they agree, call ${tool} again with the same arguments and this confirmation_id (valid 10 minutes).`,
  };
}

// ------------------------------------------------------------
// Messaging
// ------------------------------------------------------------

const sendTextTool = defineTool({
  name: 'send_text_message',
  title: 'Send WhatsApp message',
  description: `Send a free-text WhatsApp message in an existing conversation (id from list_conversations). WhatsApp only allows this within 24 hours of the customer's last message (get_conversation shows the reply window); otherwise use send_template_message. Sent as the signed-in user and marked "via AI" in the inbox. Counts against the daily AI message limit.`,
  input: z
    .object({
      conversation_id: zId,
      text: z.string().min(1).max(TEXT_MESSAGE_MAX),
      reply_to_message_id: zId
        .optional()
        .describe('Quote this message (id from get_messages).'),
      confirmation_id: zConfirmation,
    })
    .strict(),
  output: zSendOutput,
  affectedIds: (i, o) =>
    [i.conversation_id, o.message_id].filter((x): x is string => !!x),
  async run(input, env) {
    const prepared = await prepareTextMessage(
      env.service,
      {
        conversationId: input.conversation_id,
        text: input.text,
        replyToMessageId: input.reply_to_message_id,
      },
      env.now
    );
    const pending = await sendPreviewGate('send_text_message', input, env, {
      text: prepared.text,
      to: 'this conversation',
    });
    if (pending)
      return {
        ...pending,
        conversation_id: prepared.conversationId,
        contact_id: prepared.contactId,
      };
    const sent = await executeTextMessage(env.privileged, prepared);
    return {
      confirmation_required: false,
      confirmation_id: null,
      expires_at: null,
      sent: true,
      message_id: sent.messageId,
      conversation_id: prepared.conversationId,
      contact_id: prepared.contactId,
      contact_created: false,
      preview_text: prepared.text,
      message: 'Sent.',
    };
  },
});

const sendTemplateTool = defineTool({
  name: 'send_template_message',
  title: 'Send WhatsApp template',
  description:
    'Send an APPROVED WhatsApp template (list_templates / get_template show what each needs) to one recipient: a conversation_id, a contact_id, or a to_phone in E.164. Templates work outside the 24-hour window. A to_phone that is not yet a contact is only allowed when "send to new numbers" is on for this connection; the contact is then created. Customers who opted out of marketing are skipped for marketing templates. Counts against the daily AI message limit.',
  input: z
    .object({
      conversation_id: zId.optional(),
      contact_id: zId.optional(),
      to_phone: z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/, 'Use E.164 format, e.g. +919876543210')
        .optional(),
      ...zTemplateFill,
      confirmation_id: zConfirmation,
    })
    .strict(),
  output: zSendOutput,
  affectedIds: (_i, o) =>
    [o.conversation_id, o.contact_id, o.message_id].filter(
      (x): x is string => !!x
    ),
  async run(input, env) {
    const targets = [
      input.conversation_id,
      input.contact_id,
      input.to_phone,
    ].filter(Boolean);
    if (targets.length !== 1)
      throw new ServiceError(
        'invalid_input',
        'Give exactly one recipient: conversation_id, contact_id or to_phone'
      );
    const target: TemplateTarget = input.conversation_id
      ? { conversationId: input.conversation_id }
      : input.contact_id
        ? { contactId: input.contact_id }
        : { toPhone: input.to_phone! };
    const prepared = await prepareTemplateMessage(
      env.service,
      target,
      toFill(input),
      {
        allowNewNumbers: env.gate.settings.groups.send_to_new_numbers,
        now: env.now,
      }
    );
    const pending = await sendPreviewGate('send_template_message', input, env, {
      text: prepared.fill.renderedText,
      to: prepared.newPhone
        ? `+${prepared.newPhone} (new contact)`
        : 'this contact',
    });
    if (pending)
      return {
        ...pending,
        conversation_id: prepared.conversationId,
        contact_id: prepared.contactId,
      };
    const sent = await executeTemplateMessage(
      env.service,
      env.privileged,
      prepared
    );
    return {
      confirmation_required: false,
      confirmation_id: null,
      expires_at: null,
      sent: true,
      message_id: sent.messageId,
      conversation_id: sent.conversationId,
      contact_id: sent.contactId,
      contact_created: sent.contactCreated,
      preview_text: prepared.fill.renderedText,
      message: sent.contactCreated
        ? 'Sent. A new contact was created for this number.'
        : 'Sent.',
    };
  },
});

// ------------------------------------------------------------
// Broadcasts
// ------------------------------------------------------------

const previewBroadcastTool = defineTool({
  name: 'preview_broadcast',
  title: 'Preview broadcast',
  description: `Prepare a WhatsApp template broadcast and show who would get it. Nothing is sent. The audience is contacts with any of tag_ids and/or the given contact_ids (max ${MAX_BROADCAST_AUDIENCE}); opted-out contacts are skipped for marketing templates. Returns a confirmation_id: show the preview to the user, and only if they agree call send_broadcast with it (valid 10 minutes).`,
  input: z
    .object({
      ...zTemplateFill,
      tag_ids: z
        .array(zId)
        .max(10)
        .optional()
        .describe('Tag ids from list_tags.'),
      contact_ids: z.array(zId).max(MAX_BROADCAST_AUDIENCE).optional(),
      schedule_at: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe(
          'ISO date-time to send later (up to 30 days). Leave out to send now.'
        ),
      name: z.string().max(200).optional().describe('Name shown in Replai.'),
    })
    .strict(),
  output: z.object({
    confirmation_required: z.boolean(),
    confirmation_id: z.string(),
    expires_at: z.string(),
    audience: z.number(),
    opted_out: z.number(),
    will_send: z.number(),
    template: z.object({
      name: z.string(),
      language: z.string(),
      category: z.string(),
    }),
    sample_text: z.string(),
    schedule_at: z.string().nullable(),
    message: z.string(),
  }),
  async run(input, env) {
    const p = await previewBroadcast(
      env.service,
      {
        ...toFill(input),
        tagIds: input.tag_ids,
        contactIds: input.contact_ids,
        scheduleAt: input.schedule_at,
        name: input.name,
      },
      env.now
    );
    // Bound to send_broadcast with no other arguments: the stored preview
    // is the only thing the send acts on.
    const c = await env.connection.createConfirmation(
      'send_broadcast',
      {},
      p.stored
    );
    const when = p.schedule_at
      ? `at ${p.schedule_at}`
      : 'within about 5 minutes of confirming';
    return {
      confirmation_required: true,
      confirmation_id: c.id,
      expires_at: c.expiresAt.toISOString(),
      audience: p.audience,
      opted_out: p.opted_out,
      will_send: p.will_send,
      template: p.template,
      sample_text: p.sample_text,
      schedule_at: p.schedule_at,
      message: `"${p.template.name}" would go to ${p.will_send} contact${p.will_send === 1 ? '' : 's'}${p.opted_out ? ` (${p.opted_out} opted out, skipped)` : ''}, sent ${when}. Show this to the user; only if they agree, call send_broadcast with this confirmation_id.`,
    };
  },
});

const sendBroadcastTool = defineTool({
  name: 'send_broadcast',
  title: 'Send broadcast',
  description:
    'Send the broadcast prepared by preview_broadcast. Needs its confirmation_id, which works once and only for this connection. Only call this after the user has seen the preview and agreed. Delivery starts within about 5 minutes (or at the scheduled time) and can be followed with get_broadcast.',
  input: z.object({ confirmation_id: z.string().min(1).max(40) }).strict(),
  output: z.object({
    broadcast_id: z.string(),
    status: z.string(),
    recipients: z.number(),
    skipped: z.number(),
    scheduled_at: z.string().nullable(),
    message: z.string(),
  }),
  affectedIds: (_i, o) => [o.broadcast_id],
  async run(input, env) {
    const used = await env.connection.consumeConfirmation(
      input.confirmation_id,
      'send_broadcast',
      {}
    );
    if (!used)
      throw new ServiceError(
        'invalid_input',
        'That confirmation is not valid, has expired, or was already used. Call preview_broadcast again'
      );
    const r = await sendBroadcast(
      env.service,
      env.privileged,
      used.preview,
      env.now
    );
    return {
      broadcast_id: r.broadcastId,
      status: 'scheduled',
      recipients: r.recipients,
      skipped: r.skipped,
      scheduled_at: r.scheduledAt,
      message: r.scheduledAt
        ? `Scheduled "${r.templateName}" to ${r.recipients} contacts for ${r.scheduledAt}. It can be cancelled until then with cancel_scheduled_broadcast.`
        : `Queued "${r.templateName}" to ${r.recipients} contacts; delivery starts within about 5 minutes. Follow it with get_broadcast.`,
    };
  },
});

const cancelBroadcastTool = defineTool({
  name: 'cancel_scheduled_broadcast',
  title: 'Cancel scheduled broadcast',
  description:
    'Cancel a broadcast that is scheduled and has not started sending. It goes back to a draft in Replai; nothing is deleted. A broadcast that is already sending cannot be stopped here.',
  input: z.object({ broadcast_id: zId }).strict(),
  output: z.object({
    broadcast_id: z.string(),
    name: z.string(),
    status: z.string(),
    message: z.string(),
  }),
  idempotent: false,
  affectedIds: (i) => [i.broadcast_id],
  async run(input, { service }) {
    const r = await cancelScheduledBroadcast(service, input.broadcast_id);
    return {
      broadcast_id: r.id,
      name: r.name,
      status: 'draft',
      message: 'Cancelled. It is now a draft in Replai.',
    };
  },
});

// ------------------------------------------------------------
// Automations and flows
// ------------------------------------------------------------

const setAutomationActiveTool = defineTool({
  name: 'set_automation_active',
  title: 'Switch automation on or off',
  description:
    "Switch an automation on or off (id from list_automations). Only the team member who created it can do this, as in Replai. Switching on checks its setup first and refuses if it is incomplete. Its steps can't be edited here.",
  input: z.object({ automation_id: zId, active: z.boolean() }).strict(),
  output: z.object({
    automation: z.object({
      id: z.string(),
      name: z.string(),
      active: z.boolean(),
    }),
    previous_active: z.boolean(),
    changed: z.boolean(),
  }),
  idempotent: true,
  affectedIds: (i) => [i.automation_id],
  async run(input, { service }) {
    const r = await setAutomationActive(
      service,
      input.automation_id,
      input.active
    );
    return {
      automation: { id: r.id, name: r.name, active: r.active },
      previous_active: r.previous,
      changed: r.changed,
    };
  },
});

const setFlowStatusTool = defineTool({
  name: 'set_flow_status',
  title: 'Activate or pause flow',
  description:
    'Activate a flow, or pause it by setting it back to draft (id from list_flows). Activating checks the flow first and refuses if it has errors. Its steps cannot be edited here.',
  input: z
    .object({ flow_id: zId, status: z.enum(['active', 'draft']) })
    .strict(),
  output: z.object({
    flow: z.object({ id: z.string(), name: z.string(), status: z.string() }),
    previous_status: z.string(),
    changed: z.boolean(),
  }),
  idempotent: true,
  affectedIds: (i) => [i.flow_id],
  async run(input, { service }) {
    const r = await setFlowStatus(service, input.flow_id, input.status);
    return {
      flow: { id: r.id, name: r.name, status: r.status },
      previous_status: r.previous,
      changed: r.changed,
    };
  },
});

export const MESSAGING_TOOLS = [
  sendTextTool,
  sendTemplateTool,
  previewBroadcastTool,
  sendBroadcastTool,
  cancelBroadcastTool,
  setAutomationActiveTool,
  setFlowStatusTool,
];
