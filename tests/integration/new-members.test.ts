import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { attendance, auditLog, memberFaces, members, services, users } from "../../db/schema";
import { PERMISSION_KEYS } from "../../lib/permissions";

const database = connectTestDatabase();
// Registered before the actions are imported: bun's mock.module is not hoisted.
const requirePermission = mock();
const redirect = mock();
await mock.module("@/db", () => ({ db: database.db }));
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({ ...realAuthHelpers, requirePermission }));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({ redirect, notFound: mock() }));

const realTencent = await import("@/lib/tencent-face");
const tencent = {
  isFaceConfigured: mock(() => true),
  enrollFacePerson: mock(async (_personId: string, _image: Uint8Array) => {}),
  removeFacePerson: mock(async (_personId: string) => {}),
};
await mock.module("@/lib/tencent-face", () => ({ ...realTencent, ...tencent }));

const { createMember } = await import("../../app/(app)/members/actions");
const { addVisitor } = await import("../../app/(app)/scan/actions");
const { TencentFaceError } = realTencent;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function memberForm(
  fields: Record<string, string>,
  { photo = true, consent = true }: { photo?: boolean; consent?: boolean } = {},
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (photo) form.set("facePhoto", new Blob([JPEG as BlobPart], { type: "image/jpeg" }), "face.jpg");
  if (consent) form.set("faceConsent", "yes");
  return form;
}

function signedInAs(permissions: readonly string[] = PERMISSION_KEYS) {
  requirePermission.mockReset();
  requirePermission.mockResolvedValue({
    id: "staff",
    name: "Staff Member",
    email: "staff@example.test",
    role: { id: "admin", name: "Admin" },
    permissions,
    mustChangePassword: false,
  });
}

const allMembers = () => database.db.select().from(members);
const faces = () => database.db.select().from(memberFaces);

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db
    .insert(users)
    .values({ id: "staff", email: "staff@example.test", name: "Staff Member" });
  await database.db
    .insert(services)
    .values({ id: "sunday", name: "Sunday", scheduledAt: new Date() });
  for (const fn of Object.values(tencent)) fn.mockClear();
  tencent.isFaceConfigured.mockImplementation(() => true);
  tencent.enrollFacePerson.mockImplementation(async () => {});
  redirect.mockClear();
  signedInAs();
});
afterAll(() => database.client.end());

describe("a new member with a photo", () => {
  it("enrols the face under the id the member is created with, with consent and both audit entries", async () => {
    await createMember(undefined, memberForm({ firstName: "Joy", lastName: "Ramos" }));

    const [member] = await allMembers();
    expect(member.fullName).toBe("Joy Ramos");
    expect(tencent.enrollFacePerson.mock.calls[0]?.[0]).toBe(member.id);
    const [face] = await faces();
    expect(face).toMatchObject({ memberId: member.id, consentRecordedBy: "staff", enrolledBy: "staff" });
    expect(face.consentNotice.length).toBeGreaterThan(40);

    const actions = (await database.db.select().from(auditLog)).map((e) => e.action).sort();
    expect(actions).toEqual(["member.create", "member.face_enroll"]);
    expect(redirect).toHaveBeenCalledWith(`/members/${member.id}`);
  });

  it("creates nobody when Tencent refuses the photo, and says why beside it", async () => {
    tencent.enrollFacePerson.mockImplementation(async () => {
      throw new TencentFaceError("InvalidParameterValue.NoFaceInPhoto", "none");
    });
    const state = await createMember(undefined, memberForm({ firstName: "Joy", lastName: "Ramos" }));

    expect(state).toMatchObject({
      errors: { facePhoto: "No face found. Face the camera, in good light." },
    });
    expect(await allMembers()).toHaveLength(0);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a photo without consent, before Tencent sees it", async () => {
    const state = await createMember(
      undefined,
      memberForm({ firstName: "Joy", lastName: "Ramos" }, { consent: false }),
    );
    expect(state).toMatchObject({ errors: { faceConsent: expect.stringContaining("consent") } });
    expect(tencent.enrollFacePerson).not.toHaveBeenCalled();
    expect(await allMembers()).toHaveLength(0);
  });

  it("checks the member's own fields before spending a Tencent call", async () => {
    const state = await createMember(undefined, memberForm({ firstName: "Joy", lastName: "" }));
    expect(state).toMatchObject({ errors: { lastName: "Last name is required" } });
    expect(tencent.enrollFacePerson).not.toHaveBeenCalled();
  });

  it("takes the face back out when the member cannot be written", async () => {
    // A cell group that does not exist: the insert fails after Tencent enrolled the face.
    await expect(
      createMember(undefined, memberForm({ firstName: "Joy", lastName: "Ramos", cellGroupId: "missing" })),
    ).rejects.toThrow();
    const enrolledAs = tencent.enrollFacePerson.mock.calls[0]?.[0];
    expect(tencent.removeFacePerson).toHaveBeenCalledWith(enrolledAs);
    expect(await allMembers()).toHaveLength(0);
    expect(await faces()).toHaveLength(0);
  });

  it("is a plain create without a photo", async () => {
    await createMember(undefined, memberForm({ firstName: "Joy", lastName: "Ramos" }, { photo: false }));
    expect(await allMembers()).toHaveLength(1);
    expect(await faces()).toHaveLength(0);
    expect(tencent.enrollFacePerson).not.toHaveBeenCalled();
  });

  it("needs members.update to enrol the face", async () => {
    signedInAs(["members.view", "members.create"]);
    await expect(
      createMember(undefined, memberForm({ firstName: "Joy", lastName: "Ramos" })),
    ).rejects.toThrow("permission");
    expect(await allMembers()).toHaveLength(0);
  });
});

