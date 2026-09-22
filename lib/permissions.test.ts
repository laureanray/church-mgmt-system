import { describe, expect, test } from "bun:test";

import {
  APP_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSIONS,
  groupPermissionsByModule,
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
