import { describe, expect, it, vi } from 'vitest';

// consent.ts imports the subscription gate cache (Supabase); the pure
// functions under test never call it.
vi.mock('@/lib/subscription/gate-cache', () => ({
  getCachedGateConfig: vi.fn(),
}));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: vi.fn() }));

import {
  buildTierOptions,
  grantedScopesFor,
  policyForClient,
  settingsAfterConsent,
  splitRequestedScopes,
  type AccessSubject,
} from './consent';
import { evaluateToolAccess } from './policy';
import { DEFAULT_REQUESTED_SCOPES } from './scopes';
import { getToolSpec } from './tool-catalog';
import {
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_WORKSPACE_POLICY,
} from './settings';

const ownerSubject: AccessSubject = {
  role: 'owner',
  memberPermissions: null,
  policy: {
    ...DEFAULT_WORKSPACE_POLICY,
    allow_broadcasts: true,
    allow_automation_changes: true,
  },
  platform: 'claude',
  account: {
    connectorEnabled: true,
    platformEnabled: true,
    allowlisted: true,
    banned: false,
    subscriptionBlocked: false,
  },
};

const ALL_REQUESTED = [
  'contacts:read',
  'messages:read',
  'contacts:write',
  'messages:send',
  'broadcasts:send',
  'automations:manage',
];

describe('splitRequestedScopes', () => {
  it('always includes profile and view scopes; groups the rest by tier', () => {
    const r = splitRequestedScopes([
      'contacts:read',
      'contacts:write',
      'messages:send',
      'bogus',
    ]);
    expect(r.always).toEqual(['profile', 'contacts:read']);
    expect(r.byTier).toEqual({
      edit: ['contacts:write'],
      send: ['messages:send'],
    });
  });
});

describe('buildTierOptions', () => {
  it('offers only requested tiers', () => {
    const opts = buildTierOptions([...DEFAULT_REQUESTED_SCOPES], ownerSubject);
    expect(opts.map((o) => o.tier)).toEqual(['edit']);
    expect(opts[0].available).toBe(true);
  });

  it('marks tiers the workspace policy forbids as unavailable', () => {
    const subject: AccessSubject = {
      ...ownerSubject,
      policy: { ...DEFAULT_WORKSPACE_POLICY, allow_messaging: false },
    };
    const opts = buildTierOptions(ALL_REQUESTED, subject);
    const byTier = Object.fromEntries(opts.map((o) => [o.tier, o]));
    expect(byTier.edit.available).toBe(true);
    expect(byTier.send).toMatchObject({
      available: false,
      reasonCode: 'policy_messaging',
    });
    expect(byTier.broadcast).toMatchObject({
      available: false,
      reasonCode: 'policy_broadcasts',
    });
    expect(byTier.automations).toMatchObject({
      available: false,
      reasonCode: 'policy_automations',
    });
  });

  it('caps members at the workspace member tier', () => {
    const member: AccessSubject = {
      ...ownerSubject,
      role: 'member',
      memberPermissions: {
        contacts: true,
        inbox: true,
      } as AccessSubject['memberPermissions'],
      policy: { ...ownerSubject.policy, max_member_tier: 'view' },
    };
    const opts = buildTierOptions(ALL_REQUESTED, member);
    expect(opts.every((o) => !o.available)).toBe(true);
    expect(opts.find((o) => o.tier === 'edit')?.reasonCode).toBe('policy_tier');
  });
});

describe('grantedScopesFor', () => {
  const opts = buildTierOptions(ALL_REQUESTED, ownerSubject);

  it('grants view scopes plus chosen, available tiers', () => {
    expect(grantedScopesFor(ALL_REQUESTED, ['edit'], opts)).toEqual([
      'profile',
      'contacts:read',
      'messages:read',
      'contacts:write',
    ]);
  });

  it('never grants a scope that was not requested, whatever is posted', () => {
    const requested = ['contacts:read'];
    const narrow = buildTierOptions(requested, ownerSubject);
    expect(
      grantedScopesFor(
        requested,
        ['edit', 'send', 'broadcast', 'automations', 'admin'],
        narrow
      )
    ).toEqual(['profile', 'contacts:read']);
  });

  it('never grants an unavailable tier', () => {
    const blocked = buildTierOptions(ALL_REQUESTED, {
      ...ownerSubject,
      policy: { ...DEFAULT_WORKSPACE_POLICY, allow_messaging: false },
    });
    expect(grantedScopesFor(ALL_REQUESTED, ['send'], blocked)).not.toContain(
      'messages:send'
    );
  });
});

