// Client-side types and helpers for Settings → AI Connectors.

import { formatDistanceToNow } from 'date-fns';
import type {
  ActivityView,
  ConnectionView,
  GroupBlock,
  SettingsGroup,
} from '@/lib/ai-connector/manage';
import type { Platform } from '@/lib/ai-connector/platforms';
import type { ConsentTier } from '@/lib/ai-connector/scopes';
import type { WorkspacePolicy } from '@/lib/ai-connector/settings';

export type { ActivityView, ConnectionView, SettingsGroup, WorkspacePolicy };

export interface ConnectorOverview {
  connector: {
    enabled: boolean;
    account_allowed: boolean;
    mcp_url: string | null;
  };
  is_owner: boolean;
  connections: ConnectionView[];
  team: ConnectionView[];
  policy: WorkspacePolicy;
  policy_platforms: Platform[];
}

/** The two platforms shown as cards; anything else is listed below them. */
export const PRIMARY_PLATFORMS = [
  'claude',
  'chatgpt',
] as const satisfies readonly Platform[];
export type PrimaryPlatform = (typeof PRIMARY_PLATFORMS)[number];

export const PLATFORM_NAMES: Record<Platform, string> = {
  claude: 'Claude',
  claude_code: 'Claude Code',
  chatgpt: 'ChatGPT',
  codex: 'Codex',
  mcp_inspector: 'MCP Inspector',
  other: 'Other app',
};

/**
 * Official directory listings. A listing is bound to the MCP server it was
 * reviewed with, so it is only offered when THIS deployment serves that
 * URL: on devcrm or locally the published plugin would connect to
 * production instead, and the manual guide is shown there.
 * Claude is still in review; add it here once its listing is live.
 */
export const DIRECTORY_LISTINGS: Partial<
  Record<PrimaryPlatform, { url: string; mcpUrl: string }>
> = {
  chatgpt: {
    url: 'https://chatgpt.com/plugins/plugin_asdk_app_6ac8dee28e288191b785a43de4cac406',
    mcpUrl: 'https://wacrm.junkiescoder.com/mcp',
  },
};

/**
 * The official listing URL for `platform`, or null when it isn't listed
 * yet (manual guide). Offered on every deployment: dev and production
 * share one database, so a connection made through the published plugin
 * (which talks to the production MCP server) still shows up here.
 */
export function directoryListingUrl(platform: PrimaryPlatform): string | null {
  return DIRECTORY_LISTINGS[platform]?.url ?? null;
}

/**
 * True when this deployment is not the server the listing was reviewed
 * with (devcrm, local). The dialog then mentions that the plugin connects
 * through production and offers the manual steps as an alternative.
 */
export function listingIsRemote(
  platform: PrimaryPlatform,
  mcpUrl: string | null | undefined
): boolean {
  const listing = DIRECTORY_LISTINGS[platform];
  if (!listing || !mcpUrl) return false;
  return mcpUrl.replace(/\/+$/, '') !== listing.mcpUrl;
}

export const TIER_LABELS: Record<Exclude<ConsentTier, 'always'>, string> = {
  view: 'View',
  edit: 'Edit',
  send: 'Send',
  broadcast: 'Broadcasts',
  automations: 'Automations',
};

export const GROUP_LABELS: Record<
  SettingsGroup,
  { title: string; desc: string }
> = {
  edit_records: {
    title: 'Edit records',
    desc: 'Create and update contacts, tags, notes, deals and conversation status.',
  },
  send_messages: {
    title: 'Send messages',
    desc: 'Send WhatsApp messages and templates to contacts.',
  },
  send_to_new_numbers: {
    title: 'Send to numbers not in contacts',
    desc: 'Allow messages to phone numbers that are not saved as contacts yet.',
  },
  broadcasts: {
    title: 'Broadcasts',
    desc: 'Send a template to many contacts at once.',
  },
  automations: {
    title: 'Automations on/off',
    desc: 'Turn automations and flows on or off.',
  },
};

export function blockMessage(
  block: GroupBlock,
  appName: string
): string | null {
  switch (block) {
    case 'not_granted':
      return `Not granted when you connected. Disconnect and connect ${appName} again to choose it, or ask ${appName} to do it once and approve the request.`;
    case 'policy':
      return 'Switched off for the workspace by the owner.';
    case 'member_limit':
      return 'Not available to members in this workspace.';
    default:
      return null;
  }
}

const ACTION_LABELS: Record<string, string> = {
  'oauth.connected': 'Connected',
  'oauth.reconnected': 'Reconnected',
  'oauth.refresh_reuse': 'Disconnected (security check)',
  'oauth.code_reuse': 'Disconnected (security check)',
  'oauth.revoked_by_client': 'Disconnected in the app',
  'oauth.revoked_idle': 'Disconnected (unused)',
  'settings.connection_updated': 'Settings changed in Replai',
  'settings.disconnected': 'Disconnected in Replai',
  'settings.disconnected_by_owner': 'Disconnected by the owner',
  'settings.policy_updated': 'Workspace policy changed',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? 'never'
    : formatDistanceToNow(t, { addSuffix: true });
}

/** fetch → JSON, throwing the server's `error` message on failure. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok)
    throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body;
}
