import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { attendance, auditLog, memberFaces, members, services, users } from "../../db/schema";
import { PERMISSION_KEYS } from "../../lib/permissions";

const database = connectTestDatabase();
// Registered before the actions are imported: bun's mock.module is not hoisted.
const requirePermission = mock();
await mock.module("@/db", () => ({ db: database.db }));
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({
  ...realAuthHelpers,
  requirePermission,
}));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({ redirect: mock(), notFound: mock() }));

// Tencent is replaced wholesale; the error class stays real so the service
// can tell a refusal from a bug.
const realTencent = await import("@/lib/tencent-face");
const tencent = {
  isFaceConfigured: mock(() => true),
  enrollFacePerson: mock(async () => {}),
  removeFacePerson: mock(async () => {}),
  searchFace: mock(async (): Promise<{ personId: string; score: number } | null> => null),
};
await mock.module("@/lib/tencent-face", () => ({ ...realTencent, ...tencent }));

const { enrollMemberFace, removeMemberFace, deleteMember } = await import(
  "../../app/(app)/members/actions"
);
const { checkInByFace } = await import("../../app/(app)/scan/actions");
const { TencentFaceError } = realTencent;

/** The smallest thing the service accepts as a JPEG: the magic bytes. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function form(field: string, bytes: Uint8Array = JPEG) {
  const data = new FormData();
  data.set(field, new Blob([bytes as BlobPart], { type: "image/jpeg" }), "face.jpg");
  return data;
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

const faces = () => database.db.select().from(memberFaces);
const entries = () => database.db.select().from(auditLog);

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db
    .insert(users)
    .values({ id: "staff", email: "staff@example.test", name: "Staff Member" });
  await database.db.insert(members).values([
    { id: "ana", fullName: "Ana Santos", qrToken: "ana-token" },
    { id: "ruth", fullName: "Ruth Villanueva", qrToken: "ruth-token", status: "inactive" },
  ]);
  await database.db
    .insert(services)
    .values({ id: "sunday", name: "Sunday", scheduledAt: new Date() });
  for (const fn of Object.values(tencent)) fn.mockClear();
  tencent.isFaceConfigured.mockImplementation(() => true);
  tencent.enrollFacePerson.mockImplementation(async () => {});
  tencent.searchFace.mockImplementation(async () => null);
  signedInAs();
});
afterAll(() => database.client.end());

describe("enrolment", () => {
  it("sends the photo to Tencent under the member's id, then keeps it with an audit entry", async () => {
    const result = await enrollMemberFace("ana", form("photo"));

    expect(result).toMatchObject({ status: "ok", enrolledByName: "Staff Member" });
    expect(tencent.enrollFacePerson).toHaveBeenCalledTimes(1);
    const [personId, image] = tencent.enrollFacePerson.mock.calls[0] as unknown as [string, Uint8Array];
    expect(personId).toBe("ana");
    expect([...image]).toEqual([...JPEG]);

    const [row] = await faces();
    expect(row.memberId).toBe("ana");
    expect(row.enrolledBy).toBe("staff");
    expect([...row.photo]).toEqual([...JPEG]);

    const [entry] = await entries();
    expect(entry).toMatchObject({
      action: "member.face_enroll",
      entity: "member",
      entityId: "ana",
      actorId: "staff",
      summary: "Enrolled Ana Santos’s face for check-in",
      before: null,
    });
    // When and by whom — never the face itself.
    expect(Object.keys(entry.after as object).sort()).toEqual(["enrolledAt", "enrolledBy"]);
    expect(JSON.stringify(entry)).not.toContain("photo");
  });

  it("replaces an earlier photo and says so", async () => {
    await enrollMemberFace("ana", form("photo"));
    const replacement = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 9, 9]);
    await enrollMemberFace("ana", form("photo", replacement));

    const rows = await faces();
    expect(rows).toHaveLength(1);
    expect([...rows[0].photo]).toEqual([...replacement]);
    const summaries = (await entries()).map((e) => e.summary).sort();
    expect(summaries).toEqual([
      "Enrolled Ana Santos’s face for check-in",
      "Replaced Ana Santos’s face for check-in",
    ]);
  });

  it("keeps nothing when Tencent refuses the photo", async () => {
    tencent.enrollFacePerson.mockImplementation(async () => {
      throw new TencentFaceError("FailedOperation.FaceQualityNotQualified", "poor");
    });
    expect(await enrollMemberFace("ana", form("photo"))).toEqual({
      status: "error",
      message: "The face is too dark, blurred or turned away. Face the camera in good light.",
    });
    expect(await faces()).toHaveLength(0);
    expect(await entries()).toHaveLength(0);
  });

  it("refuses anything that is not a JPEG before calling Tencent", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(await enrollMemberFace("ana", form("photo", png))).toEqual({
      status: "error",
      message: "The photo must be a JPEG.",
    });
    expect(tencent.enrollFacePerson).not.toHaveBeenCalled();
  });

  it("is refused while face recognition is not configured", async () => {
    tencent.isFaceConfigured.mockImplementation(() => false);
    expect(await enrollMemberFace("ana", form("photo"))).toMatchObject({ status: "error" });
    expect(tencent.enrollFacePerson).not.toHaveBeenCalled();
  });

  it("needs members.update", async () => {
    signedInAs(["members.view", "attendance.record"]);
    await expect(enrollMemberFace("ana", form("photo"))).rejects.toThrow("permission");
    expect(tencent.enrollFacePerson).not.toHaveBeenCalled();
  });
});

describe("removal", () => {
  it("removes the face from Tencent and the record, with an audit entry", async () => {
    await enrollMemberFace("ana", form("photo"));
    expect(await removeMemberFace("ana")).toEqual({ status: "ok" });

    expect(tencent.removeFacePerson).toHaveBeenCalledWith("ana");
    expect(await faces()).toHaveLength(0);
    const removal = (await entries()).find((e) => e.action === "member.face_remove");
    expect(removal).toMatchObject({
      entityId: "ana",
      summary: "Removed Ana Santos’s face from check-in",
      after: null,
    });
  });

  it("records nothing when there was nothing to remove", async () => {
    expect(await removeMemberFace("ana")).toEqual({ status: "ok" });
    expect(await entries()).toHaveLength(0);
  });

  it("takes a deleted member's face out of Tencent after the delete", async () => {
    await enrollMemberFace("ana", form("photo"));
    tencent.removeFacePerson.mockClear();
    await deleteMember("ana");

    expect(await faces()).toHaveLength(0);
    expect(tencent.removeFacePerson).toHaveBeenCalledWith("ana");
  });

  it("leaves Tencent alone when a member without a face is deleted", async () => {
    await deleteMember("ruth");
    expect(tencent.removeFacePerson).not.toHaveBeenCalled();
  });
});

describe("check-in by face", () => {
  const scan = () => checkInByFace("sunday", form("frame"));
  const attended = () => database.db.select().from(attendance);

  it("checks in a confident match, and reports a second scan as a duplicate", async () => {
    tencent.searchFace.mockImplementation(async () => ({ personId: "ana", score: 97.5 }));

    const first = await scan();
    const second = await scan();

    expect(first).toMatchObject({
      status: "checked_in",
      score: 97.5,
      checkIn: { status: "ok", memberId: "ana", memberName: "Ana Santos" },
    });
    expect(second).toMatchObject({ status: "checked_in", checkIn: { status: "duplicate" } });
    const rows = await attended();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ memberId: "ana", recordedBy: "staff" });
  });

  it("asks before checking in a likely match, and records nothing yet", async () => {
    tencent.searchFace.mockImplementation(async () => ({ personId: "ruth", score: 84 }));
    expect(await scan()).toEqual({
      status: "confirm",
      memberId: "ruth",
      memberName: "Ruth Villanueva",
      memberStatus: "inactive",
      score: 84,
    });
    expect(await attended()).toHaveLength(0);
  });

  it("treats a weak match, no match, or a deleted member as a stranger", async () => {
    tencent.searchFace.mockImplementation(async () => ({ personId: "ana", score: 79 }));
    expect(await scan()).toEqual({ status: "no_match" });
    tencent.searchFace.mockImplementation(async () => null);
    expect(await scan()).toEqual({ status: "no_match" });
    tencent.searchFace.mockImplementation(async () => ({ personId: "gone", score: 99 }));
    expect(await scan()).toEqual({ status: "no_match" });
    expect(await attended()).toHaveLength(0);
  });

  it("stays quiet about an empty frame and explains a poor one", async () => {
    tencent.searchFace.mockImplementation(async () => {
      throw new TencentFaceError("InvalidParameterValue.NoFaceInPhoto", "none");
    });
    expect(await scan()).toEqual({ status: "no_face" });

    tencent.searchFace.mockImplementation(async () => {
      throw new TencentFaceError("InvalidParameterValue.FaceSizeTooSmall", "small");
    });
    expect(await scan()).toEqual({
      status: "problem",
      kind: "photo",
      message: "The face is too small. Step closer to the camera.",
    });
  });

  it("needs attendance.record, and stores no frame", async () => {
    tencent.searchFace.mockImplementation(async () => ({ personId: "ana", score: 97.5 }));
    await scan();
    expect(await faces()).toHaveLength(0);

    signedInAs(["attendance.view"]);
    await expect(scan()).rejects.toThrow("permission");
  });
});

it("reads who enrolled a face even after their account is gone", async () => {
  await enrollMemberFace("ana", form("photo"));
  await database.db.delete(users).where(eq(users.id, "staff"));
  const [row] = await faces();
  expect(row.enrolledBy).toBeNull();
});
