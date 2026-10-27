import { describe, expect, it } from 'vitest';
import { DEFAULT_MEMBER_PERMISSIONS, type MemberPermissions } from '@/types';
import { evaluateToolAccess, visibleTools, type AccessInput } from './policy';
import { AI_SCOPES } from './scopes';
import {
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_WORKSPACE_POLICY,
  type ConnectionSettings,
  type WorkspacePolicy,
} from './settings';
import {
  TOOL_CATALOG,
  TOOL_NAMES,
  getToolSpec,
  type ToolName,
} from './tool-catalog';

const ALL_SCOPES = [...AI_SCOPES];

function input(over: Partial<AccessInput> & { tool: ToolName }): AccessInput {
  return {
    grantedScopes: ALL_SCOPES,
    settings: structuredClone({
      ...DEFAULT_CONNECTION_SETTINGS,
      groups: {
        ...DEFAULT_CONNECTION_SETTINGS.groups,
        broadcasts: true,
        automations: true,
      },
    }),
    policy: {
      ...DEFAULT_WORKSPACE_POLICY,
      allow_broadcasts: true,
      allow_automation_changes: true,
    },
    role: 'owner',
    memberPermissions: null,
    platform: 'claude',
    account: {
      connectorEnabled: true,
      platformEnabled: true,
      allowlisted: true,
      banned: false,
      subscriptionBlocked: false,
    },
    ...over,
  };
}

const allMember: MemberPermissions = {
  ...DEFAULT_MEMBER_PERMISSIONS,
  inbox: true,
  contacts: true,
  pipelines: true,
  broadcasts: true,
  automations: true,
  dashboard: true,
};

