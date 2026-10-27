// ============================================================
// Effective-permission evaluation for AI connector tool calls (D7).
//
// A tool runs only if ALL layers allow it:
//   1. account state  — kill switches, ban, subscription, allowlist, lock
//   2. workspace policy (owner)
//   3. live role + member permissions (same rules as the dashboard)
//   4. connection settings (per user, per app)
//   5. OAuth scopes (what the user consented to)
//
// Scope is checked LAST on purpose: a missing scope triggers a browser
// re-consent (step-up), which is pointless — and confusing — when a
// policy or role would refuse the call anyway. The one exception is a
// connection group switch whose scope was never granted: that switch is
// off only BECAUSE of the missing scope, so it must not block step-up.
//
// Pure: callers load the inputs; `tools/list` filtering and execution
// both call this so they can never disagree.
// Plan: docs/ai-connector/04-permissions-and-crm-ui.md §1, §6.
// ============================================================

import { hasSectionAccess, type AccountRole } from '@/lib/auth/roles';
import type { MemberPermissions } from '@/types';
import type { Platform } from './platforms';
import { AI_SCOPES, isAiScope, type AiScope } from './scopes';
import {
  tierRank,
  type ConnectionSettings,
  type WorkspacePolicy,
} from './settings';
import { getToolSpec, tierOf, TOOL_NAMES, type ToolName } from './tool-catalog';

export type DenyLayer = 'account' | 'policy' | 'role' | 'connection' | 'scope';

export type DenyCode =
  | 'connector_disabled'
  | 'platform_disabled'
  | 'account_not_allowed'
  | 'account_banned'
  | 'subscription_required'
  | 'ai_locked'
  | 'policy_disabled'
  | 'policy_platform'
  | 'policy_members'
  | 'policy_tier'
  | 'policy_messaging'
  | 'policy_broadcasts'
  | 'policy_automations'
  | 'role_section'
  | 'connection_read_only'
  | 'connection_group'
  | 'missing_scope';

export interface AccessInput {
  tool: ToolName;
  grantedScopes: readonly string[];
  settings: ConnectionSettings;
  policy: WorkspacePolicy;
  role: AccountRole;
  memberPermissions: MemberPermissions | null;
  platform: Platform;
  /**
   * A development client (trust `dev_only`, which only exists when
   * AI_CONNECTOR_ALLOW_DEV_CLIENTS is on). Exempt from the workspace's
   * platform allowlist — that list names real platforms — but from
   * nothing else.
   */
  devClient?: boolean;
  account: {
    connectorEnabled: boolean;
    platformEnabled: boolean;
    allowlisted: boolean;
    banned: boolean;
    subscriptionBlocked: boolean;
  };
}

export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      layer: DenyLayer;
      code: DenyCode;
      /** Shown to the user through the model. Plain language, no internals. */
      message: string;
      /** Relative path in the CRM where the user can change it, if any. */
      fixPath?: string;
      /** For step-up: every scope the token should end up with. */
      requiredScopes?: AiScope[];
    };

export const SETTINGS_PATH = '/settings?tab=ai-connectors';

const SECTION_LABELS: Record<string, string> = {
  contacts: 'Contacts',
  inbox: 'Inbox',
  pipelines: 'Pipelines',
  broadcasts: 'Broadcasts',
  automations: 'Automations',
  dashboard: 'Dashboard',
};

const GROUP_LABELS: Record<string, string> = {
  edit_records: 'Editing records',
  send_messages: 'Sending messages',
  broadcasts: 'Broadcasts',
  automations: 'Turning automations on or off',
};

function deny(
  layer: DenyLayer,
  code: DenyCode,
  message: string,
  extra: { fixPath?: string; requiredScopes?: AiScope[] } = {}
): AccessDecision {
  return { allowed: false, layer, code, message, ...extra };
}

