"use client";

import { useAuth } from "@/hooks/use-auth";
import {
  canDeleteAccount,
  canEditSettings,
  canManageMembers,
  canSendMessages,
  canTransferOwnership,
} from "@/lib/auth/roles";

/**
 * Typed action keys for `useCan`. With the simplified owner/member
 * role system, most checks boil down to "is owner?" — fine-grained
 * feature access is handled by MemberPermissions instead.
 */
export type CanAction =
  | "manage-members"
  | "edit-settings"
  | "send-messages"
  | "delete-account"
  | "transfer-ownership";

/**
 * Inline alternative to `<RequireRole>` for places that need a
 * boolean rather than a render conditional — typically disabled-
 * state on buttons, the readOnly flag on inputs, or controlling
 * tooltip copy ("Read-only" vs the action label).
 *
 * Returns `false` while `profileLoading` is true so transient
 * "you can!" flashes never appear to under-privileged users.
 */
export function useCan(action: CanAction): boolean {
  const { profileLoading, accountRole } = useAuth();
  if (profileLoading || !accountRole) return false;

  switch (action) {
    case "manage-members":
      return canManageMembers(accountRole);
    case "edit-settings":
      return canEditSettings(accountRole);
    case "send-messages":
      return canSendMessages(accountRole);
    case "delete-account":
      return canDeleteAccount(accountRole);
    case "transfer-ownership":
      return canTransferOwnership(accountRole);
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown CanAction: ${String(_exhaustive)}`);
    }
  }
}
