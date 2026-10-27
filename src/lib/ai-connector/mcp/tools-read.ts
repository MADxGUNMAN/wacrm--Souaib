// ============================================================
// AI connector — Phase 5 read tools (03 §4: team, contacts extras,
// message search, templates, pipelines and deals, broadcasts,
// automations and flows, analytics, notifications).
//
// Same rules as the Phase 3 tools: compact outputs, ids for everything a
// later write needs, other members only as { id, name }, and text written
// by customers or teammates in `untrusted_text` / `untrusted_fields`.
// ============================================================

import { z } from 'zod';
import { isValidTimeZone } from '@/lib/dashboard/date-utils';
import {
  getConversationTrend,
  getDashboardSummary,
  getResponseTimes,
  getTemplatePerformance,
} from '@/lib/services/analytics';
import {
  listAutomations,
  listFlows,
  FLOW_STATUSES,
} from '@/lib/services/automations';
import {
  BROADCAST_STATUSES,
  getBroadcast,
  listBroadcasts,
} from '@/lib/services/broadcasts';
import { ServiceError } from '@/lib/services/context';
import { searchMessages } from '@/lib/services/conversations';
import {
  DEAL_STATUSES,
  getDeal,
  listDeals,
  listPipelines,
} from '@/lib/services/deals';
import {
  TEMPLATE_STATUSES,
  getTemplate,
  listTemplates,
} from '@/lib/services/templates';
import {
  listContactNotes,
  listCustomFields,
  listNotifications,
  listTeamMembers,
} from '@/lib/services/workspace';
import {
  defineTool,
  untrusted,
  zCursor,
  zId,
  zLimit,
  zNextCursor,
  type ToolEnv,
} from './runtime';

/** Used when the AI doesn't pass one. Replai's customers are India-first. */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const zTimezone = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    `IANA timezone for "today" and day boundaries, e.g. Asia/Kolkata. Defaults to ${DEFAULT_TIMEZONE}.`
  );

function dayOpts(timezone: string | undefined, env: ToolEnv) {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  if (!isValidTimeZone(tz))
    throw new ServiceError(
      'invalid_input',
      `Unknown timezone "${tz}". Use an IANA name like Asia/Kolkata`
    );
  return { timeZone: tz, now: env.now };
}

const zMember = z
  .object({ id: z.string(), name: z.string().nullable() })
  .nullable();
const zMoney = z.object({ amount: z.number(), currency: z.string() });
const zUntrustedFields = z.array(z.string());
const zRange = z
  .union([z.literal(7), z.literal(30), z.literal(90)])
  .optional()
  .describe('Number of days: 7, 30 or 90. Default 30.');

// ------------------------------------------------------------
// Team, contacts extras, notifications
// ------------------------------------------------------------

const listTeamMembersTool = defineTool({
  name: 'list_team_members',
  title: 'List team members',
  description:
    'People in this Replai workspace with their ids and roles, for questions like "who is on the team" or to find a member id for assigned_to filters.',
  input: z.object({}).strict(),
  output: z.object({
    members: z.array(
      z.object({
        id: z.string(),
        name: z.string().nullable(),
        role: z.enum(['owner', 'member']),
        is_me: z.boolean(),
      })
    ),
  }),
  async run(_i, { service }) {
    return { members: await listTeamMembers(service) };
  },
});

const listCustomFieldsTool = defineTool({
  name: 'list_custom_fields',
  title: 'List custom contact fields',
  description:
    'The custom fields defined for contacts in this workspace: name, key, type and the allowed options for choice fields.',
  input: z.object({}).strict(),
  output: z.object({
    fields: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        key: z.string().nullable(),
        type: z.string(),
        options: z.array(z.string()),
        visible: z.boolean(),
      })
    ),
  }),
  async run(_i, { service }) {
    return { fields: await listCustomFields(service) };
  },
});

