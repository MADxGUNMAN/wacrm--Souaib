import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ROLES,
  type AccountRole,
  canDeleteAccount,
  canEditSettings,
  canManageMembers,
  canSendMessages,
  canTransferOwnership,
  hasMinRole,
  isAccountRole,
  roleRank,
  normalizeRole,
} from "./roles";

describe("roleRank", () => {
  it("orders owner > member", () => {
    expect(roleRank("owner")).toBeGreaterThan(roleRank("member"));
  });

  it("matches the SQL helper's numeric mapping", () => {
    expect(roleRank("owner")).toBe(2);
    expect(roleRank("member")).toBe(1);
  });
});

describe("hasMinRole", () => {
  it("returns true when role meets the threshold", () => {
    expect(hasMinRole("owner", "member")).toBe(true);
    expect(hasMinRole("member", "member")).toBe(true);
    expect(hasMinRole("owner", "owner")).toBe(true);
  });

  it("returns false when role is below the threshold", () => {
    expect(hasMinRole("member", "owner")).toBe(false);
  });

  // The full matrix — useful as a regression net if anyone reshuffles
  // the rank table.
  it.each<[AccountRole, AccountRole, boolean]>([
    ["owner", "owner", true],
    ["owner", "member", true],
    ["member", "owner", false],
    ["member", "member", true],
  ])("%s vs min %s → %s", (role, min, expected) => {
    expect(hasMinRole(role, min)).toBe(expected);
  });
});

describe("isAccountRole", () => {
  it("accepts every value in ACCOUNT_ROLES", () => {
    for (const role of ACCOUNT_ROLES) {
      expect(isAccountRole(role)).toBe(true);
    }
  });

  it("rejects garbage / case mismatch / non-strings", () => {
    expect(isAccountRole("Owner")).toBe(false);
    expect(isAccountRole("")).toBe(false);
    expect(isAccountRole(null)).toBe(false);
    expect(isAccountRole(undefined)).toBe(false);
    expect(isAccountRole(123)).toBe(false);
    expect(isAccountRole("superuser")).toBe(false);
  });

  it("rejects legacy roles (admin/agent/viewer)", () => {
    expect(isAccountRole("admin")).toBe(false);
    expect(isAccountRole("agent")).toBe(false);
    expect(isAccountRole("viewer")).toBe(false);
  });
});

describe("normalizeRole", () => {
  it("maps legacy roles to member", () => {
    expect(normalizeRole("admin")).toBe("member");
    expect(normalizeRole("agent")).toBe("member");
    expect(normalizeRole("viewer")).toBe("member");
  });

  it("passes through owner and member unchanged", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("member")).toBe("member");
  });

  it("defaults unknown values to member", () => {
    expect(normalizeRole("superuser")).toBe("member");
    expect(normalizeRole("")).toBe("member");
  });
});

describe("capability predicates", () => {
  it("canManageMembers: owner only", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("member")).toBe(false);
  });

  it("canEditSettings: owner only", () => {
    expect(canEditSettings("owner")).toBe(true);
    expect(canEditSettings("member")).toBe(false);
  });

  it("canSendMessages: owner and member", () => {
    expect(canSendMessages("owner")).toBe(true);
    expect(canSendMessages("member")).toBe(true);
  });

  it("canDeleteAccount: owner only", () => {
    expect(canDeleteAccount("owner")).toBe(true);
    expect(canDeleteAccount("member")).toBe(false);
  });

  it("canTransferOwnership: owner only", () => {
    expect(canTransferOwnership("owner")).toBe(true);
    expect(canTransferOwnership("member")).toBe(false);
  });
});
