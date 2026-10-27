// Shared shapes for the security API (server routes ↔ settings UI).

export const SECURITY_EVENT_TYPES = [
  'login',
  'logout',
  'logout_all',
  'session_revoked',
  'sessions_revoked_others',
  'login_failed',
  'password_changed',
  'email_change_requested',
  'api_key_created',
  'api_key_revoked',
  'two_factor_enabled',
  'two_factor_disabled',
  'two_factor_verified',
  'two_factor_failed',
  'two_factor_recovery_used',
  'recovery_codes_regenerated',
  'owner_verification_enabled',
  'owner_verification_disabled',
  'owner_code_used',
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  login: 'Login',
  logout: 'Logout',
  logout_all: 'Logged out everywhere',
  session_revoked: 'Device revoked',
  sessions_revoked_others: 'Other devices revoked',
  login_failed: 'Failed login',
  password_changed: 'Password changed',
  email_change_requested: 'Email change requested',
  api_key_created: 'API token generated',
  api_key_revoked: 'API token revoked',
  two_factor_enabled: '2FA enabled',
  two_factor_disabled: '2FA disabled',
  two_factor_verified: '2FA verified',
  two_factor_failed: 'Failed 2FA code',
  two_factor_recovery_used: 'Recovery code used',
  recovery_codes_regenerated: 'Recovery codes regenerated',
  owner_verification_enabled: 'Owner verification on',
  owner_verification_disabled: 'Owner verification off',
  owner_code_used: 'Your code used by member',
};

/** Events a signed-in browser may report about itself (see /api/security/events). */
export const CLIENT_REPORTABLE_EVENTS = [
  'password_changed',
] as const satisfies readonly SecurityEventType[];

export function isSecurityEventType(v: unknown): v is SecurityEventType {
  return (
    typeof v === 'string' &&
    (SECURITY_EVENT_TYPES as readonly string[]).includes(v)
  );
}

export interface DeviceSession {
  id: string;
  is_current: boolean;
  first_activity_at: string;
  last_active_at: string;
  ip: string | null;
  country_code: string | null;
  country_name: string | null;
  timezone: string | null;
  platform: string | null;
  device_type: string | null;
  browser: string | null;
  browser_version: string | null;
}

export interface SecurityEventRow {
  id: string;
  event_type: SecurityEventType;
  created_at: string;
  ip: string | null;
  target_ip: string | null;
  country_code: string | null;
  country_name: string | null;
  timezone: string | null;
  platform: string | null;
  device_type: string | null;
  browser: string | null;
  metadata: Record<string, unknown>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;
