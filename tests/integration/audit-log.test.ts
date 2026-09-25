import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { auditLog, members, users } from "../../db/schema";
import { PERMISSION_KEYS } from "../../lib/permissions";

const database = connectTestDatabase();
// Registered before the actions are imported: bun's mock.module is not hoisted.
const requirePermission = mock();
await mock.module("@/db", () => ({ db: database.db }));
await mock.module("@/lib/auth-helpers", () => ({ requirePermission }));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({ redirect: mock(), notFound: mock() }));
const { updateMember, createMember, deleteMember } = await import(
  "../../app/(app)/members/actions"
);
const { saveSheetsSettings } = await import("../../app/(app)/settings/actions");
const { assignMemberToCellGroup, createCellGroup } = await import(
  "../../app/(app)/cell-groups/actions"
);

function signedInAs(id: string) {
  requirePermission.mockReset();
  requirePermission.mockResolvedValue({
    id,
    name: "Admin",
    email: `${id}@example.test`,
    role: { id: "admin", name: "Admin" },
    // The member service authorizes again on its own, so the actor needs real
    // permissions, not just a passing requirePermission mock.
    permissions: PERMISSION_KEYS,
    mustChangePassword: false,
  });
}

function memberForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const fields = {
    firstName: "Ana",
    lastName: "Santos",
    contactNumber: "0917 000 0000",
    status: "active",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

const entries = () => database.db.select().from(auditLog);

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db
    .insert(users)
    .values({ id: "admin", email: "admin@example.test", name: "Admin" });
  await database.db.insert(members).values({
    id: "ana",
    fullName: "Ana Santos",
    firstName: "Ana",
    lastName: "Santos",
    contactNumber: "0917 000 0000",
    qrToken: "ana-token",
  });
  signedInAs("admin");
});
afterAll(() => database.client.end());

it("logs one entry holding only the changed contact number", async () => {
  await updateMember("ana", undefined, memberForm({ contactNumber: "0918 111 1111" }));

  const log = await entries();
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({
    actorId: "admin",
    action: "member.update",
    entity: "member",
    entityId: "ana",
    before: { contactNumber: "0917 000 0000" },
    after: { contactNumber: "0918 111 1111" },
    summary: "Edited Ana Santos: contact number",
  });
});

it("logs nothing when validation fails", async () => {
  const result = await updateMember("ana", undefined, memberForm({ firstName: "" }));
  expect(result?.errors?.firstName).toBeDefined();
  expect(await entries()).toHaveLength(0);
});

it("logs nothing for a save that changed nothing", async () => {
  await updateMember("ana", undefined, memberForm());
  expect(await entries()).toHaveLength(0);
});

it("labels a status change as one", async () => {
  await updateMember("ana", undefined, memberForm({ status: "inactive" }));
  const [entry] = await entries();
  expect(entry.action).toBe("member.status_change");
  expect(entry.after).toEqual({ status: "inactive" });
});

it("rolls the change back when the entry cannot be written", async () => {
  // No such user, so the audit insert breaks its foreign key.
  signedInAs("ghost");
  await expect(
    updateMember("ana", undefined, memberForm({ contactNumber: "0999" })),
  ).rejects.toThrow();

  const [ana] = await database.db.select().from(members).where(eq(members.id, "ana"));
  expect(ana.contactNumber).toBe("0917 000 0000");
  expect(await entries()).toHaveLength(0);
});

it("keeps the whole record on create and delete, with the QR token redacted", async () => {
  await createMember(undefined, memberForm({ firstName: "Ben", lastName: "Cruz" }));
  const [created] = await entries();
  expect(created.action).toBe("member.create");
  expect(created.before).toBeNull();
  expect(created.after).toMatchObject({ fullName: "Ben Cruz", qrToken: "[redacted]" });

  await deleteMember("ana");
  const deleted = (await entries()).find((e) => e.action === "member.delete");
  expect(deleted?.before).toMatchObject({ id: "ana", fullName: "Ana Santos" });
  expect(deleted?.after).toBeNull();
});

it("never stores the webhook secret", async () => {
  const form = new FormData();
  form.set("webhookUrl", "https://script.google.com/macros/s/abc/exec");
  form.set("webhookSecret", "super-secret-value");
  await saveSheetsSettings(undefined, form);

  const [entry] = await entries();
  expect(entry.action).toBe("settings.update");
  expect(JSON.stringify(entry)).not.toContain("super-secret-value");
  expect(entry.after).toMatchObject({
    sheetsWebhookUrl: "https://script.google.com/macros/s/abc/exec",
    sheetsWebhookSecret: "[redacted]",
  });
});

it("records cell-group membership on the member's own history", async () => {
  const create = new FormData();
  create.set("name", "Youth");
  await createCellGroup(undefined, create);
  const [cell] = await database.db.query.cellGroups.findMany();

  const assign = new FormData();
  assign.set("memberId", "ana");
  assign.set("cellGroupId", cell.id);
  await assignMemberToCellGroup(assign);

  const moved = (await entries()).find((e) => e.entityId === "ana");
  expect(moved).toMatchObject({
    action: "member.cell_group_change",
    entity: "member",
    before: { cellGroupId: null },
    after: { cellGroupId: cell.id },
    summary: "Moved Ana Santos into Youth",
  });
});

it("keeps an entry, unattributed, after its author is deleted", async () => {
  await updateMember("ana", undefined, memberForm({ contactNumber: "0918" }));
  await database.db.delete(users).where(eq(users.id, "admin"));

  const [entry] = await entries();
  expect(entry.actorId).toBeNull();
  expect(entry.summary).toBe("Edited Ana Santos: contact number");
});
