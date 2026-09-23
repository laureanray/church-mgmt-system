import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { members, services, users } from "../../db/schema";

const database = connectTestDatabase();
// Registered before the actions are imported: bun's mock.module is not hoisted.
const requirePermission = mock();
const revalidatePath = mock();
await mock.module("@/db", () => ({ db: database.db }));
await mock.module("@/lib/auth-helpers", () => ({ requirePermission }));
await mock.module("next/cache", () => ({ revalidatePath }));
await mock.module("next/navigation", () => ({ redirect: mock() }));
const { reactivateMember } = await import("../../app/(app)/members/actions");
const { recordAttendance } = await import("../../app/(app)/scan/actions");

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db
    .insert(users)
    .values({ id: "leader", email: "leader@example.test", name: "Leader" });
  await database.db.insert(services).values({
    id: "service",
    name: "Sunday",
    scheduledAt: new Date(),
  });
  requirePermission.mockReset();
  requirePermission.mockResolvedValue({
    id: "leader",
    name: "Leader",
    role: { id: "leader", name: "Leader" },
    permissions: ["attendance.record", "members.update"],
    email: "leader@example.test",
    mustChangePassword: false,
  });
  revalidatePath.mockReset();
});
afterAll(() => database.client.end());

it("gives every member a status, active unless said otherwise", async () => {
  // Inserted without the column, the way every row predating it was.
  await database.client`INSERT INTO members (id, full_name, qr_token) VALUES ('legacy', 'Old Record', 'legacy-token')`;

  const [row] = await database.db
    .select({ status: members.status })
    .from(members)
    .where(eq(members.id, "legacy"));
  expect(row.status).toBe("active");

  const [column] = await database.db.execute<{ is_nullable: string }>(
    sql`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'status'`,
  );
  expect(column.is_nullable).toBe("NO");
});

it("tells the check-in screen the member's status", async () => {
  await database.db.insert(members).values([
    { id: "ana", fullName: "Ana Santos", qrToken: "ana-token" },
    { id: "ben", fullName: "Ben Cruz", qrToken: "ben-token", status: "inactive" },
  ]);

  expect(await recordAttendance("service", "ana-token")).toMatchObject({
    status: "ok",
    memberStatus: "active",
  });
  // A lapsed member is still checked in; the screen decides what to ask.
  expect(await recordAttendance("service", "ben-token")).toMatchObject({
    status: "ok",
    memberStatus: "inactive",
  });
  expect(await recordAttendance("service", "ben-token")).toMatchObject({
    status: "duplicate",
    memberStatus: "inactive",
  });
});

it("reactivates a lapsed member", async () => {
  await database.db
    .insert(members)
    .values({ id: "ben", fullName: "Ben Cruz", qrToken: "ben-token", status: "transferred" });

  expect(await reactivateMember("ben")).toEqual({ status: "ok" });

  const [row] = await database.db
    .select({ status: members.status })
    .from(members)
    .where(eq(members.id, "ben"));
  expect(row.status).toBe("active");
  expect(requirePermission).toHaveBeenCalledWith("members.update");
  expect(revalidatePath).toHaveBeenCalledWith("/members/ben");
});

it("leaves a member alone who is not lapsed, or no longer exists", async () => {
  await database.db
    .insert(members)
    .values({ id: "vic", fullName: "Vic Visitor", qrToken: "vic-token", status: "visitor" });

  expect(await reactivateMember("vic")).toMatchObject({ status: "error" });
  expect(await reactivateMember("missing")).toMatchObject({ status: "error" });

  const [row] = await database.db
    .select({ status: members.status })
    .from(members)
    .where(eq(members.id, "vic"));
  expect(row.status).toBe("visitor");
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("refuses to reactivate without permission to edit members", async () => {
  await database.db
    .insert(members)
    .values({ id: "ben", fullName: "Ben Cruz", qrToken: "ben-token", status: "inactive" });
  requirePermission.mockRejectedValueOnce(new Error("forbidden"));

  await expect(reactivateMember("ben")).rejects.toThrow("forbidden");

  const [row] = await database.db
    .select({ status: members.status })
    .from(members)
    .where(eq(members.id, "ben"));
  expect(row.status).toBe("inactive");
});
