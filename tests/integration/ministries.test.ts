import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import {
  members,
  ministries,
  ministryMembers,
  ministryPermissions,
  users,
} from "../../db/schema";
import { effectivePermissions } from "../../lib/ministry-access";

const database = connectTestDatabase();
// mock.module is not hoisted, so every mock is registered before the modules
// under test are imported.
const requireUser = mock();
const requirePermission = mock();
class Redirect extends Error {}
await mock.module("@/db", () => ({ db: database.db }));
// Only the session is replaced; bun keeps a module mock for the rest of the
// run, so the real exports (hasPermission and friends) have to stay.
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({
  ...realAuthHelpers,
  requireUser,
  requirePermission,
}));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
const { loadUserAccess } = await import("../../lib/access");
const {
  addRosterMember,
  deleteMinistry,
  removeRosterMember,
  setRosterPosition,
  updateMinistry,
} = await import("../../app/(app)/ministries/actions");

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "staff",
    name: "Staff",
    email: "staff@example.test",
    role: { id: "usher", name: "Usher" },
    permissions: [],
    memberId: null,
    ministries: [],
    mustChangePassword: false,
    ...overrides,
  };
}

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

async function roster(ministryId: string) {
  return database.db
    .select({ memberId: ministryMembers.memberId, position: ministryMembers.position })
    .from(ministryMembers)
    .where(eq(ministryMembers.ministryId, ministryId));
}

beforeEach(async () => {
  await resetTestDatabase(database.client);
  requireUser.mockReset();
  requirePermission.mockReset();
  await database.db.insert(users).values([
    { id: "joy-login", email: "joy@example.test", name: "Joy", roleId: "usher" },
    { id: "unlinked", email: "unlinked@example.test", name: "Unlinked", roleId: "usher" },
  ]);
  await database.db.insert(members).values([
    { id: "joy", fullName: "Joy Villanueva", qrToken: "joy", userId: "joy-login" },
    { id: "mark", fullName: "Mark Bautista", qrToken: "mark" },
  ]);
});
afterAll(() => database.client.end());

describe("loadUserAccess", () => {
  it("adds the grants of every ministry the linked member serves in", async () => {
    await database.db.insert(ministryMembers).values([
      { ministryId: "lam", memberId: "joy", position: "head" },
      { ministryId: "ushering", memberId: "joy" },
    ]);

    const access = await loadUserAccess("joy-login");
    expect(access?.memberId).toBe("joy");
    expect(access?.ministries).toEqual([
      { id: "lam", name: "LAM", position: "head" },
      { id: "ushering", name: "Ushering", position: "member" },
    ]);

    const permissions = effectivePermissions(access!.rolePermissions, access!.ministryGrants);
    expect(permissions).toContain("lam.lineups_update");
    expect(permissions).toContain("attendance.record");
    // The usher role's own permissions survive the merge.
    expect(permissions).toContain("members.view");
  });

  it("ignores an inactive ministry entirely", async () => {
    await database.db.insert(ministryMembers).values({ ministryId: "lam", memberId: "joy" });
    await database.db.update(ministries).set({ active: false }).where(eq(ministries.id, "lam"));
    try {
      const access = await loadUserAccess("joy-login");
      expect(access?.ministries).toEqual([]);
      expect(access?.ministryGrants).toEqual([]);
    } finally {
      await database.db.update(ministries).set({ active: true }).where(eq(ministries.id, "lam"));
    }
  });

  it("gives a login with no member record only its role", async () => {
    const access = await loadUserAccess("unlinked");
    expect(access?.memberId).toBeNull();
    expect(access?.ministries).toEqual([]);
    expect(access?.ministryGrants).toEqual([]);
    expect(access?.rolePermissions.length).toBeGreaterThan(0);
  });

  it("returns null for a user with no profile", async () => {
    expect(await loadUserAccess("nobody")).toBeNull();
  });
});

