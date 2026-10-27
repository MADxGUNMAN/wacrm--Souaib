// ============================================================
// The AI connector tool catalog — one row per tool in
// docs/ai-connector/03-tools.md §4. This is the single source of truth
// for which scope, permission group, member section and annotations each
// tool has. Tool handlers (Phase 3+) are registered against these names,
// and a test checks that every registered tool appears here.
// ============================================================

import type { AiScope } from './scopes';

/** Connection-settings switch that controls a tool (04 §2.2). */
export type ToolGroup =
  | 'account'
  | 'view'
  | 'edit_records'
  | 'send_messages'
  | 'broadcasts'
  | 'automations';

/** Member permission key from MemberPermissions, or null for account tools. */
export type MemberSection =
  | 'contacts'
  | 'inbox'
  | 'pipelines'
  | 'broadcasts'
  | 'automations'
  | 'dashboard'
  | null;

/** Capability tier compared with the workspace's max_member_tier. */
export type CapabilityTier = 'view' | 'edit' | 'send';

/**
 * When a tool needs preview → confirm:
 *  - 'always': every call (send_broadcast)
 *  - 'bulk':   above BULK_CONFIRM_THRESHOLD records
 *  - 'policy': when the workspace requires a preview for sends
 */
export type TwoStep = 'always' | 'bulk' | 'policy';

export interface ToolSpec {
  scope: AiScope;
  group: ToolGroup;
  section: MemberSection;
  readOnly: boolean;
  destructive: boolean;
  openWorld: boolean;
  twoStep?: TwoStep;
  phase: 3 | 4 | 5 | 6 | 7;
}

export const BULK_CONFIRM_THRESHOLD = 25;

const read = (
  scope: AiScope,
  section: MemberSection,
  phase: ToolSpec['phase']
): ToolSpec => ({
  scope,
  group: scope === 'profile' ? 'account' : 'view',
  section,
  readOnly: true,
  destructive: false,
  openWorld: false,
  phase,
});

const write = (
  scope: AiScope,
  group: ToolGroup,
  section: MemberSection,
  phase: ToolSpec['phase'],
  opts: { destructive: boolean; openWorld?: boolean; twoStep?: TwoStep }
): ToolSpec => ({
  scope,
  group,
  section,
  readOnly: false,
  destructive: opts.destructive,
  openWorld: opts.openWorld ?? false,
  ...(opts.twoStep ? { twoStep: opts.twoStep } : {}),
  phase,
});

