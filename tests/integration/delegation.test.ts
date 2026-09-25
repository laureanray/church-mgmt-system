import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { asc, eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import {
  members,
  ministries,
  ministryMembers,
  ministryPermissions,
  rolePermissions,
  roles,
  users,
} from "../../db/schema";
import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey } from "../../lib/permissions";

/*
 * Nobody grants, or takes over, access they do not hold (lib/delegation.ts).
 * The actor throughout is "Office": it runs staff accounts, roles and
 * ministries, but is not an administrator — the case the rule exists for.
 */

const database = connectTestDatabase();
const requirePermission = mock();
const requireUser = mock();
class Redirect extends Error {}
await mock.module("@/db", () => ({ db: database.db }));
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({
  ...realAuthHelpers,
  requirePermission,
  requireUser,
}));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
const createAuthUser = mock(async () => ({ data: { user: { id: "new-login" } }, error: null }));
const updateUserById = mock(async () => ({ error: null }));
const deleteAuthUser = mock(async () => ({ error: null }));
await mock.module("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: { createUser: createAuthUser, updateUserById, deleteUser: deleteAuthUser },
    },
  }),
}));

const { createUser, deleteUser, resetUserPassword, updateUser } = await import(
  "../../app/(app)/users/actions"
);
const { createRole, updateRole } = await import("../../app/(app)/roles/actions");
const { addRosterMember, updateMinistry } = await import(
  "../../app/(app)/ministries/actions"
);

/** Office's role, as saved. `members.delete` is deliberately absent. */
const OFFICE_ROLE: PermissionKey[] = [
  ...DEFAULT_ROLE_PERMISSIONS.usher,
  "members.create",
  "users.view",
  "users.create",
  "users.update",
  "users.reset_password",
  "users.delete",
  "roles.view",
  "roles.create",
  "roles.update",
  "ministries.view",
  "ministries.update",
];

function office(extra: PermissionKey[] = []) {
  return {
    id: "office-login",
    name: "Office",
    email: "office@example.test",
    role: { id: "office", name: "Office" },
    permissions: [...OFFICE_ROLE, ...extra],
    memberId: "office-member",
    ministries: [],
    mustChangePassword: false,
  };
}

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

async function redirectOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Redirect) return error.message;
    throw error;
  }
  return null;
}

async function grantsOf(roleId: string) {
  const rows = await database.db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId))
    .orderBy(asc(rolePermissions.permissionKey));
  return rows.map(({ key }) => key);
}

async function ministryGrants(ministryId: string) {
  const rows = await database.db
    .select({ key: ministryPermissions.permissionKey })
    .from(ministryPermissions)
    .where(eq(ministryPermissions.ministryId, ministryId))
    .orderBy(asc(ministryPermissions.permissionKey));
  return rows.map(({ key }) => key);
}

beforeEach(async () => {
  await resetTestDatabase(database.client);
  // Roles outlive the reset — they are migration data — so drop this file's.
  await database.db.delete(roles).where(eq(roles.isSystem, false));
  for (const fn of [requirePermission, requireUser, createAuthUser, updateUserById, deleteAuthUser]) {
    fn.mockClear();
  }
  requirePermission.mockResolvedValue(office());
  requireUser.mockResolvedValue(office());

  await database.db.insert(roles).values([
    { id: "office", name: "Office" },
    { id: "coordinator", name: "Coordinator" },
  ]);
  await database.db.insert(rolePermissions).values([
    ...OFFICE_ROLE.map((permissionKey) => ({ roleId: "office", permissionKey })),
    { roleId: "coordinator", permissionKey: "members.view" },
    { roleId: "coordinator", permissionKey: "members.delete" },
  ]);
  await database.db.insert(users).values([
    { id: "admin-login", email: "admin@example.test", name: "Admin", roleId: "admin" },
    { id: "office-login", email: "office@example.test", name: "Office", roleId: "office" },
    { id: "usher-login", email: "usher@example.test", name: "Usher", roleId: "usher" },
  ]);
  await database.db.insert(members).values([
    { id: "office-member", fullName: "Olive Office", qrToken: "olive", userId: "office-login" },
    { id: "grace", fullName: "Grace Santos", qrToken: "grace" },
  ]);
  // Worship grants a line-up permission Office does not hold; Grace serves in it.
  await database.db.insert(ministries).values([
    { id: "worship", name: "Worship Team", active: true },
    { id: "dormant", name: "Dormant Team", active: false },
  ]);
  await database.db.insert(ministryPermissions).values([
    { ministryId: "worship", permissionKey: "lam.lineups_update" },
    { ministryId: "dormant", permissionKey: "lam.lineups_update" },
  ]);
  await database.db.insert(ministryMembers).values({ ministryId: "worship", memberId: "grace" });
});
afterAll(async () => {
  await resetTestDatabase(database.client);
  await database.db.delete(roles).where(eq(roles.isSystem, false));
  await database.client.end();
});