describe("roster actions", () => {
  it("lets a ministry head add to their own roster", async () => {
    requireUser.mockResolvedValue(
      session({ ministries: [{ id: "ushering", name: "Ushering", position: "head" }] }),
    );
    const result = await addRosterMember("ushering", undefined, form({ memberId: "mark" }));
    expect(result).toBeUndefined();
    expect(await roster("ushering")).toEqual([{ memberId: "mark", position: "member" }]);
  });

  it("refuses a head of a different ministry", async () => {
    requireUser.mockResolvedValue(
      session({ ministries: [{ id: "ushering", name: "Ushering", position: "head" }] }),
    );
    await expect(
      addRosterMember("lam", undefined, form({ memberId: "mark" })),
    ).rejects.toThrow(Redirect);
    await expect(removeRosterMember("lam", "joy")).rejects.toThrow(Redirect);
    expect(await roster("lam")).toEqual([]);
  });

  it("refuses a plain roster member", async () => {
    requireUser.mockResolvedValue(
      session({ ministries: [{ id: "ushering", name: "Ushering", position: "member" }] }),
    );
    await expect(
      addRosterMember("ushering", undefined, form({ memberId: "mark" })),
    ).rejects.toThrow(Redirect);
  });

  it("reports a member already on the roster", async () => {
    requireUser.mockResolvedValue(session({ permissions: ["ministries.update"] }));
    await database.db.insert(ministryMembers).values({ ministryId: "lam", memberId: "mark" });
    expect(await addRosterMember("lam", undefined, form({ memberId: "mark" }))).toEqual({
      errors: { memberId: "Mark Bautista is already on this roster." },
    });
  });

  it("only appoints heads through ministries.update", async () => {
    await database.db.insert(ministryMembers).values({ ministryId: "lam", memberId: "mark" });

    requirePermission.mockRejectedValueOnce(new Redirect("/no-access"));
    await expect(setRosterPosition("lam", "mark", "head")).rejects.toThrow(Redirect);
    expect(requirePermission).toHaveBeenLastCalledWith("ministries.update");
    expect(await roster("lam")).toEqual([{ memberId: "mark", position: "member" }]);

    requirePermission.mockResolvedValueOnce(session({ permissions: ["ministries.update"] }));
    await setRosterPosition("lam", "mark", "head");
    expect(await roster("lam")).toEqual([{ memberId: "mark", position: "head" }]);
  });

  it("ignores a forged position", async () => {
    await database.db.insert(ministryMembers).values({ ministryId: "lam", memberId: "mark" });
    requirePermission.mockResolvedValue(session({ permissions: ["ministries.update"] }));
    await setRosterPosition("lam", "mark", "owner" as never);
    expect(await roster("lam")).toEqual([{ memberId: "mark", position: "member" }]);
  });
});

describe("ministry actions", () => {
  it("refuses to grant a role-only permission and leaves the grants alone", async () => {
    requirePermission.mockResolvedValue(session({ permissions: ["ministries.update"] }));
    const before = await database.db
      .select()
      .from(ministryPermissions)
      .where(eq(ministryPermissions.ministryId, "ushering"));

    const result = await updateMinistry(
      "ushering",
      undefined,
      form({ name: "Ushering", description: "", active: "on", permissions: ["users.update"] }),
    );
    expect(result?.errors?.["permissions.0"]).toBe("A ministry cannot grant that permission");
    expect(
      await database.db
        .select()
        .from(ministryPermissions)
        .where(eq(ministryPermissions.ministryId, "ushering")),
    ).toEqual(before);
  });

  it("replaces the grants on a valid update", async () => {
    requirePermission.mockResolvedValue(session({ permissions: ["ministries.update"] }));
    await database.db.insert(ministries).values({ id: "prayer", name: "Prayer" });

    await expect(
      updateMinistry(
        "prayer",
        undefined,
        form({ name: "Prayer Ministry", description: "", permissions: ["members.view"] }),
      ),
    ).rejects.toThrow(Redirect);

    const [saved] = await database.db.select().from(ministries).where(eq(ministries.id, "prayer"));
    expect(saved).toMatchObject({ name: "Prayer Ministry", active: false });
    expect(
      await database.db
        .select({ key: ministryPermissions.permissionKey })
        .from(ministryPermissions)
        .where(eq(ministryPermissions.ministryId, "prayer")),
    ).toEqual([{ key: "members.view" }]);
  });

  it("will not delete the built-in LAM ministry", async () => {
    requirePermission.mockResolvedValue(session({ permissions: ["ministries.delete"] }));
    await deleteMinistry("lam");
    expect(
      await database.db.select({ id: ministries.id }).from(ministries).where(eq(ministries.id, "lam")),
    ).toHaveLength(1);
  });

  it("deletes an ordinary ministry with its roster and grants", async () => {
    requirePermission.mockResolvedValue(session({ permissions: ["ministries.delete"] }));
    // Its own ministry, not a seeded one: the seed rows outlive a test reset.
    await database.db.insert(ministries).values({ id: "prayer", name: "Prayer" });
    await database.db
      .insert(ministryPermissions)
      .values({ ministryId: "prayer", permissionKey: "members.view" });
    await database.db.insert(ministryMembers).values({ ministryId: "prayer", memberId: "mark" });
    await expect(deleteMinistry("prayer")).rejects.toThrow(Redirect);

    expect(await roster("prayer")).toEqual([]);
    expect(
      await database.db
        .select()
        .from(ministryPermissions)
        .where(eq(ministryPermissions.ministryId, "prayer")),
    ).toEqual([]);
    // The member record itself is untouched.
    expect(await database.db.select().from(members).where(eq(members.id, "mark"))).toHaveLength(1);
  });
});