describe('policyForClient', () => {
  const policy = DEFAULT_WORKSPACE_POLICY;
  it('lets dev-only clients past the platform list only when dev clients are on', () => {
    const dev = { platform: 'mcp_inspector', trust: 'dev_only' } as const;
    expect(
      policyForClient(policy, dev, { allowDevClients: true }).allowed_platforms
    ).toContain('mcp_inspector');
    expect(
      policyForClient(policy, dev, { allowDevClients: false }).allowed_platforms
    ).not.toContain('mcp_inspector');
  });
  it('never widens the list for trusted platforms the owner turned off', () => {
    const owner = { ...policy, allowed_platforms: ['claude' as const] };
    const chatgpt = { platform: 'chatgpt', trust: 'trusted' } as const;
    expect(
      policyForClient(owner, chatgpt, { allowDevClients: true })
        .allowed_platforms
    ).toEqual(['claude']);
  });
});

describe('settingsAfterConsent', () => {
  it('derives group switches from the granted tiers', () => {
    const s = settingsAfterConsent(null, [
      'profile',
      'contacts:read',
      'contacts:write',
    ]);
    expect(s.read_only).toBe(false);
    expect(s.groups).toMatchObject({
      edit_records: true,
      send_messages: false,
      broadcasts: false,
      automations: false,
    });
  });

  it('is read-only when only view scopes were granted', () => {
    expect(
      settingsAfterConsent(null, ['profile', 'contacts:read']).read_only
    ).toBe(true);
  });

  it("keeps the user's caps and new-number choice on reconnect", () => {
    const existing = {
      ...DEFAULT_CONNECTION_SETTINGS,
      caps: { messages_per_day: 7 },
      idle_days: 5,
      groups: {
        ...DEFAULT_CONNECTION_SETTINGS.groups,
        send_to_new_numbers: true,
      },
    };
    const s = settingsAfterConsent(existing, ['profile', 'messages:send']);
    expect(s.caps.messages_per_day).toBe(7);
    expect(s.idle_days).toBe(5);
    expect(s.groups.send_to_new_numbers).toBe(true);
    expect(s.groups.send_messages).toBe(true);
    expect(s.groups.edit_records).toBe(false);
  });
});

// Regression: Claude connects with view + edit only; consent switches
// "Send messages" off because messages:send wasn't granted, and Settings
// won't turn it on without the scope. The first send must therefore ask
// for the scope (step-up), not report the switch.
describe('step-up for a tier that was not granted at connect', () => {
  const access = (
    tool: 'send_text_message' | 'preview_broadcast' | 'set_flow_status',
    scopes: readonly string[],
    settings = settingsAfterConsent(null, scopes)
  ) =>
    evaluateToolAccess({
      tool,
      grantedScopes: scopes,
      settings,
      policy: ownerSubject.policy,
      role: 'owner',
      memberPermissions: null,
      platform: 'claude',
      account: ownerSubject.account,
    });

  it('asks for the missing scope instead of pointing at the switch', () => {
    const scopes = [...DEFAULT_REQUESTED_SCOPES];
    expect(settingsAfterConsent(null, scopes).groups.send_messages).toBe(false);
    for (const tool of [
      'send_text_message',
      'preview_broadcast',
      'set_flow_status',
    ] as const) {
      const d = access(tool, scopes);
      expect(d).toMatchObject({ layer: 'scope', code: 'missing_scope' });
      if (!d.allowed)
        expect(d.requiredScopes).toEqual(
          expect.arrayContaining([...scopes, getToolSpec(tool).scope])
        );
    }
  });

  it('approving the scope turns the switch on, so the call is allowed', () => {
    const scopes = [...DEFAULT_REQUESTED_SCOPES, 'messages:send'];
    expect(settingsAfterConsent(null, scopes).groups.send_messages).toBe(true);
    expect(access('send_text_message', scopes)).toEqual({ allowed: true });
  });

  it('a switch the user turned off with the scope granted still refuses', () => {
    const scopes = [...DEFAULT_REQUESTED_SCOPES, 'messages:send'];
    const s = settingsAfterConsent(null, scopes);
    s.groups.send_messages = false;
    expect(access('send_text_message', scopes, s)).toMatchObject({
      layer: 'connection',
      code: 'connection_group',
    });
  });
});
