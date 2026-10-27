// ============================================================
// Live Chat visibility — the rule. Pure, no I/O, safe on the client.
//
// EVERY place that decides whether a workspace can use Live chat goes
// through `computeSupportAccess`: the tenant API routes, the availability
// endpoint, the reply-email cron, the admin inbox badges and the settings
// page's "has access" column. One function is what keeps the settings
// page, the CRM and the server from ever disagreeing about the same
// workspace.
//
// Order of evaluation (first match wins):
//
//   1. master switch off            → no  ('disabled')
//   2. override 'deny'              → no  ('blocked')
//   3. override 'allow'             → yes ('granted')
//   4. rule 'all'                   → yes ('all')
//   5. rule 'whatsapp_connected'    → yes if connected
//                                     ('whatsapp_connected' / 'whatsapp_not_connected')
//   6. rule 'selected'              → no  ('not_selected')
//
// The master switch beats overrides on purpose. "Turn Live chat off"
// must mean off for everyone, instantly — an operator should never have
// to remember that three workspaces had been hand-allowed months ago.
// ============================================================

export type SupportVisibility = 'all' | 'whatsapp_connected' | 'selected';

/** A stored override. `null` = no row = follow the rule. */
export type SupportOverrideMode = 'allow' | 'deny';

/** What the settings page offers per workspace. */
export type SupportOverrideChoice = 'default' | SupportOverrideMode;

export type SupportOverrideSource = 'manual' | 'admin_message';

export interface SupportChatSettings {
  enabled: boolean;
  visibility: SupportVisibility;
  widgetEnabled: boolean;
  welcomeMessage: string | null;
  updatedAt: string | null;
}

export const DEFAULT_SUPPORT_SETTINGS: SupportChatSettings = {
  enabled: true,
  visibility: 'all',
  widgetEnabled: true,
  welcomeMessage: null,
  updatedAt: null,
};

export type SupportAccessReason =
  | 'disabled'
  | 'blocked'
  | 'granted'
  | 'all'
  | 'whatsapp_connected'
  | 'whatsapp_not_connected'
  | 'not_selected';

export interface SupportAccess {
  available: boolean;
  reason: SupportAccessReason;
}

export function computeSupportAccess(input: {
  settings: Pick<SupportChatSettings, 'enabled' | 'visibility'>;
  override: SupportOverrideMode | null;
  whatsappConnected: boolean;
}): SupportAccess {
  const { settings, override, whatsappConnected } = input;

  if (!settings.enabled) return { available: false, reason: 'disabled' };
  if (override === 'deny') return { available: false, reason: 'blocked' };
  if (override === 'allow') return { available: true, reason: 'granted' };

  switch (settings.visibility) {
    case 'all':
      return { available: true, reason: 'all' };
    case 'whatsapp_connected':
      return whatsappConnected
        ? { available: true, reason: 'whatsapp_connected' }
        : { available: false, reason: 'whatsapp_not_connected' };
    case 'selected':
    default:
      // Unknown values fail CLOSED. A typo in the rule must not quietly
      // open the chat to every workspace.
      return { available: false, reason: 'not_selected' };
  }
}

/** Short, operator-facing explanation of a result. */
export function describeSupportAccess(access: SupportAccess): string {
  switch (access.reason) {
    case 'disabled':
      return 'Live chat is turned off for everyone';
    case 'blocked':
      return 'Blocked for this workspace';
    case 'granted':
      return 'Allowed for this workspace';
    case 'all':
      return 'Everyone has access';
    case 'whatsapp_connected':
      return 'WhatsApp is connected';
    case 'whatsapp_not_connected':
      return 'WhatsApp is not connected';
    case 'not_selected':
      return 'Not selected';
  }
}

export const SUPPORT_VISIBILITY_OPTIONS: {
  value: SupportVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: 'all',
    label: 'Every workspace',
    description: 'All customers can open Live chat.',
  },
  {
    value: 'whatsapp_connected',
    label: 'Only workspaces with WhatsApp connected',
    description:
      'Customers see Live chat once their WhatsApp number is connected, and lose it if it disconnects.',
  },
  {
    value: 'selected',
    label: 'Only workspaces I choose',
    description:
      'Nobody sees Live chat unless you allow them below — or message them from the Live chat inbox.',
  },
];

export const SUPPORT_WELCOME_MAX = 280;

export function isSupportVisibility(
  value: unknown
): value is SupportVisibility {
  return (
    value === 'all' || value === 'whatsapp_connected' || value === 'selected'
  );
}