describe("staff accounts", () => {
  const newAccount = (roleId: string, memberId = "") =>
    form({ name: "New Staff", email: "new@example.test", roleId, memberId });

  it("will not create an account with a role holding more than the creator", async () => {
    const result = await createUser(undefined, newAccount("admin"));
    expect(result?.errors?.roleId).toStartWith("This role grants access you do not have:");
    expect(createAuthUser).not.toHaveBeenCalled();
  });

  it("creates an account whose role is within the creator's own access", async () => {
    expect(await createUser(undefined, newAccount("usher"))).toMatchObject({ ok: true });
    expect(createAuthUser).toHaveBeenCalledTimes(1);
  });

  it("will not link a member whose ministries grant more than the creator holds", async () => {
    const result = await createUser(undefined, newAccount("usher", "grace"));
    expect(result?.errors?.memberId).toBe(
      "This member’s ministries grant access you do not have: Plan line-ups.",
    );
    expect(createAuthUser).not.toHaveBeenCalled();
  });

  it("will not edit an administrator, not even their email", async () => {
    const result = await updateUser(
      "admin-login",
      undefined,
      form({ name: "Admin", email: "office.owns.this@example.test", roleId: "admin", memberId: "" }),
    );
    expect(result?.message).toStartWith("This account has access you do not hold");
    expect(updateUserById).not.toHaveBeenCalled();
    const [admin] = await database.db.select().from(users).where(eq(users.id, "admin-login"));
    expect(admin.email).toBe("admin@example.test");
  });

  it("will not promote an account past the editor", async () => {
    const result = await updateUser(
      "usher-login",
      undefined,
      form({ name: "Usher", email: "usher@example.test", roleId: "admin", memberId: "" }),
    );
    expect(result?.errors?.roleId).toStartWith("This role grants access you do not have:");
    const [usher] = await database.db.select().from(users).where(eq(users.id, "usher-login"));
    expect(usher.roleId).toBe("usher");
  });

  it("will not reset an administrator's password", async () => {
    expect(await redirectOf(resetUserPassword("admin-login", undefined))).toBe("/no-access");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("resets the password of an account within reach", async () => {
    const result = await resetUserPassword("usher-login", undefined);
    expect(result?.email).toBe("usher@example.test");
    expect(updateUserById).toHaveBeenCalledTimes(1);
  });

  it("will not delete an administrator", async () => {
    expect(await redirectOf(deleteUser("office-login", "admin-login"))).toBe("/no-access");
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(await database.db.$count(users, eq(users.id, "admin-login"))).toBe(1);
  });

  it("ignores a forged currentUserId: nobody deletes their own account", async () => {
    await deleteUser("someone-else", "office-login");
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });
});

describe("roles", () => {
  const roleForm = (name: string, permissions: string[]) =>
    form({ name, description: "", permissions });

  it("will not create a role with a permission the creator lacks", async () => {
    const result = await createRole(undefined, roleForm("Treasurer", ["members.view", "settings.update"]));
    expect(result?.message).toBe(
      "You can only grant permissions you hold yourself. You do not hold: Update settings.",
    );
    expect(await database.db.$count(roles, eq(roles.name, "Treasurer"))).toBe(0);
  });

  it("will not add a permission to someone else's role that the editor lacks", async () => {
    const result = await updateRole(
      "coordinator",
      undefined,
      roleForm("Coordinator", ["members.view", "members.delete", "settings.update"]),
    );
    expect(result?.message).toContain("You do not hold: Update settings.");
    expect(await grantsOf("coordinator")).toEqual(["members.delete", "members.view"]);
  });

  it("keeps a permission the editor cannot touch when its locked box is not submitted", async () => {
    // members.delete is locked for Office, so the form does not send it.
    expect(
      await redirectOf(
        updateRole("coordinator", undefined, roleForm("Coordinator", ["members.view", "members.create"])),
      ),
    ).toBe("/roles");
    expect(await grantsOf("coordinator")).toEqual([
      "members.create",
      "members.delete",
      "members.view",
    ]);
  });

  it("will not change the permissions of the editor's own role", async () => {
    // Office holds members.delete through a ministry, but its role does not.
    requirePermission.mockResolvedValue(office(["members.delete"]));
    const result = await updateRole(
      "office",
      undefined,
      roleForm("Office", [...OFFICE_ROLE, "members.delete"]),
    );
    expect(result?.message).toStartWith("You cannot change the permissions of your own role.");
    expect(await grantsOf("office")).toEqual([...OFFICE_ROLE].sort());
  });

  it("still renames the editor's own role when its permissions are unchanged", async () => {
    expect(
      await redirectOf(updateRole("office", undefined, roleForm("Church Office", OFFICE_ROLE))),
    ).toBe("/roles");
    const [role] = await database.db.select().from(roles).where(eq(roles.id, "office"));
    expect(role.name).toBe("Church Office");
  });
});

describe("ministries", () => {
  const ministryForm = (name: string, permissions: string[], active = true) =>
    form({ name, description: "", ...(active ? { active: "on" } : {}), permissions });

  it("will not make a ministry grant what the editor lacks", async () => {
    const result = await updateMinistry(
      "worship",
      undefined,
      ministryForm("Worship Team", ["lam.lineups_update", "members.delete"]),
    );
    expect(result?.message).toContain("You do not hold: Delete members.");
    expect(await ministryGrants("worship")).toEqual(["lam.lineups_update"]);
  });

  it("will not reactivate a ministry whose grants the editor lacks", async () => {
    const result = await updateMinistry(
      "dormant",
      undefined,
      ministryForm("Dormant Team", ["lam.lineups_update"]),
    );
    expect(result?.message).toBe(
      "Reactivating this ministry would restore access you do not hold: Plan line-ups.",
    );
    const [dormant] = await database.db.select().from(ministries).where(eq(ministries.id, "dormant"));
    expect(dormant.active).toBe(false);
  });

  it("will not let the editor roster themselves into access they lack", async () => {
    const result = await addRosterMember("worship", undefined, form({ memberId: "office-member" }));
    expect(result?.errors?.memberId).toBe(
      "You cannot add yourself: this ministry grants access you do not hold (Plan line-ups).",
    );
    expect(
      await database.db.$count(ministryMembers, eq(ministryMembers.memberId, "office-member")),
    ).toBe(0);
  });

  it("still rosters someone else", async () => {
    await database.db.insert(members).values({ id: "ben", fullName: "Ben Cruz", qrToken: "ben" });
    expect(await addRosterMember("worship", undefined, form({ memberId: "ben" }))).toBeUndefined();
  });
});