const listContactNotesTool = defineTool({
  name: 'list_contact_notes',
  title: 'List contact notes',
  description:
    'Notes your team wrote on one contact, newest first, with the author. Get the contact_id from search_contacts. Pass next_cursor for older notes.',
  input: z.object({ contact_id: zId, limit: zLimit, cursor: zCursor }).strict(),
  output: z.object({
    notes: z.array(
      z.object({
        id: z.string(),
        untrusted_text: z.string().nullable(),
        author: zMember,
        created_at: z.string(),
      })
    ),
    next_cursor: zNextCursor,
  }),
  async run(input, { service }) {
    const page = await listContactNotes(service, input.contact_id, {
      limit: input.limit,
      cursor: input.cursor,
    });
    return {
      notes: page.items.map((n) => ({
        id: n.id,
        untrusted_text: untrusted(n.note_text, 2000),
        author: n.author,
        created_at: n.created_at,
      })),
      next_cursor: page.nextCursor,
    };
  },
});

const listNotificationsTool = defineTool({
  name: 'list_notifications',
  title: 'List my notifications',
  description:
    "The signed-in user's Replai notifications (assignments, usage alerts, app connections), newest first. Unread only unless include_read is true.",
  input: z
    .object({ include_read: z.boolean().optional(), limit: zLimit })
    .strict(),
  output: z.object({
    notifications: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        body: z.string().nullable(),
        conversation_id: z.string().nullable(),
        contact_id: z.string().nullable(),
        read: z.boolean(),
        created_at: z.string(),
      })
    ),
    unread_total: z.number(),
  }),
  async run(input, { service }) {
    const r = await listNotifications(service, {
      unreadOnly: !input.include_read,
      limit: input.limit,
    });
    return { notifications: r.items, unread_total: r.unread_total };
  },
});

// ------------------------------------------------------------
// Messages
// ------------------------------------------------------------

const searchMessagesTool = defineTool({
  name: 'search_messages',
  title: 'Search messages',
  description:
    'Find WhatsApp messages in the last 90 days that contain some text (case-insensitive), optionally within one conversation. Returns the matching messages with their conversation and contact, newest first.',
  input: z
    .object({
      query: z.string().min(2).max(100).describe('Words or a phrase to find.'),
      conversation_id: zId.optional(),
      limit: zLimit,
    })
    .strict(),
  output: z.object({
    messages: z.array(
      z.object({
        id: z.string(),
        conversation_id: z.string(),
        direction: z.enum(['inbound', 'outbound']),
        untrusted_text: z.string().nullable(),
        created_at: z.string(),
        contact: z
          .object({
            id: z.string(),
            name: z.string().nullable(),
            phone: z.string(),
          })
          .nullable(),
      })
    ),
    searched_days: z.number(),
    untrusted_fields: zUntrustedFields,
  }),
  async run(input, { service, now }) {
    const hits = await searchMessages(
      service,
      {
        query: input.query,
        conversationId: input.conversation_id,
        limit: input.limit,
      },
      now
    );
    return {
      messages: hits.map((h) => ({
        id: h.id,
        conversation_id: h.conversation_id,
        direction: h.direction,
        untrusted_text: untrusted(h.content_text, 1000),
        created_at: h.created_at,
        contact: h.contact
          ? { ...h.contact, name: untrusted(h.contact.name, 200) }
          : null,
      })),
      searched_days: 90,
      untrusted_fields: ['messages[].contact.name'],
    };
  },
});

// ------------------------------------------------------------
// Templates
// ------------------------------------------------------------

const zRequirements = z.object({
  parameter_format: z.enum(['POSITIONAL', 'NAMED']),
  body_variables: z.object({ count: z.number(), names: z.array(z.string()) }),
  header: z.object({
    type: z.enum(['none', 'text', 'image', 'video', 'document', 'location']),
    needs_value: z.boolean(),
  }),
  url_buttons_needing_suffix: z.array(z.number()),
  special_type: z.string().nullable(),
});

const zTemplateRow = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  category: z.string(),
  status: z.string(),
  requirements: zRequirements,
});

const listTemplatesTool = defineTool({
  name: 'list_templates',
  title: 'List message templates',
  description:
    'WhatsApp message templates in this workspace with language, category, status and what a send needs (number of body variables, header media, URL button values). Approved templates only unless status is given. Templates are the only way to message a contact outside the 24-hour reply window.',
  input: z
    .object({
      status: z.enum([...TEMPLATE_STATUSES, 'all']).optional(),
      query: z
        .string()
        .max(100)
        .optional()
        .describe('Part of the template name.'),
    })
    .strict(),
  output: z.object({ templates: z.array(zTemplateRow) }),
  async run(input, { service }) {
    return {
      templates: await listTemplates(service, {
        status: input.status,
        query: input.query,
      }),
    };
  },
});