export const TOOL_CATALOG = {
  // 4.1 Account and connection
  get_profile: read('profile', null, 3),
  get_my_permissions: read('profile', null, 3),
  restrict_my_permissions: write('profile', 'account', null, 4, {
    destructive: true,
  }),
  disconnect: write('profile', 'account', null, 4, { destructive: true }),
  list_team_members: read('conversations:read', 'inbox', 5),

  // 4.2 Contacts
  search_contacts: read('contacts:read', 'contacts', 3),
  get_contact: read('contacts:read', 'contacts', 3),
  list_tags: read('contacts:read', 'contacts', 3),
  list_custom_fields: read('contacts:read', 'contacts', 5),
  list_contact_notes: read('contacts:read', 'contacts', 5),
  create_contact: write('contacts:write', 'edit_records', 'contacts', 6, {
    destructive: false,
  }),
  update_contact: write('contacts:write', 'edit_records', 'contacts', 6, {
    destructive: true,
  }),
  add_tags_to_contacts: write('contacts:write', 'edit_records', 'contacts', 6, {
    destructive: false,
    twoStep: 'bulk',
  }),
  remove_tags_from_contacts: write(
    'contacts:write',
    'edit_records',
    'contacts',
    6,
    { destructive: true, twoStep: 'bulk' }
  ),
  add_contact_note: write('contacts:write', 'edit_records', 'contacts', 6, {
    destructive: false,
  }),
  set_custom_field: write('contacts:write', 'edit_records', 'contacts', 6, {
    destructive: true,
  }),

  // 4.3 Inbox
  list_conversations: read('conversations:read', 'inbox', 3),
  get_conversation: read('conversations:read', 'inbox', 3),
  get_messages: read('messages:read', 'inbox', 3),
  search_messages: read('messages:read', 'inbox', 5),
  update_conversation_status: write(
    'conversations:write',
    'edit_records',
    'inbox',
    6,
    { destructive: true }
  ),
  assign_conversation: write(
    'conversations:write',
    'edit_records',
    'inbox',
    6,
    { destructive: true }
  ),
  mark_conversation_read: write(
    'conversations:write',
    'edit_records',
    'inbox',
    6,
    { destructive: false }
  ),

  // 4.4 Messaging
  list_templates: read('templates:read', 'broadcasts', 5),
  get_template: read('templates:read', 'broadcasts', 5),
  send_text_message: write('messages:send', 'send_messages', 'inbox', 7, {
    destructive: true,
    openWorld: true,
    twoStep: 'policy',
  }),
  send_template_message: write('messages:send', 'send_messages', 'inbox', 7, {
    destructive: true,
    openWorld: true,
    twoStep: 'policy',
  }),

  // 4.5 Pipelines and deals
  list_pipelines: read('deals:read', 'pipelines', 5),
  list_deals: read('deals:read', 'pipelines', 5),
  get_deal: read('deals:read', 'pipelines', 5),
  create_deal: write('deals:write', 'edit_records', 'pipelines', 6, {
    destructive: false,
  }),
  update_deal: write('deals:write', 'edit_records', 'pipelines', 6, {
    destructive: true,
  }),
  close_deal: write('deals:write', 'edit_records', 'pipelines', 6, {
    destructive: true,
  }),

  // 4.6 Broadcasts
  list_broadcasts: read('broadcasts:read', 'broadcasts', 5),
  get_broadcast: read('broadcasts:read', 'broadcasts', 5),
  preview_broadcast: write('broadcasts:send', 'broadcasts', 'broadcasts', 7, {
    destructive: false,
  }),
  send_broadcast: write('broadcasts:send', 'broadcasts', 'broadcasts', 7, {
    destructive: true,
    openWorld: true,
    twoStep: 'always',
  }),
  cancel_scheduled_broadcast: write(
    'broadcasts:send',
    'broadcasts',
    'broadcasts',
    7,
    { destructive: true }
  ),

  // 4.7 Automations and flows
  list_automations: read('automations:read', 'automations', 5),
  list_flows: read('automations:read', 'automations', 5),
  set_automation_active: write(
    'automations:manage',
    'automations',
    'automations',
    7,
    { destructive: true }
  ),
  set_flow_status: write(
    'automations:manage',
    'automations',
    'automations',
    7,
    { destructive: true }
  ),

  // 4.8 Analytics and notifications
  get_dashboard_summary: read('analytics:read', 'dashboard', 5),
  get_conversation_trend: read('analytics:read', 'dashboard', 5),
  get_response_times: read('analytics:read', 'dashboard', 5),
  get_template_performance: read('analytics:read', 'dashboard', 5),
  list_notifications: read('profile', null, 5),
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOL_CATALOG;

export const TOOL_NAMES = Object.keys(TOOL_CATALOG).sort() as ToolName[];

export function isToolName(value: unknown): value is ToolName {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(TOOL_CATALOG, value)
  );
}

export function getToolSpec(name: ToolName): ToolSpec {
  return TOOL_CATALOG[name];
}

/** Tier a tool needs, for the workspace's max_member_tier rule. */
export function tierOf(spec: ToolSpec): CapabilityTier {
  switch (spec.group) {
    case 'account':
    case 'view':
      return 'view';
    case 'edit_records':
      return 'edit';
    default:
      return 'send';
  }
}

/** MCP tool annotations derived from the catalog (both platforms review these). */
export function annotationsFor(spec: ToolSpec) {
  return {
    readOnlyHint: spec.readOnly,
    destructiveHint: spec.destructive,
    openWorldHint: spec.openWorld,
  };
}
