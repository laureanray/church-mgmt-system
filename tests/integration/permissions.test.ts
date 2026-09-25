import { afterAll, expect, it } from "bun:test";
import { asc, eq } from "drizzle-orm";

import {
  ministries,
  ministryPermissions,
  rolePermissions,
  roles,
  users,
} from "../../db/schema";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  isMinistryGrantable,
} from "../../lib/permissions";
import { connectTestDatabase } from "../support/database";

const database = connectTestDatabase();
afterAll(() => database.client.end());

async function permissionsFor(roleId: string) {
  const rows = await database.db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId))
    .orderBy(asc(rolePermissions.permissionKey));
  return rows.map(({ key }) => key);
}

it("migrates the built-in roles with their intended permissions", async () => {
  const builtIns = await database.db
    .select({ id: roles.id, isSystem: roles.isSystem })
    .from(roles)
    .where(eq(roles.isSystem, true))
    .orderBy(asc(roles.id));

  expect(builtIns).toEqual([
    { id: "admin", isSystem: true },
    { id: "leader", isSystem: true },
    { id: "usher", isSystem: true },
  ]);
  expect(await permissionsFor("admin")).toEqual([...PERMISSION_KEYS].sort());
  expect(await permissionsFor("leader")).toEqual(
    [...DEFAULT_ROLE_PERMISSIONS.leader].sort(),
  );
  expect(await permissionsFor("usher")).toEqual(
    [...DEFAULT_ROLE_PERMISSIONS.usher].sort(),
  );
});

it("rejects a user assigned to a role that does not exist", async () => {
  await expect(
    database.db
      .insert(users)
      .values({
        id: "invalid-role-user",
        name: "Invalid Role",
        email: "invalid-role@example.test",
        roleId: "missing-role",
      })
      .execute(),
  ).rejects.toThrow();
});

it("seeds the starter ministries with only grantable permissions", async () => {
  const seeded = await database.db
    .select({ id: ministries.id, isSystem: ministries.isSystem, active: ministries.active })
    .from(ministries)
    .orderBy(asc(ministries.id));
  expect(seeded).toEqual([
    { id: "childrens-ministry", isSystem: false, active: true },
    { id: "lam", isSystem: true, active: true },
    { id: "ushering", isSystem: false, active: true },
  ]);

  const grants = await database.db
    .select({ id: ministryPermissions.ministryId, key: ministryPermissions.permissionKey })
    .from(ministryPermissions)
    .orderBy(asc(ministryPermissions.ministryId), asc(ministryPermissions.permissionKey));
  expect(grants.every(({ key }) => isMinistryGrantable(key))).toBe(true);
  expect(grants.filter(({ id }) => id === "ushering").map(({ key }) => key)).toEqual([
    "attendance.record",
    "attendance.view",
    "services.view",
  ]);
  expect(grants.filter(({ id }) => id === "lam").map(({ key }) => key)).toContain("lam.view");
});