export function evaluateToolAccess(input: AccessInput): AccessDecision {
  const spec = getToolSpec(input.tool);
  const { account, policy, settings } = input;
  const appName = 'this AI app';

  // 1. Account state
  if (!account.connectorEnabled) {
    return deny(
      'account',
      'connector_disabled',
      'Replai AI connectors are temporarily unavailable.'
    );
  }
  if (!account.platformEnabled) {
    return deny(
      'account',
      'platform_disabled',
      `Replai is not available for ${appName} right now.`
    );
  }
  if (!account.allowlisted) {
    return deny(
      'account',
      'account_not_allowed',
      'AI connectors are not enabled for this workspace yet.'
    );
  }
  if (account.banned) {
    return deny(
      'account',
      'account_banned',
      'This workspace has been suspended.'
    );
  }
  if (account.subscriptionBlocked) {
    return deny(
      'account',
      'subscription_required',
      'This workspace needs an active subscription to continue.'
    );
  }
  if (policy.locked_by_platform) {
    return deny(
      'account',
      'ai_locked',
      'AI connectors have been switched off for this workspace by Replai.'
    );
  }

  // 2. Workspace policy
  if (!policy.enabled) {
    return deny(
      'policy',
      'policy_disabled',
      'Your workspace owner has switched off AI connectors.',
      {
        fixPath: SETTINGS_PATH,
      }
    );
  }
  if (!policy.allowed_platforms.includes(input.platform)) {
    return deny(
      'policy',
      'policy_platform',
      `Your workspace owner hasn't allowed ${appName} for this workspace.`,
      {
        fixPath: SETTINGS_PATH,
      }
    );
  }
  const isOwner = input.role === 'owner';
  if (!isOwner && !policy.members_allowed) {
    return deny(
      'policy',
      'policy_members',
      'Your workspace owner allows AI connectors for owners only.'
    );
  }
  if (!isOwner && tierRank(tierOf(spec)) > tierRank(policy.max_member_tier)) {
    return deny(
      'policy',
      'policy_tier',
      "Your workspace owner doesn't allow this kind of action from AI apps for members."
    );
  }
  if (spec.group === 'send_messages' && !policy.allow_messaging) {
    return deny(
      'policy',
      'policy_messaging',
      'Your workspace owner has switched off sending messages from AI apps.',
      {
        fixPath: SETTINGS_PATH,
      }
    );
  }
  if (spec.group === 'broadcasts' && !policy.allow_broadcasts) {
    return deny(
      'policy',
      'policy_broadcasts',
      'Your workspace owner has switched off broadcasts for AI apps.',
      {
        fixPath: SETTINGS_PATH,
      }
    );
  }
  if (spec.group === 'automations' && !policy.allow_automation_changes) {
    return deny(
      'policy',
      'policy_automations',
      'Your workspace owner has switched off turning automations on or off from AI apps.',
      { fixPath: SETTINGS_PATH }
    );
  }

  // 3. Live role + member permissions
  if (spec.section && !isOwner) {
    const perms = (input.memberPermissions ?? null) as Record<
      string,
      boolean | undefined
    > | null;
    if (!hasSectionAccess(input.role, perms, spec.section)) {
      const label = SECTION_LABELS[spec.section] ?? spec.section;
      return deny(
        'role',
        'role_section',
        `Your Replai role doesn't include ${label}. Ask the workspace owner for access.`
      );
    }
  }

  // 4. Connection settings
  if (!spec.readOnly && settings.read_only && spec.group !== 'account') {
    return deny(
      'connection',
      'connection_read_only',
      'This connection is set to read-only in Replai.',
      {
        fixPath: SETTINGS_PATH,
      }
    );
  }
  // A group switch only counts as the user's choice once its scope was
  // granted. Consent turns the switch off for every tier it didn't grant
  // (settingsAfterConsent) and Settings won't let it be turned on until
  // the scope exists, so denying here would leave no way forward: the
  // call has to reach step 5 and ask for the scope. Approving it turns
  // the switch on.
  if (
    spec.group !== 'account' &&
    spec.group !== 'view' &&
    !settings.groups[spec.group] &&
    input.grantedScopes.includes(spec.scope)
  ) {
    return deny(
      'connection',
      'connection_group',
      `${GROUP_LABELS[spec.group]} is switched off for this connection. You can turn it on in Replai → Settings → AI Connectors.`,
      { fixPath: SETTINGS_PATH }
    );
  }

  // 5. OAuth scopes
  if (!input.grantedScopes.includes(spec.scope)) {
    // List EVERY scope the token should end with, not just the missing
    // one: Claude doesn't carry earlier step-ups forward (Phase 0, S4).
    const required = new Set<AiScope>(input.grantedScopes.filter(isAiScope));
    required.add(spec.scope);
    required.add('profile');
    return deny(
      'scope',
      'missing_scope',
      'This needs one more permission. Approve it in the browser window to continue.',
      {
        requiredScopes: AI_SCOPES.filter((s) => required.has(s)),
      }
    );
  }

  return { allowed: true };
}

/**
 * Tools to advertise in `tools/list`: allowed ones, plus ones blocked
 * only by a missing scope (so the model can call them and trigger
 * step-up). Tools blocked by role, policy or settings are hidden.
 * Account-state denials hide nothing (the gate refuses every call).
 */
export function visibleTools(input: Omit<AccessInput, 'tool'>): ToolName[] {
  return TOOL_NAMES.filter((tool) =>
    isListed(evaluateToolAccess({ ...input, tool }))
  );
}

/**
 * Denials that block the WHOLE connection rather than one kind of
 * action. Hiding every tool for these would leave the model with "tool
 * not found"; listing them lets each call explain why it was refused.
 */
const CONNECTION_WIDE: ReadonlySet<DenyCode> = new Set([
  'policy_disabled',
  'policy_platform',
  'policy_members',
]);

/** Whether a tool with this decision belongs in `tools/list`. */
export function isListed(d: AccessDecision): boolean {
  return (
    d.allowed ||
    d.layer === 'scope' ||
    d.layer === 'account' ||
    // The user's own switches (read-only, a group turned off): keep the
    // tool listed so the call can say "switched off in Replai → Settings"
    // with the link, instead of the model concluding the tool doesn't exist.
    d.layer === 'connection' ||
    CONNECTION_WIDE.has(d.code)
  );
}