describe("a first-time visitor at the door", () => {
  it("is added as a visitor and checked in", async () => {
    const result = await addVisitor(
      "sunday",
      undefined,
      memberForm({ firstName: "Joy", lastName: "Ramos", contactNumber: "0917 000 0000" }, { photo: false }),
    );

    const [member] = await allMembers();
    expect(member).toMatchObject({ fullName: "Joy Ramos", status: "visitor", contactNumber: "0917 000 0000" });
    expect(result).toMatchObject({
      status: "ok",
      checkIn: { status: "ok", memberId: member.id, memberStatus: "visitor" },
    });
    const rows = await database.db.select().from(attendance).where(eq(attendance.memberId, member.id));
    expect(rows).toHaveLength(1);
  });

  it("can be photographed as they are added, with consent", async () => {
    await addVisitor("sunday", undefined, memberForm({ firstName: "Joy", lastName: "Ramos" }));
    const [member] = await allMembers();
    const [face] = await faces();
    expect(face.memberId).toBe(member.id);
    expect(tencent.enrollFacePerson.mock.calls[0]?.[0]).toBe(member.id);
  });

  it("creates nobody without a service, a name, or an accepted photo", async () => {
    expect(
      await addVisitor("", undefined, memberForm({ firstName: "Joy", lastName: "Ramos" }, { photo: false })),
    ).toMatchObject({ status: "error", message: "Select a service first." });
    expect(
      await addVisitor("sunday", undefined, memberForm({ firstName: "", lastName: "Ramos" }, { photo: false })),
    ).toMatchObject({ status: "error", errors: { firstName: "First name is required" } });

    tencent.enrollFacePerson.mockImplementation(async () => {
      throw new TencentFaceError("InvalidParameterValue.FaceSizeTooSmall", "small");
    });
    expect(
      await addVisitor("sunday", undefined, memberForm({ firstName: "Joy", lastName: "Ramos" })),
    ).toMatchObject({ status: "error", errors: { facePhoto: expect.stringContaining("Step closer") } });

    expect(await allMembers()).toHaveLength(0);
    expect(await database.db.select().from(attendance)).toHaveLength(0);
  });

  it("needs both members.create and attendance.record", async () => {
    signedInAs(["attendance.record", "attendance.view", "members.view"]);
    await expect(
      addVisitor("sunday", undefined, memberForm({ firstName: "Joy", lastName: "Ramos" }, { photo: false })),
    ).rejects.toThrow("permission");
    expect(await allMembers()).toHaveLength(0);
  });
});
