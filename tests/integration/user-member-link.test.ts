import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { asc, eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { members, users } from "../../db/schema";

const database = connectTestDatabase();
const requirePermission = mock();
class Redirect extends Error {}
await mock.module("@/db", () => ({ db: database.db }));
// Only the session is replaced; bun keeps a module mock for the rest of the
// run, so the real exports (hasPermission and friends) have to stay.
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({
  ...realAuthHelpers,
  requirePermission,
  requireUser: mock(),
}));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
// Only reached when an email changes.
const updateUserById = mock(
  async (_id: string, _attributes: object): Promise<{ error: { message: string } | null }> => ({ error: null }),
);
await mock.module("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById } } }),
}));
const { createUser, updateUser } = await import("../../app/(app)/users/actions");

function editForm(memberId: string, email = "joy@example.test") {
  const data = new FormData();
  data.set("name", "Joy");
  data.set("email", email);
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
  updateUserById.mockClear();
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

// Another staff member links Joy to the admin's login in a transaction that
// has not committed yet, so updateUser's early check still sees Joy unclaimed.
async function editWhileRivalClaimsJoy(form: FormData) {
  const rival = await database.client.reserve();
  try {
    await rival`BEGIN`;
    await rival`UPDATE members SET user_id = 'admin' WHERE id = 'joy'`;

    const pending = updateUser("joy-login", undefined, form).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    // Give the claim time to block on the rival's row lock.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await rival`COMMIT`;
    return await pending;
  } finally {
    // A no-op after COMMIT; after a failure it keeps the pooled connection
    // from carrying an open transaction into the next test.
    await rival`ROLLBACK`.catch(() => {});
    rival.release();
  }
}

it("loses the claim when another login takes the member mid-request", async () => {
  expect(await editWhileRivalClaimsJoy(editForm("joy"))).toEqual({
    value: { errors: { memberId: "That member is already linked to another staff login." } },
  });

  // The rival's link stands, and Joy's login keeps its previous member.
  const rows = await links();
  expect(rows.find((row) => row.id === "joy")?.userId).toBe("admin");
  expect(rows.find((row) => row.id === "joy-duplicate")?.userId).toBe("joy-login");
  expect(updateUserById).not.toHaveBeenCalled();
});

it("restores the login email when the claim is lost after changing it", async () => {
  const outcome = await editWhileRivalClaimsJoy(editForm("joy", "joy.new@example.test"));
  expect(outcome).toEqual({
    value: { errors: { memberId: "That member is already linked to another staff login." } },
  });

  // Supabase took the new email before the claim failed, then got the old one back.
  expect(updateUserById.mock.calls).toEqual([
    ["joy-login", { email: "joy.new@example.test", email_confirm: true }],
    ["joy-login", { email: "joy@example.test", email_confirm: true }],
  ]);
  const [profile] = await database.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, "joy-login"));
  expect(profile.email).toBe("joy@example.test");
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

it("keeps the profile in step when Supabase refuses the old email back", async () => {
  updateUserById
    .mockImplementationOnce(async () => ({ error: null }))
    .mockImplementationOnce(async () => ({ error: { message: "Service unavailable" } }));
  const outcome = await editWhileRivalClaimsJoy(editForm("joy", "joy.new@example.test"));
  expect(outcome).toEqual({
    value: {
      errors: { memberId: "That member is already linked to another staff login." },
      message: "The new email was saved, but nothing else was. Pick another member record.",
    },
  });

  // Supabase kept the new address, so the profile now shows it too.
  const [profile] = await database.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, "joy-login"));
  expect(profile.email).toBe("joy.new@example.test");
  expect((await links()).find((row) => row.id === "joy-duplicate")?.userId).toBe("joy-login");
});

it("refuses to link a member at creation without users.update", async () => {
  requirePermission.mockResolvedValue({ id: "admin", memberId: null, permissions: ["users.create"] });
  const data = new FormData();
  data.set("name", "Joy");
  data.set("email", "joy.login@example.test");
  data.set("roleId", "usher");
  data.set("memberId", "joy");

  const result = await createUser(undefined, data);
  expect(result?.errors?.memberId).toBe("You cannot link a member record.");
  expect(requirePermission).toHaveBeenCalledWith("users.create");
  expect((await links()).find((row) => row.id === "joy")?.userId).toBeNull();
});
