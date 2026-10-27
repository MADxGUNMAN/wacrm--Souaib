import { describe, expect, it } from 'vitest';
import {
  parseScopeString,
  formatScopes,
  DEFAULT_REQUESTED_SCOPES,
} from './scopes';
import {
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_WORKSPACE_POLICY,
  lowerOnly,
  normalizeConnectionSettings,
  normalizeWorkspacePolicy,
} from './settings';

describe('normalizeConnectionSettings', () => {
  it('returns defaults for missing or malformed JSON', () => {
    expect(normalizeConnectionSettings(null)).toEqual(
      DEFAULT_CONNECTION_SETTINGS
    );
    expect(normalizeConnectionSettings('x')).toEqual(
      DEFAULT_CONNECTION_SETTINGS
    );
    expect(
      normalizeConnectionSettings({ groups: { broadcasts: 'yes' } })
    ).toEqual(DEFAULT_CONNECTION_SETTINGS);
  });
  it('keeps valid values and clamps caps', () => {
    const s = normalizeConnectionSettings({
      read_only: true,
      groups: { broadcasts: true },
      caps: { messages_per_day: 99999 },
      idle_days: 0,
    });
    expect(s.read_only).toBe(true);
    expect(s.groups.broadcasts).toBe(true);
    expect(s.caps.messages_per_day).toBe(1000);
    expect(s.idle_days).toBe(1);
  });
});

describe('lowerOnly (restrict_my_permissions)', () => {
  it('can switch things off and lower caps', () => {
    const { next, ignored } = lowerOnly(DEFAULT_CONNECTION_SETTINGS, {
      read_only: true,
      groups: { send_messages: false },
      messages_per_day: 10,
    });
    expect(next.read_only).toBe(true);
    expect(next.groups.send_messages).toBe(false);
    expect(next.caps.messages_per_day).toBe(10);
    expect(ignored).toEqual([]);
  });

  it('never raises access', () => {
    const current = { ...DEFAULT_CONNECTION_SETTINGS, read_only: true };
    const { next, ignored } = lowerOnly(current, {
      read_only: false,
      groups: { broadcasts: true, automations: true },
      messages_per_day: 5000,
    });
    expect(next).toEqual(current);
    expect(ignored.sort()).toEqual([
      'groups.automations',
      'groups.broadcasts',
      'messages_per_day',
      'read_only',
    ]);
  });
});

describe('normalizeWorkspacePolicy', () => {
  it('uses defaults when there is no row', () => {
    expect(normalizeWorkspacePolicy(null)).toEqual(DEFAULT_WORKSPACE_POLICY);
  });
  it('drops unknown platforms and invalid tiers', () => {
    const p = normalizeWorkspacePolicy({
      allowed_platforms: ['claude', 'myspace'],
      max_member_tier: 'god',
    });
    expect(p.allowed_platforms).toEqual(['claude']);
    expect(p.max_member_tier).toBe('edit');
  });
});

describe('scopes', () => {
  it('always includes profile, orders scopes, and reports unknown ones', () => {
    expect(
      parseScopeString('deals:read offline_access contacts:read evil:all')
    ).toEqual({
      scopes: ['profile', 'contacts:read', 'deals:read'],
      offlineAccess: true,
      unknown: ['evil:all'],
    });
    expect(parseScopeString(undefined).scopes).toEqual(['profile']);
  });
  it('formats in a stable order', () => {
    expect(formatScopes(['messages:send', 'profile', 'contacts:read'])).toBe(
      'profile contacts:read messages:send'
    );
  });
  it('requests view + edit by default, never sending', () => {
    expect(DEFAULT_REQUESTED_SCOPES).toContain('contacts:write');
    expect(DEFAULT_REQUESTED_SCOPES).not.toContain('messages:send');
    expect(DEFAULT_REQUESTED_SCOPES).not.toContain('broadcasts:send');
    expect(DEFAULT_REQUESTED_SCOPES).not.toContain('automations:manage');
  });
});
