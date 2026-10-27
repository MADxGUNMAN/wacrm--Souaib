import { describe, expect, it } from 'vitest';
import {
  applySettingsPatch,
  canManage,
  groupAvailability,
  mergePolicyUpdate,
  parseConnectionPatch,
  policyRowForSave,
  summarizeActivityArgs,
} from './manage';
import {
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_WORKSPACE_POLICY,
} from './settings';

const policy = DEFAULT_WORKSPACE_POLICY;
const VIEW_EDIT = ['profile', 'contacts:read', 'contacts:write'];
const WITH_SEND = [...VIEW_EDIT, 'messages:send'];

const blockOf = (
  scopes: string[],
  p = policy,
  role: 'owner' | 'member' = 'owner'
) =>
  Object.fromEntries(
    groupAvailability(scopes, p, role).map((a) => [a.group, a.block])
  );

describe('groupAvailability', () => {
  it('needs the tier to have been granted at consent', () => {
    expect(blockOf(VIEW_EDIT)).toMatchObject({
      edit_records: null,
      send_messages: 'not_granted',
      broadcasts: 'not_granted',
    });
    expect(blockOf(WITH_SEND).send_messages).toBeNull();
  });

  it('respects the workspace policy', () => {
    expect(
      blockOf(WITH_SEND, { ...policy, allow_messaging: false }).send_messages
    ).toBe('policy');
    expect(blockOf([...WITH_SEND, 'broadcasts:send']).broadcasts).toBe(
      'policy'
    ); // off by default
  });

  it('caps members at the member tier', () => {
    expect(blockOf(WITH_SEND, policy, 'member')).toMatchObject({
      edit_records: null,
      send_messages: 'member_limit',
    });
    expect(
      blockOf(WITH_SEND, { ...policy, max_member_tier: 'view' }, 'member')
        .edit_records
    ).toBe('member_limit');
    expect(
      blockOf(WITH_SEND, { ...policy, max_member_tier: 'send' }, 'member')
        .send_messages
    ).toBeNull();
  });
});

describe('applySettingsPatch', () => {
  const ctx = { scopes: VIEW_EDIT, policy, role: 'owner' as const };

  it('allows turning anything off', () => {
    const { next, adjusted } = applySettingsPatch(
      DEFAULT_CONNECTION_SETTINGS,
      { groups: { edit_records: false } },
      ctx
    );
    expect(next.groups.edit_records).toBe(false);
    expect(adjusted).toEqual([]);
  });

  it('refuses to turn on what was not granted or the policy forbids', () => {
    const current = {
      ...DEFAULT_CONNECTION_SETTINGS,
      groups: { ...DEFAULT_CONNECTION_SETTINGS.groups, send_messages: false },
    };
    const { next, adjusted } = applySettingsPatch(
      current,
      { groups: { send_messages: true, broadcasts: true } },
      ctx
    );
    expect(next.groups.send_messages).toBe(false);
    expect(next.groups.broadcasts).toBe(false);
    expect(adjusted).toEqual(['groups.send_messages', 'groups.broadcasts']);
  });

  it('clamps caps to the workspace limit and idle days to 1–90', () => {
    const { next, adjusted } = applySettingsPatch(
      DEFAULT_CONNECTION_SETTINGS,
      { messages_per_day: 5000, idle_days: 400, read_only: true },
      ctx
    );
    expect(next.caps.messages_per_day).toBe(300);
    expect(next.idle_days).toBe(90);
    expect(next.read_only).toBe(true);
    expect(adjusted).toEqual(['messages_per_day', 'idle_days']);
  });
});

describe('parseConnectionPatch', () => {
  it('keeps only known fields and trims the label', () => {
    expect(
      parseConnectionPatch({
        label: '  Laptop  ',
        settings: {
          read_only: true,
          groups: { edit_records: false, admin: true },
          caps: 3,
        },
        account_id: 'x',
      })
    ).toEqual({
      label: 'Laptop',
      settings: { read_only: true, groups: { edit_records: false } },
    });
    expect(parseConnectionPatch(null)).toBeNull();
    expect(parseConnectionPatch({ label: '   ' })?.label).toBeNull();
  });
});

describe('mergePolicyUpdate', () => {
  it('applies valid fields and never takes the platform lock from the owner', () => {
    const next = mergePolicyUpdate(policy, {
      allow_broadcasts: true,
      max_member_tier: 'send',
      daily_message_cap: 50,
      allowed_platforms: ['claude', 'mcp_inspector', 'bogus'],
      locked_by_platform: true,
    });
    expect(next).toMatchObject({
      allow_broadcasts: true,
      max_member_tier: 'send',
      daily_message_cap: 50,
      allowed_platforms: ['claude'],
      locked_by_platform: false,
    });
    expect('locked_by_platform' in policyRowForSave(next)).toBe(false);
  });

  it('keeps the current value for invalid input and keeps an existing lock', () => {
    const locked = { ...policy, locked_by_platform: true };
    const next = mergePolicyUpdate(locked, {
      max_member_tier: 'admin',
      daily_message_cap: -1,
      enabled: 'yes',
    });
    expect(next).toMatchObject({
      max_member_tier: 'edit',
      daily_message_cap: 300,
      enabled: true,
      locked_by_platform: true,
    });
  });
});

describe('canManage', () => {
  const viewer = { accountId: 'A', userId: 'u1', role: 'member' as const };
  it('members manage only their own connections in their workspace', () => {
    expect(canManage(viewer, { account_id: 'A', user_id: 'u1' })).toBe(true);
    expect(canManage(viewer, { account_id: 'A', user_id: 'u2' })).toBe(false);
    expect(
      canManage(
        { ...viewer, role: 'owner' },
        { account_id: 'A', user_id: 'u2' }
      )
    ).toBe(true);
    expect(
      canManage(
        { ...viewer, role: 'owner' },
        { account_id: 'B', user_id: 'u2' }
      )
    ).toBe(false);
  });
});

describe('summarizeActivityArgs', () => {
  it('summarises ids, counts and flags, never free text', () => {
    expect(
      summarizeActivityArgs({
        query: 'ravi',
        tags: [1, 2],
        body: { text_length: 40 },
      })
    ).toBe('query: ravi · tags: 2 items · body: text');
    expect(summarizeActivityArgs(null)).toBeNull();
  });
});
