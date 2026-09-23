import { describe, expect, test } from "bun:test";

import {
  canAppointHeads,
  canManageRoster,
  canViewMinistry,
  effectivePermissions,
  isMinistryHead,
  permissionSources,
  type MinistryMembership,
} from "./ministry-access";
import type { PermissionKey } from "./permissions";

const lam: MinistryMembership = { id: "lam", name: "LAM", position: "member" };
const ushering: MinistryMembership = { id: "ushering", name: "Ushering", position: "head" };

function viewer(
  permissions: PermissionKey[],
  ministries: MinistryMembership[] = [],
) {
  return { permissions, ministries };
}

describe("effectivePermissions", () => {
  test("adds ministry grants to the role's permissions", () => {
    expect(
      effectivePermissions(
        ["dashboard.view"],
        [
          { ministryId: "lam", permissionKey: "lam.view" },
          { ministryId: "lam", permissionKey: "services.view" },
        ],
      ),
    ).toEqual(["dashboard.view", "services.view", "lam.view"]);
  });

  test("deduplicates a permission granted twice, keeping catalog order", () => {
    expect(
      effectivePermissions(
        ["services.view", "dashboard.view"],
        [
          { ministryId: "lam", permissionKey: "services.view" },
          { ministryId: "ushering", permissionKey: "services.view" },
        ],
      ),
    ).toEqual(["dashboard.view", "services.view"]);
  });

  test("ignores a ministry grant from a role-only module", () => {
    // A row like this cannot come from the UI — the validator rejects it — but
    // a hand-edited database must still not turn a roster into admin access.
    expect(
      effectivePermissions(
        [],
        [
          { ministryId: "lam", permissionKey: "users.update" },
          { ministryId: "lam", permissionKey: "roles.update" },
          { ministryId: "lam", permissionKey: "ministries.update" },
          { ministryId: "lam", permissionKey: "settings.update" },
          { ministryId: "lam", permissionKey: "lam.view" },
        ],
      ),
    ).toEqual(["lam.view"]);
  });

  test("still honours role-only permissions that come from the role", () => {
    expect(effectivePermissions(["users.update"], [])).toEqual(["users.update"]);
  });

  test("drops keys that are not in the catalog", () => {
    expect(
      effectivePermissions(
        ["members.publish"],
        [{ ministryId: "lam", permissionKey: "lam.fly" }],
      ),
    ).toEqual([]);
  });
});

describe("permissionSources", () => {
  test("credits each permission to every role and ministry that grants it", () => {
    const sources = permissionSources(
      { name: "Usher", permissions: ["dashboard.view", "services.view"] },
      [lam, ushering],
      [
        { ministryId: "lam", permissionKey: "services.view" },
        { ministryId: "lam", permissionKey: "lam.view" },
      ],
    );

    expect(sources).toEqual([
      { permission: "dashboard.view", sources: [{ kind: "role", name: "Usher" }] },
      {
        permission: "services.view",
        sources: [
          { kind: "role", name: "Usher" },
          { kind: "ministry", id: "lam", name: "LAM" },
        ],
      },
      {
        permission: "lam.view",
        sources: [{ kind: "ministry", id: "lam", name: "LAM" }],
      },
    ]);
  });

  test("skips grants from ministries the user is not an active member of", () => {
    expect(
      permissionSources(
        { name: "Usher", permissions: [] },
        [],
        [{ ministryId: "lam", permissionKey: "lam.view" }],
      ),
    ).toEqual([]);
  });

  test("skips role-only grants from a ministry", () => {
    expect(
      permissionSources(
        { name: "Usher", permissions: [] },
        [lam],
        [{ ministryId: "lam", permissionKey: "users.delete" }],
      ),
    ).toEqual([]);
  });
});

describe("ministry roster access", () => {
  test("a head manages their own roster without any module permission", () => {
    const head = viewer([], [ushering]);
    expect(isMinistryHead(head, "ushering")).toBe(true);
    expect(canManageRoster(head, "ushering")).toBe(true);
    expect(canViewMinistry(head, "ushering")).toBe(true);
  });

  test("a head cannot manage another ministry's roster", () => {
    const head = viewer([], [ushering]);
    expect(canManageRoster(head, "lam")).toBe(false);
    expect(canViewMinistry(head, "lam")).toBe(false);
  });

  test("a member can view their ministry but not manage its roster", () => {
    const member = viewer([], [lam]);
    expect(canViewMinistry(member, "lam")).toBe(true);
    expect(canManageRoster(member, "lam")).toBe(false);
  });

  test("ministries.update manages every roster and appoints heads", () => {
    const staff = viewer(["ministries.view", "ministries.update"]);
    expect(canManageRoster(staff, "lam")).toBe(true);
    expect(canViewMinistry(staff, "lam")).toBe(true);
    expect(canAppointHeads(staff)).toBe(true);
  });

  test("heads cannot appoint heads", () => {
    expect(canAppointHeads(viewer([], [ushering]))).toBe(false);
  });
});
