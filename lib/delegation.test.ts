import { describe, expect, test } from "bun:test";

import {
  canManageAccount,
  delegatedEdit,
  describePermissions,
  grantableFor,
  permissionsBeyond,
  sameGrants,
} from "./delegation";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } from "./permissions";

// A custom "Office" role: runs staff accounts, but is not an administrator.
const OFFICE = [
  "members.view",
  "users.view",
  "users.create",
  "users.update",
  "users.reset_password",
  "roles.view",
  "roles.update",
] as const;

describe("permissionsBeyond", () => {
  test("lists what the holder lacks, in catalog order", () => {
    expect(
      permissionsBeyond(OFFICE, ["users.delete", "members.view", "dashboard.view"]),
    ).toEqual(["dashboard.view", "users.delete"]);
  });

  test("is empty for a subset, and for nothing wanted", () => {
    expect(permissionsBeyond(OFFICE, ["users.view", "members.view"])).toEqual([]);
    expect(permissionsBeyond(OFFICE, [])).toEqual([]);
  });

  test("an administrator holds everything", () => {
    expect(permissionsBeyond(PERMISSION_KEYS, PERMISSION_KEYS)).toEqual([]);
  });
});

describe("canManageAccount", () => {
  test("covers accounts with no more access than the actor", () => {
    expect(canManageAccount(OFFICE, ["members.view", "users.view"])).toBe(true);
    expect(canManageAccount(OFFICE, OFFICE)).toBe(true);
    expect(canManageAccount(OFFICE, [])).toBe(true);
  });

  test("refuses an administrator to anyone who is not one", () => {
    expect(canManageAccount(OFFICE, DEFAULT_ROLE_PERMISSIONS.admin)).toBe(false);
    expect(canManageAccount(PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS.admin)).toBe(true);
  });

  test("refuses an account holding even one permission the actor lacks", () => {
    expect(canManageAccount(OFFICE, ["members.view", "members.delete"])).toBe(false);
  });
});

describe("delegatedEdit", () => {
  test("saves the submission when the actor holds all of it", () => {
    expect(
      delegatedEdit({
        held: OFFICE,
        before: ["members.view"],
        submitted: ["users.view", "members.view"],
      }),
    ).toEqual({ permissions: ["members.view", "users.view"], refused: [] });
  });

  test("refuses adding a permission the actor does not hold", () => {
    const edit = delegatedEdit({
      held: OFFICE,
      before: [],
      submitted: ["members.view", "users.delete", "settings.update"],
    });
    expect(edit.refused).toEqual(["users.delete", "settings.update"]);
    expect(edit.permissions).toEqual(["members.view"]);
  });

  test("keeps a permission the actor does not hold, even when it is not submitted", () => {
    // The checkbox for members.delete is disabled for this actor, so the form
    // never sends it; that absence must not strip it from the role.
    expect(
      delegatedEdit({
        held: OFFICE,
        before: ["members.view", "members.delete"],
        submitted: ["members.view"],
      }),
    ).toEqual({ permissions: ["members.view", "members.delete"], refused: [] });
  });

  test("resubmitting a permission already granted is not an addition", () => {
    expect(
      delegatedEdit({
        held: OFFICE,
        before: ["members.delete"],
        submitted: ["members.delete"],
      }),
    ).toEqual({ permissions: ["members.delete"], refused: [] });
  });

  test("removes a held permission the submission leaves out", () => {
    expect(
      delegatedEdit({
        held: OFFICE,
        before: ["members.view", "users.view"],
        submitted: ["users.view"],
      }).permissions,
    ).toEqual(["users.view"]);
  });

  test("drops keys outside the catalog", () => {
    expect(
      delegatedEdit({
        held: PERMISSION_KEYS,
        before: ["members.publish"],
        submitted: ["members.view"],
      }),
    ).toEqual({ permissions: ["members.view"], refused: [] });
  });
});

describe("sameGrants", () => {
  test("ignores order and duplicates", () => {
    expect(sameGrants(["a", "b"], ["b", "a", "a"])).toBe(true);
  });

  test("notices an addition or a removal", () => {
    expect(sameGrants(["a"], ["a", "b"])).toBe(false);
    expect(sameGrants(["a", "b"], ["a"])).toBe(false);
  });
});

describe("describePermissions", () => {
  test("names permissions by label, joined for a sentence", () => {
    expect(describePermissions(["users.delete"])).toBe("Delete staff users");
    expect(describePermissions(["users.delete", "settings.update", "audit.view"])).toBe(
      "Delete staff users, Update settings and View audit log",
    );
    expect(describePermissions([])).toBe("");
  });
});

describe("grantableFor", () => {
  test("locks nothing for someone who holds the whole scope", () => {
    expect(grantableFor(PERMISSION_KEYS)).toBeUndefined();
    expect(grantableFor(["members.view"], ["members.view"])).toBeUndefined();
  });

  test("lists what a partial holder may change", () => {
    expect(grantableFor(["members.view", "users.view"])).toEqual([
      "members.view",
      "users.view",
    ]);
  });
});
