// ============================================================
// AI connector — Phase 6 record writes (03 §4.2, §4.3, §4.5).
//
//   * Writes take ids, never names (find them with the read tools).
//   * Every id is checked against the workspace before anything is
//     written; a foreign id fails the whole call as "not found".
//   * Repeating a call is safe: creating a contact finds the existing
//     one by phone, adding a tag that is there is a no-op, setting a
//     status or assignee that is already set changes nothing.
//   * Tag changes on more than 25 contacts are two-step (D9): the first
//     call returns a preview and a confirmation_id; the same call again
//     with that id executes it once.
//   * Attribution: contacts the AI creates get source 'ai'; every row is
//     written as the signed-in user (RLS); the audit row lists the ids.
// ============================================================

import { z } from 'zod';
import type { ApiContact } from '@/lib/api/v1/contacts';
import { ServiceError } from '@/lib/services/context';
import {
  MAX_CUSTOM_VALUE_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TAG_TARGETS,
  addContactNote,
  addTagsToContacts,
  assertContactsInAccount,
  createContact,
  removeTagsFromContacts,
  resolveTagIds,
  setCustomField,
  updateContact,
} from '@/lib/services/contact-writes';
import {
  assignConversation,
  markConversationRead,
  updateConversationStatus,
} from '@/lib/services/conversation-writes';
import { CONVERSATION_STATUSES } from '@/lib/services/conversations';
import { closeDeal, createDeal, updateDeal } from '@/lib/services/deal-writes';
import type { DealSummary } from '@/lib/services/deals';
import { BULK_CONFIRM_THRESHOLD } from '../tool-catalog';
import { defineTool, untrusted, zId, type ToolEnv } from './runtime';
import { zDeal } from './tools-read';

const E164 = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Use E.164 format, e.g. +919876543210')
  .describe('Phone in E.164 format, e.g. +919876543210.');
const zText = (max: number) => z.string().max(max);
const zUntrustedFields = z.array(z.string());

const zContact = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  company: z.string().nullable(),
  tags: z.array(z.object({ id: z.string(), name: z.string() })),
});

function contactOut(c: ApiContact): z.infer<typeof zContact> {
  return {
    id: c.id,
    name: untrusted(c.name, 200),
    phone: c.phone,
    email: untrusted(c.email, 200),
    company: untrusted(c.company, 200),
    tags: c.tags.map((t) => ({ id: t.id, name: t.name })),
  };
}

