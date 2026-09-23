import { describe, expect, test } from "bun:test";

import {
  APP_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSIONS,
  MINISTRY_GRANTABLE_KEYS,
  ROLE_ONLY_MODULES,
  groupPermissionsByModule,
  isMinistryGrantable,
  isPermissionKey,
} from "./permissions";

describe("permission catalog", () => {
  test("uses unique stable keys and known modules", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    const modules = new Set(APP_MODULES.map((module) => module.key));
    expect(PERMISSIONS.every((permission) => modules.has(permission.module))).toBe(true);
  });

  test("groups every permission under one module", () => {
    const grouped = groupPermissionsByModule().flatMap((module) => module.permissions);
    expect(grouped).toHaveLength(PERMISSIONS.length);
    expect(new Set(grouped.map((permission) => permission.key))).toEqual(
      new Set(PERMISSION_KEYS),
    );
  });

  test("keeps the protected admin role fully privileged", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toEqual(PERMISSION_KEYS);
  });

  test("recognizes only catalog permissions", () => {
    expect(isPermissionKey("members.view")).toBe(true);
    expect(isPermissionKey("members.publish")).toBe(false);
  });
});

describe("ministry-grantable permissions", () => {
  test("exclude every permission from a role-only module", () => {
    const roleOnly = new Set<string>(ROLE_ONLY_MODULES);
    for (const permission of PERMISSIONS) {
      expect(isMinistryGrantable(permission.key)).toBe(
        !roleOnly.has(permission.module),
      );
    }
    expect(isMinistryGrantable("users.update")).toBe(false);
    expect(isMinistryGrantable("ministries.update")).toBe(false);
    expect(isMinistryGrantable("lam.lineups_update")).toBe(true);
  });

  test("group without the modules they leave empty", () => {
    const modules = groupPermissionsByModule(
      PERMISSIONS.filter((item) => MINISTRY_GRANTABLE_KEYS.includes(item.key)),
    ).map((module) => module.key);
    expect(modules).not.toContain("users");
    expect(modules).not.toContain("settings");
    expect(modules).toContain("lam");
  });
});
