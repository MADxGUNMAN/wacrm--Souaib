// ============================================================
// Account role helpers — pure, unit-testable, no I/O.
//
// Simplified role system: only "owner" and "member" exist.
// All capability checks for members are driven entirely by the
// MemberPermissions JSON object stored in profiles.permissions.
//
// The owner has unrestricted access to everything. Members are
// governed by their explicit permission toggles.
// ============================================================

export type AccountRole = 'owner' | 'member';

/** Ordered list of every valid role, lowest privilege first. */
export const ACCOUNT_ROLES: readonly AccountRole[] = [
  'member',
  'owner',
] as const;

/**
 * Numeric rank of a role. Higher = more privileged. Mirrors the
 * CASE expression in `is_account_member` so JS/SQL stay aligned.
 */
export function roleRank(role: AccountRole): number {
  switch (role) {
    case 'owner':
      return 2;
    case 'member':
      return 1;
  }
}

/**
 * True iff `role` is at least as privileged as `min`. Use this
 * for any "user has at least owner" checks.
 */
export function hasMinRole(role: AccountRole, min: AccountRole): boolean {
  return roleRank(role) >= roleRank(min);
}

/** Type-narrow an unknown string into a valid `AccountRole`. */
export function isAccountRole(value: unknown): value is AccountRole {
  return (
    typeof value === 'string' &&
    (ACCOUNT_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Normalise legacy role strings ("admin", "agent", "viewer") into the
 * simplified system. Anything that isn't "owner" becomes "member".
 * Useful when reading profiles that were created before the migration.
 */
export function normalizeRole(role: string | null | undefined): AccountRole {
  if (role === 'owner') return 'owner';
  return 'member';
}

// ============================================================
// Capability predicates
//
// With the simplified role system, most capability checks are:
//   - Owner: can do everything
//   - Member: governed by MemberPermissions
//
// These predicates remain for backward-compatibility with API
// routes that haven't been fully migrated to permission checks.
// ============================================================

/** Owner only: manage team members (invite, remove, change permissions). */
export function canManageMembers(role: AccountRole): boolean {
  return role === 'owner';
}

/**
 * Owner only: edit account-wide settings (WhatsApp config,
 * message templates, pipelines, tags, custom fields, account
 * name). Members access specific settings via MemberPermissions.
 */
export function canEditSettings(role: AccountRole): boolean {
  return role === 'owner';
}

/**
 * Both owner and member can send messages (when they have inbox
 * access). The permission toggle governs inbox access, not this.
 */
export function canSendMessages(role: AccountRole): boolean {
  return true; // All roles can send once they have inbox access
}

/** Owner only: irreversible destructive operations. */
export function canDeleteAccount(role: AccountRole): boolean {
  return role === 'owner';
}

/** Owner only: hand the account to another member. */
export function canTransferOwnership(role: AccountRole): boolean {
  return role === 'owner';
}

/**
 * UI-level section access predicate.
 * Owner has full access. Members are governed by their permissions object.
 * Note: Real security enforcement happens at the API/Supabase RLS layer.
 */
export function hasSectionAccess(
  role: AccountRole | null | undefined,
  permissions: Record<string, boolean | undefined> | null | undefined,
  section: string
): boolean {
  if (!role) return true; // Default allow during initial auth loading
  if (role === 'owner') return true; // Owner is never restricted

  // Members: check their explicit permissions
  if (
    permissions &&
    typeof permissions === 'object' &&
    section in permissions
  ) {
    return Boolean(permissions[section]);
  }

  // Default: members get inbox only if no permissions are set
  return section === 'inbox';
}

/**
 * Settings sections that DENY when the permission key is missing.
 *
 * ─── Why this set has to exist ────────────────────────────────────
 *
 * `canAccessSettingsSection` below ends with `return true` — a member who
 * has `settings` access reaches any sub-section whose `settings_*` key is
 * absent from their stored JSON. That default is fine for most panes
 * (a new pane appearing for people who already have Settings is the
 * friendly behaviour) but it is exactly wrong for a new owner-only one:
 * every member created BEFORE the key existed has no key, so a
 * `defaultVal: false` in `SETTINGS_SUB_ITEMS` would still read as ALLOW
 * for them. Stored permission rows are not migrated when a key is added.
 *
 * Listing a section here makes absence mean "no". Add to it whenever a
 * new settings pane should start closed.
 */
export const OWNER_ONLY_SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  'alerts',
]);

/**
 * Granular settings sub-section access predicate.
 * Evaluates whether a user with settings access can view a specific settings tab.
 */
export function canAccessSettingsSection(
  role: AccountRole | null | undefined,
  permissions: Record<string, boolean | undefined> | null | undefined,
  section: string
): boolean {
  if (!role) return true;
  if (role === 'owner') return true;

  // First check general settings access
  if (!hasSectionAccess(role, permissions, 'settings')) {
    return false;
  }

  // Account settings (profile, security, appearance) and overview are always accessible if in settings
  if (
    section === 'overview' ||
    section === 'profile' ||
    section === 'security' ||
    section === 'appearance'
  ) {
    return true;
  }

  // For workspace settings, check the specific settings_<section> key if it exists in permissions
  const subKey = `settings_${section.replace('-', '_')}`;
  if (
    permissions &&
    typeof permissions === 'object' &&
    subKey in permissions &&
    permissions[subKey] !== undefined
  ) {
    return Boolean(permissions[subKey]);
  }

  // Absent key: deny for the sections listed as owner-only, allow for the
  // rest. See OWNER_ONLY_SETTINGS_SECTIONS for why the two defaults differ.
  if (OWNER_ONLY_SETTINGS_SECTIONS.has(section)) return false;

  // If not explicitly specified in permissions, default to true since general 'settings' is true
  return true;
}

// ============================================================
// Super Admin predicate
// ============================================================

/**
 * True iff the profile has the `is_super_admin` flag set to true.
 * This is a platform-level role that grants access to the super
 * admin panel at `/super-admin` — completely separate from the
 * per-account owner/member system.
 */
export function isSuperAdmin(
  profile: { is_super_admin?: boolean } | null | undefined
): boolean {
  return Boolean(profile?.is_super_admin);
}