/** Only the public deal fields (never notes), with the contact name marked. */
function publicDeal(d: DealSummary): DealSummary {
  return {
    id: d.id,
    title: d.title,
    value: d.value,
    status: d.status,
    pipeline: d.pipeline,
    stage: d.stage,
    contact: d.contact
      ? { ...d.contact, name: untrusted(d.contact.name, 200) }
      : null,
    assigned_to: d.assigned_to,
    expected_close_date: d.expected_close_date,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

// ------------------------------------------------------------
// Contacts
// ------------------------------------------------------------

const createContactTool = defineTool({
  name: 'create_contact',
  title: 'Create contact',
  description:
    'Add a contact by phone number (E.164). If a contact with that number already exists it is returned instead (created: false), so calling this twice is safe. Optionally sets name, email, company and tags (tags that do not exist yet are created).',
  input: z
    .object({
      phone: E164,
      name: zText(200).optional(),
      email: z.string().email().max(200).optional(),
      company: zText(200).optional(),
      tags: z
        .array(zText(50).min(1))
        .max(10)
        .optional()
        .describe('Tag names to add.'),
    })
    .strict(),
  output: z.object({
    contact: zContact,
    created: z.boolean(),
    tags_added: z.number(),
    untrusted_fields: zUntrustedFields,
  }),
  idempotent: true,
  affectedIds: (_i, o) => [o.contact.id],
  async run(input, { service }) {
    const r = await createContact(service, {
      phone: input.phone,
      name: input.name,
      email: input.email,
      company: input.company,
      tagNames: input.tags,
    });
    return {
      contact: contactOut(r.contact),
      created: r.created,
      tags_added: r.tags_added,
      untrusted_fields: ['contact.name', 'contact.email', 'contact.company'],
    };
  },
});

const updateContactTool = defineTool({
  name: 'update_contact',
  title: 'Update contact',
  description:
    "Change a contact's name, email or company (pass null to clear one). The phone number can't be changed here. Get the contact_id from search_contacts.",
  input: z
    .object({
      contact_id: zId,
      name: zText(200).nullable().optional(),
      email: z.string().email().max(200).nullable().optional(),
      company: zText(200).nullable().optional(),
    })
    .strict(),
  output: z.object({
    contact: zContact,
    changed: z.array(z.string()),
    untrusted_fields: zUntrustedFields,
  }),
  idempotent: true,
  affectedIds: (i) => [i.contact_id],
  async run(input, { service }) {
    const r = await updateContact(service, input.contact_id, {
      name: input.name,
      email: input.email,
      company: input.company,
    });
    return {
      contact: contactOut(r.contact),
      changed: r.changed,
      untrusted_fields: ['contact.name', 'contact.email', 'contact.company'],
    };
  },
});

const zTagChangeInput = z
  .object({
    contact_ids: z.array(zId).min(1).max(MAX_TAG_TARGETS),
    tag_ids: z
      .array(zId)
      .max(10)
      .optional()
      .describe('Existing tag ids from list_tags.'),
    tag_names: z
      .array(zText(50).min(1))
      .max(10)
      .optional()
      .describe('Tag names; for adding, new names create the tag.'),
    confirmation_id: z
      .string()
      .max(40)
      .optional()
      .describe(
        `Required when changing more than ${BULK_CONFIRM_THRESHOLD} contacts: from the first call's preview.`
      ),
  })
  .strict();

const zTagChangeOutput = z.object({
  confirmation_required: z.boolean(),
  confirmation_id: z.string().nullable(),
  expires_at: z.string().nullable(),
  contacts: z.number(),
  changed: z.number(),
  unchanged: z.number(),
  automations_triggered: z.number(),
  message: z.string(),
});

/**
 * Bulk two-step: above the threshold the first call stores a preview and
 * returns its id; the repeat call (same arguments + that id) runs once.
 * Returns null when the caller may go ahead now.
 */
async function bulkGate(
  tool: string,
  input: z.infer<typeof zTagChangeInput>,
  env: ToolEnv,
  verb: string
): Promise<z.infer<typeof zTagChangeOutput> | null> {
  const contacts = new Set(input.contact_ids).size;
  if (contacts <= BULK_CONFIRM_THRESHOLD) return null;
  const { confirmation_id, ...args } = input;
  if (confirmation_id) {
    if (
      !(await env.connection.consumeConfirmation(confirmation_id, tool, args))
    ) {
      throw new ServiceError(
        'invalid_input',
        'That confirmation is not valid for these exact changes, has expired, or was already used. Call again without confirmation_id for a new preview'
      );
    }
    return null;
  }
  await assertContactsInAccount(env.service, input.contact_ids);
  const tags = [
    ...(input.tag_names ?? []),
    ...(input.tag_ids ?? []).map((id) => `tag ${id.slice(0, 8)}…`),
  ];
  const preview = { contacts, tags };
  const c = await env.connection.createConfirmation(tool, args, preview);
  return {
    confirmation_required: true,
    confirmation_id: c.id,
    expires_at: c.expiresAt.toISOString(),
    contacts,
    changed: 0,
    unchanged: 0,
    automations_triggered: 0,
    message: `This will ${verb} ${tags.join(', ')} on ${contacts} contacts. Show this to the user; if they agree, call ${tool} again with the same arguments and this confirmation_id (valid 10 minutes).`,
  };
}

const addTagsTool = defineTool({
  name: 'add_tags_to_contacts',
  title: 'Add tags to contacts',
  description: `Add tags to up to ${MAX_TAG_TARGETS} contacts. Tags already on a contact are left as they are. Adding a tag can start "tag added" automations, as in Replai. For more than ${BULK_CONFIRM_THRESHOLD} contacts the first call returns a preview and a confirmation_id to confirm with.`,
  input: zTagChangeInput,
  output: zTagChangeOutput,
  idempotent: true,
  affectedIds: (i) => i.contact_ids,
  async run(input, env) {
    const pending = await bulkGate('add_tags_to_contacts', input, env, 'add');
    if (pending) return pending;
    const tagIds = await resolveTagIds(env.service, {
      ids: input.tag_ids,
      names: input.tag_names,
      create: true,
    });
    const r = await addTagsToContacts(env.service, input.contact_ids, tagIds);
    return {
      confirmation_required: false,
      confirmation_id: null,
      expires_at: null,
      contacts: new Set(input.contact_ids).size,
      changed: r.added,
      unchanged: r.already,
      automations_triggered: r.automations_triggered,
      message: `Added ${r.added} tag${r.added === 1 ? '' : 's'}${r.already ? `; ${r.already} were already there` : ''}.`,
    };
  },
});

const removeTagsTool = defineTool({
  name: 'remove_tags_from_contacts',
  title: 'Remove tags from contacts',
  description: `Remove tags from up to ${MAX_TAG_TARGETS} contacts. Tags themselves are not deleted. For more than ${BULK_CONFIRM_THRESHOLD} contacts the first call returns a preview and a confirmation_id to confirm with.`,
  input: zTagChangeInput,
  output: zTagChangeOutput,
  idempotent: true,
  affectedIds: (i) => i.contact_ids,
  async run(input, env) {
    const pending = await bulkGate(
      'remove_tags_from_contacts',
      input,
      env,
      'remove'
    );
    if (pending) return pending;
    const tagIds = await resolveTagIds(env.service, {
      ids: input.tag_ids,
      names: input.tag_names,
      create: false,
    });
    const r = await removeTagsFromContacts(
      env.service,
      input.contact_ids,
      tagIds
    );
    return {
      confirmation_required: false,
      confirmation_id: null,
      expires_at: null,
      contacts: new Set(input.contact_ids).size,
      changed: r.removed_pairs,
      unchanged: 0,
      automations_triggered: 0,
      message: `Removed ${r.removed_pairs} tag${r.removed_pairs === 1 ? '' : 's'}.`,
    };
  },
});

const addNoteTool = defineTool({
  name: 'add_contact_note',
  title: 'Add contact note',
  description:
    'Add a note to a contact, written as the signed-in user. Notes are visible to the team in Replai.',
  input: z
    .object({ contact_id: zId, text: z.string().min(1).max(MAX_NOTE_LENGTH) })
    .strict(),
  output: z.object({ note_id: z.string(), created_at: z.string() }),
  affectedIds: (i, o) => [i.contact_id, o.note_id],
  async run(input, { service }) {
    const r = await addContactNote(service, input.contact_id, input.text);
    return { note_id: r.id, created_at: r.created_at };
  },
});

const setCustomFieldTool = defineTool({
  name: 'set_custom_field',
  title: 'Set custom field',
  description:
    'Set one custom field value on a contact, or clear it with null. Get field ids and any allowed options from list_custom_fields. Email and company are changed with update_contact instead.',
  input: z
    .object({
      contact_id: zId,
      field_id: zId,
      value: z.string().max(MAX_CUSTOM_VALUE_LENGTH).nullable(),
    })
    .strict(),
  output: z.object({
    field: z.string(),
    value: z.string().nullable(),
    previous: z.object({ untrusted_text: z.string().nullable() }),
  }),
  idempotent: true,
  affectedIds: (i) => [i.contact_id],
  async run(input, { service }) {
    const r = await setCustomField(
      service,
      input.contact_id,
      input.field_id,
      input.value
    );
    return {
      field: r.field,
      value: r.value,
      previous: { untrusted_text: untrusted(r.previous, 1000) },
    };
  },
});

// ------------------------------------------------------------
// Conversations
// ------------------------------------------------------------

const updateStatusTool = defineTool({
  name: 'update_conversation_status',
  title: 'Change conversation status',
  description:
    'Set an inbox conversation to open, pending or closed. Closing hides it from the open inbox.',
  input: z
    .object({ conversation_id: zId, status: z.enum(CONVERSATION_STATUSES) })
    .strict(),
  output: z.object({
    status: z.string(),
    previous: z.string(),
    changed: z.boolean(),
  }),
  idempotent: true,
  affectedIds: (i) => [i.conversation_id],
  async run(input, { service }) {
    return updateConversationStatus(
      service,
      input.conversation_id,
      input.status
    );
  },
});

const assignTool = defineTool({
  name: 'assign_conversation',
  title: 'Assign conversation',
  description:
    'Assign an inbox conversation to "me", to a team member (id from list_team_members), or "unassigned". The assignee gets a notification, as in Replai.',
  input: z
    .object({
      conversation_id: zId,
      assign_to: z.union([z.enum(['me', 'unassigned']), zId]),
    })
    .strict(),
  output: z.object({
    assigned_to: z
      .object({ id: z.string(), name: z.string().nullable() })
      .nullable(),
    changed: z.boolean(),
  }),
  idempotent: true,
  affectedIds: (i) => [i.conversation_id],
  async run(input, { service }) {
    return assignConversation(
      service,
      input.conversation_id,
      input.assign_to === 'unassigned' ? null : input.assign_to
    );
  },
});

const markReadTool = defineTool({
  name: 'mark_conversation_read',
  title: 'Mark conversation read',
  description:
    "Reset a conversation's unread count in Replai. It doesn't send a WhatsApp read receipt to the customer.",
  input: z.object({ conversation_id: zId }).strict(),
  output: z.object({ previous_unread: z.number() }),
  idempotent: true,
  affectedIds: (i) => [i.conversation_id],
  async run(input, { service }) {
    return markConversationRead(service, input.conversation_id);
  },
});

// ------------------------------------------------------------
// Deals
// ------------------------------------------------------------

const zDealOut = z.object({ deal: zDeal, untrusted_fields: zUntrustedFields });
const DEAL_UNTRUSTED = ['deal.title', 'deal.contact.name'];
const zAssignee = z.union([z.enum(['me', 'unassigned']), zId]);

const createDealTool = defineTool({
  name: 'create_deal',
  title: 'Create deal',
  description:
    'Create an open deal for a contact in a pipeline. Get pipeline and stage ids from list_pipelines; without stage_id the deal starts in the first stage. Value is in the workspace currency unless currency is given.',
  input: z
    .object({
      contact_id: zId,
      pipeline_id: zId,
      stage_id: zId.optional(),
      title: z.string().min(1).max(200),
      value: z.number().min(0).max(1e12).optional(),
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/)
        .optional(),
      expected_close_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('YYYY-MM-DD'),
      assigned_to: z.union([z.literal('me'), zId]).optional(),
      notes: z.string().max(5000).optional(),
    })
    .strict(),
  output: zDealOut,
  affectedIds: (_i, o) => [o.deal.id],
  async run(input, { service, gate }) {
    const d = await createDeal(
      service,
      {
        contactId: input.contact_id,
        pipelineId: input.pipeline_id,
        stageId: input.stage_id,
        title: input.title,
        value: input.value,
        currency: input.currency,
        expectedCloseDate: input.expected_close_date,
        assignedTo: input.assigned_to,
        notes: input.notes,
      },
      gate.currency ?? 'INR'
    );
    const deal = publicDeal(d);
    return { deal, untrusted_fields: DEAL_UNTRUSTED };
  },
});

const updateDealTool = defineTool({
  name: 'update_deal',
  title: 'Update deal',
  description:
    'Change a deal: move it to another stage (or pipeline), change title, value, expected close date (null clears), assignee ("me", "unassigned" or a member id) or notes. Use close_deal to mark it won or lost.',
  input: z
    .object({
      deal_id: zId,
      title: z.string().min(1).max(200).optional(),
      value: z.number().min(0).max(1e12).optional(),
      pipeline_id: zId.optional(),
      stage_id: zId.optional(),
      expected_close_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      assigned_to: zAssignee.optional(),
      notes: z.string().max(5000).nullable().optional(),
    })
    .strict(),
  output: zDealOut.extend({ changed: z.array(z.string()) }),
  idempotent: true,
  affectedIds: (i) => [i.deal_id],
  async run(input, { service, gate }) {
    const r = await updateDeal(
      service,
      input.deal_id,
      {
        title: input.title,
        value: input.value,
        pipelineId: input.pipeline_id,
        stageId: input.stage_id,
        expectedCloseDate: input.expected_close_date,
        assignedTo:
          input.assigned_to === 'unassigned' ? null : input.assigned_to,
        notes: input.notes,
      },
      gate.currency ?? 'INR'
    );
    const deal = publicDeal(r.deal);
    return {
      deal,
      changed: r.changed,
      untrusted_fields: DEAL_UNTRUSTED,
    };
  },
});

const closeDealTool = defineTool({
  name: 'close_deal',
  title: 'Close deal as won or lost',
  description: 'Mark a deal won or lost.',
  input: z.object({ deal_id: zId, outcome: z.enum(['won', 'lost']) }).strict(),
  output: zDealOut.extend({ previous_status: z.string() }),
  idempotent: true,
  affectedIds: (i) => [i.deal_id],
  async run(input, { service, gate }) {
    const r = await closeDeal(
      service,
      input.deal_id,
      input.outcome,
      gate.currency ?? 'INR'
    );
    const deal = publicDeal(r.deal);
    return {
      deal,
      previous_status: r.previous_status,
      untrusted_fields: DEAL_UNTRUSTED,
    };
  },
});

export const WRITE_TOOLS = [
  createContactTool,
  updateContactTool,
  addTagsTool,
  removeTagsTool,
  addNoteTool,
  setCustomFieldTool,
  updateStatusTool,
  assignTool,
  markReadTool,
  createDealTool,
  updateDealTool,
  closeDealTool,
];