const getTemplateTool = defineTool({
  name: 'get_template',
  title: 'Get message template',
  description:
    "One template's full content and send requirements: header, body with its {{variables}}, footer, buttons, and for rejected templates the reason. Pass template_id, or name plus language.",
  input: z
    .object({
      template_id: zId.optional(),
      name: z.string().min(1).max(512).optional(),
      language: z.string().min(2).max(15).optional(),
    })
    .strict(),
  output: zTemplateRow.extend({
    header_text: z.string().nullable(),
    body_text: z.string(),
    footer_text: z.string().nullable(),
    buttons: z.array(z.object({ type: z.string(), text: z.string() })),
    rejection_reason: z.string().nullable(),
    quality_score: z.string().nullable(),
    updated_at: z.string(),
  }),
  async run(input, { service }) {
    return getTemplate(service, {
      id: input.template_id,
      name: input.name,
      language: input.language,
    });
  },
});

// ------------------------------------------------------------
// Pipelines and deals
// ------------------------------------------------------------

const listPipelinesTool = defineTool({
  name: 'list_pipelines',
  title: 'List pipelines',
  description:
    'Sales pipelines with their stages in order, and the number and value of open deals in each stage.',
  input: z.object({}).strict(),
  output: z.object({
    pipelines: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        stages: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            position: z.number(),
            open_deals: z.number(),
            open_value: z.number(),
          })
        ),
      })
    ),
    currency: z.string(),
  }),
  async run(_i, { service, gate }) {
    return {
      pipelines: await listPipelines(service),
      currency: gate.currency ?? 'INR',
    };
  },
});

export const zDeal = z.object({
  id: z.string(),
  title: z.string(),
  value: zMoney,
  status: z.string(),
  pipeline: z.object({ id: z.string(), name: z.string() }).nullable(),
  stage: z.object({ id: z.string(), name: z.string() }).nullable(),
  contact: z
    .object({ id: z.string(), name: z.string().nullable(), phone: z.string() })
    .nullable(),
  assigned_to: zMember,
  expected_close_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const listDealsTool = defineTool({
  name: 'list_deals',
  title: 'List deals',
  description:
    'Deals, newest first, filtered by pipeline, stage, status (open, won, lost), contact, assignee ("me", "unassigned" or a member id) or value range. Get pipeline and stage ids from list_pipelines. Pass next_cursor for more.',
  input: z
    .object({
      pipeline_id: zId.optional(),
      stage_id: zId.optional(),
      status: z.enum(DEAL_STATUSES).optional(),
      contact_id: zId.optional(),
      assigned_to: z.union([z.enum(['me', 'unassigned']), zId]).optional(),
      min_value: z.number().min(0).optional(),
      max_value: z.number().min(0).optional(),
      limit: zLimit,
      cursor: zCursor,
    })
    .strict(),
  output: z.object({
    deals: z.array(zDeal),
    next_cursor: zNextCursor,
    untrusted_fields: zUntrustedFields,
  }),
  async run(input, { service, gate }) {
    const page = await listDeals(service, {
      pipelineId: input.pipeline_id,
      stageId: input.stage_id,
      status: input.status,
      contactId: input.contact_id,
      assignedTo: input.assigned_to,
      minValue: input.min_value,
      maxValue: input.max_value,
      limit: input.limit,
      cursor: input.cursor,
      currency: gate.currency ?? 'INR',
    });
    return {
      deals: page.items.map((d) => ({
        ...d,
        contact: d.contact
          ? { ...d.contact, name: untrusted(d.contact.name, 200) }
          : null,
      })),
      next_cursor: page.nextCursor,
      untrusted_fields: ['deals[].title', 'deals[].contact.name'],
    };
  },
});

const getDealTool = defineTool({
  name: 'get_deal',
  title: 'Get deal',
  description:
    'One deal by id: value, pipeline and stage, contact, assignee, expected close date, notes and the linked conversation.',
  input: z.object({ deal_id: zId }).strict(),
  output: z.object({
    deal: zDeal,
    notes: z.object({ untrusted_text: z.string().nullable() }),
    conversation_id: z.string().nullable(),
    untrusted_fields: zUntrustedFields,
  }),
  async run(input, { service, gate }) {
    const d = await getDeal(service, input.deal_id, gate.currency ?? 'INR');
    const { notes, conversation_id, ...deal } = d;
    return {
      deal: {
        ...deal,
        contact: deal.contact
          ? { ...deal.contact, name: untrusted(deal.contact.name, 200) }
          : null,
      },
      notes: { untrusted_text: untrusted(notes, 2000) },
      conversation_id,
      untrusted_fields: ['deal.title', 'deal.contact.name'],
    };
  },
});

// ------------------------------------------------------------
// Broadcasts
// ------------------------------------------------------------

const zBroadcast = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  template: z.object({ name: z.string(), language: z.string().nullable() }),
  scheduled_at: z.string().nullable(),
  counts: z.object({
    recipients: z.number(),
    sent: z.number(),
    delivered: z.number(),
    read: z.number(),
    replied: z.number(),
    failed: z.number(),
  }),
  created_at: z.string(),
});

