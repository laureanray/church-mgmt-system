import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { asc } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { members, users } from "../../db/schema";

const database = connectTestDatabase();
const requirePermission = mock();
class Redirect extends Error {}
await mock.module("@/db", () => ({ db: database.db }));
await mock.module("@/lib/auth-helpers", () => ({ requirePermission, requireUser: mock() }));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
// Only reached when an email changes, which these tests never do.
await mock.module("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("Supabase admin should not be called");
  },
}));
const { updateUser } = await import("../../app/(app)/users/actions");

function editForm(memberId: string) {
  const data = new FormData();
  data.set("name", "Joy");
  data.set("email", "joy@example.test");
  data.set("roleId", "usher");
  data.set("memberId", memberId);
  return data;
}

async function links() {
  return database.db
    .select({ id: members.id, userId: members.userId })
    .from(members)
    .orderBy(asc(members.id));
}

beforeEach(async () => {
  await resetTestDatabase(database.client);
  requirePermission.mockReset();
  requirePermission.mockResolvedValue({ id: "admin", memberId: null, permissions: ["users.update"] });
  await database.db.insert(users).values([
    { id: "admin", email: "admin@example.test", name: "Admin", roleId: "admin" },
    { id: "joy-login", email: "joy@example.test", name: "Joy", roleId: "usher" },
    { id: "mark-login", email: "mark@example.test", name: "Mark", roleId: "usher" },
  ]);
  await database.db.insert(members).values([
    { id: "joy", fullName: "Joy Villanueva", qrToken: "joy" },
    { id: "joy-duplicate", fullName: "Joy V.", qrToken: "joy-2", userId: "joy-login" },
    { id: "mark", fullName: "Mark Bautista", qrToken: "mark", userId: "mark-login" },
  ]);
});
afterAll(() => database.client.end());

it("moves a login's link to the chosen member, releasing the old one", async () => {
  await expect(updateUser("joy-login", undefined, editForm("joy"))).rejects.toThrow(Redirect);
  expect(await links()).toEqual([
    { id: "joy", userId: "joy-login" },
    { id: "joy-duplicate", userId: null },
    { id: "mark", userId: "mark-login" },
  ]);
});

it("unlinks when no member is chosen", async () => {
  await expect(updateUser("joy-login", undefined, editForm(""))).rejects.toThrow(Redirect);
  expect((await links()).find((row) => row.id === "joy-duplicate")?.userId).toBeNull();
});

it("refuses a member another login already claims", async () => {
  expect(await updateUser("joy-login", undefined, editForm("mark"))).toEqual({
    errors: { memberId: "That member is already linked to another staff login." },
  });
  expect((await links()).find((row) => row.id === "mark")?.userId).toBe("mark-login");
});

it("refuses to relink your own login", async () => {
  requirePermission.mockResolvedValue({
    id: "joy-login",
    memberId: "joy-duplicate",
    permissions: ["users.update"],
  });
  const result = await updateUser("joy-login", undefined, editForm("joy"));
  expect(result?.errors?.memberId).toBe("You cannot change your own member record.");
  expect((await links()).find((row) => row.id === "joy")?.userId).toBeNull();
});
