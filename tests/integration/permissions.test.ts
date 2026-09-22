import { afterAll, expect, it } from "bun:test";
import { asc, eq } from "drizzle-orm";

import { rolePermissions, roles, users } from "../../db/schema";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
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