const listBroadcastsTool = defineTool({
  name: 'list_broadcasts',
  title: 'List broadcasts',
  description:
    'Broadcast campaigns, newest first, with status (draft, scheduled, sending, sent, failed), template and delivery counts. Pass next_cursor for more.',
  input: z
    .object({
      status: z.enum(BROADCAST_STATUSES).optional(),
      limit: zLimit,
      cursor: zCursor,
    })
    .strict(),
  output: z.object({
    broadcasts: z.array(zBroadcast),
    next_cursor: zNextCursor,
  }),
  async run(input, { service }) {
    const page = await listBroadcasts(service, input);
    return { broadcasts: page.items, next_cursor: page.nextCursor };
  },
});

const getBroadcastTool = defineTool({
  name: 'get_broadcast',
  title: 'Get broadcast results',
  description:
    'One broadcast: sent, delivered, read, replied and failed counts, and the most common failure reasons. Get the id from list_broadcasts.',
  input: z.object({ broadcast_id: zId }).strict(),
  output: z.object({
    broadcast: zBroadcast,
    top_failure_reasons: z.array(
      z.object({
        reason: z.string(),
        code: z.string().nullable(),
        count: z.number(),
      })
    ),
    failure_sample_size: z.number(),
  }),
  async run(input, { service }) {
    const { top_failure_reasons, failure_sample_size, ...broadcast } =
      await getBroadcast(service, input.broadcast_id);
    return { broadcast, top_failure_reasons, failure_sample_size };
  },
});

// ------------------------------------------------------------
// Automations and flows
// ------------------------------------------------------------

const listAutomationsTool = defineTool({
  name: 'list_automations',
  title: 'List automations',
  description:
    'Automations with their trigger, whether they are on, how many times they ran, when they last ran and failures in the last 7 days. Their step contents are not shown.',
  input: z.object({ active_only: z.boolean().optional() }).strict(),
  output: z.object({
    automations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        trigger_type: z.string(),
        active: z.boolean(),
        runs: z.number(),
        last_run_at: z.string().nullable(),
        failures_7d: z.number(),
      })
    ),
  }),
  async run(input, { service, now }) {
    return {
      automations: await listAutomations(
        service,
        { activeOnly: input.active_only },
        now
      ),
    };
  },
});

const listFlowsTool = defineTool({
  name: 'list_flows',
  title: 'List chatbot flows',
  description:
    'Chatbot flows with status (draft, active, archived), trigger, total runs, last run and how many conversations are inside the flow right now.',
  input: z.object({ status: z.enum(FLOW_STATUSES).optional() }).strict(),
  output: z.object({
    flows: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        trigger_type: z.string(),
        runs: z.number(),
        last_run_at: z.string().nullable(),
        active_runs: z.number(),
      })
    ),
  }),
  async run(input, { service }) {
    return { flows: await listFlows(service, { status: input.status }) };
  },
});