describe('evaluateToolAccess', () => {
  it('lets an owner with every scope and switch on run every tool', () => {
    for (const tool of TOOL_NAMES) {
      expect(evaluateToolAccess(input({ tool }))).toEqual({ allowed: true });
    }
  });

  it.each([
    ['connectorEnabled', 'connector_disabled'],
    ['platformEnabled', 'platform_disabled'],
    ['allowlisted', 'account_not_allowed'],
  ] as const)('refuses every tool when %s is false', (flag, code) => {
    for (const tool of TOOL_NAMES) {
      const base = input({ tool });
      const d = evaluateToolAccess({
        ...base,
        account: { ...base.account, [flag]: false },
      });
      expect(d).toMatchObject({ allowed: false, layer: 'account', code });
    }
  });

  it('refuses banned, lapsed and platform-locked workspaces', () => {
    const base = input({ tool: 'search_contacts' });
    expect(
      evaluateToolAccess({
        ...base,
        account: { ...base.account, banned: true },
      })
    ).toMatchObject({
      code: 'account_banned',
    });
    expect(
      evaluateToolAccess({
        ...base,
        account: { ...base.account, subscriptionBlocked: true },
      })
    ).toMatchObject({
      code: 'subscription_required',
    });
    expect(
      evaluateToolAccess({
        ...base,
        policy: { ...base.policy, locked_by_platform: true },
      })
    ).toMatchObject({
      code: 'ai_locked',
    });
  });

  it('applies the workspace policy', () => {
    const p = (over: Partial<WorkspacePolicy>) => ({
      ...DEFAULT_WORKSPACE_POLICY,
      allow_broadcasts: true,
      allow_automation_changes: true,
      ...over,
    });
    expect(
      evaluateToolAccess(
        input({ tool: 'get_profile', policy: p({ enabled: false }) })
      )
    ).toMatchObject({ code: 'policy_disabled' });
    expect(
      evaluateToolAccess(
        input({
          tool: 'get_profile',
          policy: p({ allowed_platforms: ['chatgpt'] }),
        })
      )
    ).toMatchObject({
      code: 'policy_platform',
    });
    expect(
      evaluateToolAccess(
        input({
          tool: 'send_text_message',
          policy: p({ allow_messaging: false }),
        })
      )
    ).toMatchObject({
      code: 'policy_messaging',
    });
    expect(
      evaluateToolAccess(
        input({
          tool: 'send_broadcast',
          policy: p({ allow_broadcasts: false }),
        })
      )
    ).toMatchObject({
      code: 'policy_broadcasts',
    });
    expect(
      evaluateToolAccess(
        input({
          tool: 'set_flow_status',
          policy: p({ allow_automation_changes: false }),
        })
      )
    ).toMatchObject({
      code: 'policy_automations',
    });
  });

  it('broadcasts and automation switches are off by default', () => {
    const d = {
      ...input({ tool: 'send_broadcast' }),
      policy: DEFAULT_WORKSPACE_POLICY,
    };
    expect(evaluateToolAccess(d)).toMatchObject({ code: 'policy_broadcasts' });
    expect(
      evaluateToolAccess({ ...d, tool: 'set_automation_active' })
    ).toMatchObject({ code: 'policy_automations' });
  });

  it('limits members by the policy tier and members_allowed', () => {
    const member = (tool: ToolName, policy: Partial<WorkspacePolicy> = {}) =>
      evaluateToolAccess(
        input({
          tool,
          role: 'member',
          memberPermissions: allMember,
          policy: { ...DEFAULT_WORKSPACE_POLICY, ...policy },
        })
      );
    // default max tier is 'edit'
    expect(member('update_deal')).toEqual({ allowed: true });
    expect(member('send_text_message')).toMatchObject({ code: 'policy_tier' });
    expect(member('update_deal', { max_member_tier: 'view' })).toMatchObject({
      code: 'policy_tier',
    });
    expect(member('send_text_message', { max_member_tier: 'send' })).toEqual({
      allowed: true,
    });
    expect(member('search_contacts', { members_allowed: false })).toMatchObject(
      { code: 'policy_members' }
    );
  });

  it('applies live member permissions exactly like the dashboard', () => {
    const noDeals: MemberPermissions = { ...allMember, pipelines: false };
    const d = evaluateToolAccess(
      input({ tool: 'list_deals', role: 'member', memberPermissions: noDeals })
    );
    expect(d).toMatchObject({
      allowed: false,
      layer: 'role',
      code: 'role_section',
    });
    // A member with no stored permissions gets the inbox only.
    expect(
      evaluateToolAccess(
        input({
          tool: 'list_conversations',
          role: 'member',
          memberPermissions: null,
        })
      )
    ).toEqual({
      allowed: true,
    });
    expect(
      evaluateToolAccess(
        input({
          tool: 'search_contacts',
          role: 'member',
          memberPermissions: null,
        })
      )
    ).toMatchObject({
      code: 'role_section',
    });
    // Account tools need no section.
    expect(
      evaluateToolAccess(
        input({ tool: 'get_profile', role: 'member', memberPermissions: null })
      )
    ).toEqual({ allowed: true });
  });

  it('applies connection settings: read-only blocks writes but not reads or account tools', () => {
    const s: ConnectionSettings = {
      ...DEFAULT_CONNECTION_SETTINGS,
      read_only: true,
    };
    expect(
      evaluateToolAccess(input({ tool: 'create_contact', settings: s }))
    ).toMatchObject({ code: 'connection_read_only' });
    expect(
      evaluateToolAccess(input({ tool: 'search_contacts', settings: s }))
    ).toEqual({ allowed: true });
    expect(
      evaluateToolAccess(input({ tool: 'disconnect', settings: s }))
    ).toEqual({ allowed: true });
  });

  it('applies per-group switches', () => {
    const s: ConnectionSettings = {
      ...DEFAULT_CONNECTION_SETTINGS,
      groups: { ...DEFAULT_CONNECTION_SETTINGS.groups, send_messages: false },
    };
    const d = evaluateToolAccess(
      input({ tool: 'send_template_message', settings: s })
    );
    expect(d).toMatchObject({
      layer: 'connection',
      code: 'connection_group',
      fixPath: expect.any(String),
    });
  });

  it('asks for step-up last, listing every scope the token should end with', () => {
    const granted = ['profile', 'contacts:read', 'conversations:read'];
    const d = evaluateToolAccess(
      input({ tool: 'send_text_message', grantedScopes: granted })
    );
    expect(d).toMatchObject({ layer: 'scope', code: 'missing_scope' });
    if (!d.allowed) {
      expect(d.requiredScopes).toEqual([
        'profile',
        'contacts:read',
        'conversations:read',
        'messages:send',
      ]);
    }
  });

  it("doesn't ask for step-up when policy would refuse anyway", () => {
    const d = evaluateToolAccess(
      input({
        tool: 'send_broadcast',
        grantedScopes: ['profile'],
        policy: DEFAULT_WORKSPACE_POLICY,
      })
    );
    expect(d).toMatchObject({ layer: 'policy' });
  });
});

describe('visibleTools', () => {
  it('hides tools a member may not use but keeps ones that only need step-up', () => {
    const base = input({
      tool: 'get_profile',
      role: 'member',
      memberPermissions: { ...DEFAULT_MEMBER_PERMISSIONS },
      grantedScopes: ['profile'],
    });
    const { tool: _tool, ...rest } = base;
    void _tool;
    const visible = visibleTools(rest);
    expect(visible).toContain('get_profile');
    expect(visible).toContain('list_conversations'); // inbox allowed, needs step-up
    expect(visible).not.toContain('search_contacts'); // no Contacts section
    expect(visible).not.toContain('send_broadcast'); // policy off
  });
});

describe('tool catalog', () => {
  it('has 47 tools with valid names and consistent annotations', () => {
    expect(TOOL_NAMES).toHaveLength(47);
    for (const name of TOOL_NAMES) {
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).toMatch(/^[a-z][a-z_]*$/);
      const spec = getToolSpec(name);
      if (spec.readOnly) {
        expect(spec.destructive).toBe(false);
        expect(spec.group === 'view' || spec.group === 'account').toBe(true);
      }
      if (spec.openWorld) expect(spec.readOnly).toBe(false);
    }
  });

  it('marks every send as destructive and open-world', () => {
    for (const name of [
      'send_text_message',
      'send_template_message',
      'send_broadcast',
    ] as const) {
      expect(TOOL_CATALOG[name]).toMatchObject({
        destructive: true,
        openWorld: true,
        readOnly: false,
      });
    }
  });
});