// ------------------------------------------------------------
// Analytics (same loaders as the Dashboard page)
// ------------------------------------------------------------

const getDashboardSummaryTool = defineTool({
  name: 'get_dashboard_summary',
  title: 'Get dashboard numbers',
  description:
    "Today's Dashboard cards: open conversations, new contacts today vs yesterday, open deals (count and value), and messages your team sent today vs yesterday. Same numbers as the Replai Dashboard.",
  input: z.object({ timezone: zTimezone }).strict(),
  output: z.object({
    date: z.string(),
    timezone: z.string(),
    active_conversations: z.object({
      current: z.number(),
      new_today_minus_new_yesterday: z.number(),
    }),
    new_contacts: z.object({ today: z.number(), yesterday: z.number() }),
    open_deals: z.object({ count: z.number(), value: z.number() }),
    messages_sent: z.object({ today: z.number(), yesterday: z.number() }),
    currency: z.string(),
  }),
  async run(input, env) {
    const s = await getDashboardSummary(
      env.service,
      dayOpts(input.timezone, env)
    );
    return { ...s, currency: env.gate.currency ?? 'INR' };
  },
});

const getConversationTrendTool = defineTool({
  name: 'get_conversation_trend',
  title: 'Get message trend',
  description:
    'Inbound and outbound WhatsApp messages per day for the last 7, 30 or 90 days, plus totals.',
  input: z.object({ days: zRange, timezone: zTimezone }).strict(),
  output: z.object({
    timezone: z.string(),
    days: z.array(
      z.object({ date: z.string(), inbound: z.number(), outbound: z.number() })
    ),
    totals: z.object({ inbound: z.number(), outbound: z.number() }),
  }),
  async run(input, env) {
    return getConversationTrend(
      env.service,
      input.days ?? 30,
      dayOpts(input.timezone, env)
    );
  },
});

const getResponseTimesTool = defineTool({
  name: 'get_response_times',
  title: 'Get response times',
  description:
    'Average time to first reply after a customer message, by weekday over the last 14 days, plus this week vs last week.',
  input: z.object({ timezone: zTimezone }).strict(),
  output: z.object({
    timezone: z.string(),
    window_days: z.number(),
    by_weekday: z.array(
      z.object({
        weekday: z.string(),
        avg_minutes: z.number().nullable(),
        samples: z.number(),
      })
    ),
    this_week_avg_minutes: z.number().nullable(),
    last_week_avg_minutes: z.number().nullable(),
  }),
  async run(input, env) {
    return getResponseTimes(env.service, dayOpts(input.timezone, env));
  },
});

const getTemplatePerformanceTool = defineTool({
  name: 'get_template_performance',
  title: 'Get template performance',
  description:
    'Sent, delivered, read, clicked and replied counts (and spend when Meta reports it) per template over the last 7, 30 or 90 days, most sent first.',
  input: z.object({ days: zRange, timezone: zTimezone }).strict(),
  output: z.object({
    timezone: z.string(),
    from: z.string(),
    to: z.string(),
    templates: z.array(
      z.object({
        template_id: z.string(),
        name: z.string(),
        language: z.string().nullable(),
        sent: z.number(),
        delivered: z.number(),
        read: z.number(),
        clicked: z.number(),
        replied: z.number(),
        spent: zMoney.nullable(),
      })
    ),
    note: z.string(),
  }),
  async run(input, env) {
    return getTemplatePerformance(
      env.service,
      input.days ?? 30,
      dayOpts(input.timezone, env)
    );
  },
});

export const READ_TOOLS = [
  listTeamMembersTool,
  listCustomFieldsTool,
  listContactNotesTool,
  listNotificationsTool,
  searchMessagesTool,
  listTemplatesTool,
  getTemplateTool,
  listPipelinesTool,
  listDealsTool,
  getDealTool,
  listBroadcastsTool,
  getBroadcastTool,
  listAutomationsTool,
  listFlowsTool,
  getDashboardSummaryTool,
  getConversationTrendTool,
  getResponseTimesTool,
  getTemplatePerformanceTool,
];
