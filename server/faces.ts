import "server-only";

import { count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { appSettings, memberFaces, members, users } from "@/db/schema";
import { recordAudit, type DbExecutor } from "@/lib/audit";
import type { MemberStatus } from "@/lib/constants";
import { isForeignKeyViolation } from "@/lib/db-errors";
import {
  consentGiven,
  effectiveConsentNotice,
  faceConsentNoticeSchema,
  isPurgeConfirmed,
} from "@/lib/face-consent";
import {
  FACE_IMAGE_MAX_BYTES,
  faceBand,
  faceProblem,
  isJpeg,
  type FaceProblemKind,
} from "@/lib/face-policy";
import {
  deleteFaceGroup,
  enrollFacePerson,
  isFaceConfigured,
  isTencentFaceError,
  removeFacePerson,
  searchFace,
} from "@/lib/tencent-face";

import { authorize, type Actor } from "./actor";
import { recordAttendanceForMember, type CheckIn } from "./attendance";
import { parseInput, ServiceError } from "./errors";

/**
 * Face check-in: enrolling a member's face, and recognising one at the door.
 *
 * Tencent holds the face; `member_faces` holds the local record of it (the
 * photo, when, by whom, and the member's consent). Every change calls Tencent
 * first and writes the row and its audit entry after, so a refused photo
 * leaves nothing behind locally.
 *
 * Consent (#21) is a condition of enrolment, checked here rather than trusted
 * to the form: no row means no consent yet, and enrolling needs it. Removing
 * the face removes the consent with it.
 *
 * Recognition ends in `recordAttendanceForMember`, like every other way of
 * identifying someone, so a face check-in and a name check-in report a
 * duplicate identically. Scan frames are never stored.
 */

const SETTINGS_ID = "singleton";

export type FaceEnrollment = {
  enrolledAt: Date;
  /** Null once the staff account that enrolled them has been deleted. */
  enrolledByName: string | null;
  consentAt: Date;
  /** Who recorded the member's consent; null once that account is deleted. */
  consentRecordedByName: string | null;
};

/** Whether this deployment has Tencent credentials and a face group. */
export function faceCheckInEnabled(): boolean {
  return isFaceConfigured();
}

function requireFace() {
  if (!isFaceConfigured()) {
    throw new ServiceError(
      "unavailable",
      "Face recognition is not set up on this deployment.",
    );
  }
}

/** Server actions pass the image straight from the browser; check it here. */
function readImage(image: unknown): Uint8Array {
  if (!(image instanceof Uint8Array) || image.length === 0) {
    throw new ServiceError("invalid", "No photo was received.");
  }
  if (image.length > FACE_IMAGE_MAX_BYTES) {
    throw new ServiceError("invalid", "The photo is too large.");
  }
  // The capture code always re-encodes to JPEG, and the photo is served back
  // as one, so anything else did not come from this app.
  if (!isJpeg(image)) {
    throw new ServiceError("invalid", "The photo must be a JPEG.");
  }
  return image;
}

/** A Tencent refusal, in the service's terms; anything else is rethrown. */
function fromTencent(error: unknown): never {
  if (isTencentFaceError(error)) {
    const problem = faceProblem(error.code);
    if (problem.kind === "no_face" || problem.kind === "photo") {
      throw new ServiceError("invalid", problem.message);
    }
    console.error("Tencent face recognition failed", error.code, error.requestId);
    throw new ServiceError("unavailable", problem.message);
  }
  throw error;
}

// ---------------------------------------------------------------------------
// The consent notice
// ---------------------------------------------------------------------------

/** The notice in force, as shown beside the consent checkbox. */
export async function getFaceConsentNotice(actor: Actor): Promise<string> {
  // Read on the member page (to enrol) and in Settings (to reword it).
  if (!actor.permissions.includes("settings.view")) authorize(actor, "members.view");
  return readConsentNotice();
}

async function readConsentNotice(): Promise<string> {
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, SETTINGS_ID),
    columns: { faceConsentNotice: true },
  });
  return effectiveConsentNotice(settings?.faceConsentNotice);
}

/** Reword the notice. Members already enrolled keep the wording they agreed to. */
export async function saveFaceConsentNotice(
  actor: Actor,
  input: unknown,
): Promise<string> {
  authorize(actor, "settings.update");
  const notice = parseInput(faceConsentNoticeSchema, input);

  await db.transaction(async (tx) => {
    const before = await tx.query.appSettings.findFirst({
      where: eq(appSettings.id, SETTINGS_ID),
      columns: { id: true, faceConsentNotice: true },
    });
    await tx
      .insert(appSettings)
      .values({ id: SETTINGS_ID, faceConsentNotice: notice, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { faceConsentNotice: notice, updatedAt: new Date() },
      });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "settings.update",
      entity: "settings",
      entityId: SETTINGS_ID,
      before: { faceConsentNotice: before?.faceConsentNotice ?? null },
      after: { faceConsentNotice: notice },
      summary: "Changed the face check-in consent notice",
    });
  });
  return notice;
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

const consentUsers = alias(users, "consent_users");

export async function getFaceEnrollment(
  actor: Actor,
  memberId: string,
): Promise<FaceEnrollment | null> {
  authorize(actor, "members.view");
  const [row] = await db
    .select({
      enrolledAt: memberFaces.enrolledAt,
      enrolledByName: users.name,
      consentAt: memberFaces.consentAt,
      consentRecordedByName: consentUsers.name,
    })
    .from(memberFaces)
    .leftJoin(users, eq(users.id, memberFaces.enrolledBy))
    .leftJoin(consentUsers, eq(consentUsers.id, memberFaces.consentRecordedBy))
    .where(eq(memberFaces.memberId, memberId));
  return row ?? null;
}

/** The enrolment photo, for the member page's preview. */
export async function getFacePhoto(
  actor: Actor,
  memberId: string,
): Promise<Buffer | null> {
  authorize(actor, "members.view");
  const [row] = await db
    .select({ photo: memberFaces.photo })
    .from(memberFaces)
    .where(eq(memberFaces.memberId, memberId));
  return row?.photo ?? null;
}

async function findMember(memberId: unknown) {
  if (typeof memberId !== "string" || !memberId) {
    throw new ServiceError("invalid", "No member selected.");
  }
  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    columns: { id: true, fullName: true, status: true },
  });
  if (!member) throw new ServiceError("not_found", "Member not found.");
  return member;
}

/**
 * Enrol `image` as the member's face, replacing any earlier one.
 *
 * A first enrolment needs `consent` — the member agreed to the notice, and
 * `actor` is recording it for them. A replacement keeps the consent already
 * on record; consent is per member, not per photo.
 */
export async function enrollMemberFace(
  actor: Actor,
  memberId: string,
  image: unknown,
  consent: unknown,
): Promise<FaceEnrollment> {
  authorize(actor, "members.update");
  const photo = readImage(image);
  requireFace();
  const member = await findMember(memberId);

  const [existing] = await db
    .select({ consentAt: memberFaces.consentAt })
    .from(memberFaces)
    .where(eq(memberFaces.memberId, member.id));
  if (!existing && !consentGiven(consent)) {
    throw new ServiceError(
      "invalid",
      `Record ${member.fullName}’s consent before enrolling their face.`,
    );
  }
  // Read now, before Tencent: the wording they were shown is the one stored.
  const notice = existing ? null : await readConsentNotice();

  try {
    await enrollFacePerson(member.id, photo);
  } catch (error) {
    fromTencent(error);
  }

  try {
    return await db.transaction(async (tx) => {
      const [previous] = await tx
        .select({
          enrolledAt: memberFaces.enrolledAt,
          enrolledBy: memberFaces.enrolledBy,
          consentAt: memberFaces.consentAt,
          consentRecordedBy: memberFaces.consentRecordedBy,
        })
        .from(memberFaces)
        .where(eq(memberFaces.memberId, member.id))
        .for("update");

      const now = new Date();
      const photoValues = {
        photo: Buffer.from(photo),
        enrolledAt: now,
        enrolledBy: actor.id,
      };
      // Consent comes from the row already there, or is recorded now. A row
      // removed since the check above means consent went with it; without a
      // fresh tick there is none to record.
      const consentValues = previous
        ? { consentAt: previous.consentAt, consentRecordedBy: previous.consentRecordedBy }
        : consentGiven(consent)
          ? { consentAt: now, consentRecordedBy: actor.id }
          : null;
      if (!consentValues) {
        throw new ServiceError(
          "invalid",
          `Record ${member.fullName}’s consent before enrolling their face.`,
        );
      }

      await tx
        .insert(memberFaces)
        .values({
          memberId: member.id,
          ...photoValues,
          ...consentValues,
          consentNotice: notice ?? (await readConsentNotice()),
        })
        .onConflictDoUpdate({ target: memberFaces.memberId, set: photoValues });

      // The photo stays out of the log: the entry records that it changed,
      // when, and the consent — never the face itself.
      await recordAudit(tx, {
        actorId: actor.id,
        action: "member.face_enroll",
        entity: "member",
        entityId: member.id,
        before: previous ?? null,
        after: { enrolledAt: now, enrolledBy: actor.id, ...consentValues },
        summary: previous
          ? `Replaced ${member.fullName}’s face for check-in`
          : `Enrolled ${member.fullName}’s face for check-in, with their consent`,
      });

      const [names] = await tx
        .select({ enrolledByName: users.name, consentRecordedByName: consentUsers.name })
        .from(memberFaces)
        .leftJoin(users, eq(users.id, memberFaces.enrolledBy))
        .leftJoin(consentUsers, eq(consentUsers.id, memberFaces.consentRecordedBy))
        .where(eq(memberFaces.memberId, member.id));
      return {
        enrolledAt: now,
        consentAt: consentValues.consentAt,
        enrolledByName: names?.enrolledByName ?? null,
        consentRecordedByName: names?.consentRecordedByName ?? null,
      };
    });
  } catch (error) {
    // Deleted while Tencent was enrolling them, or consent withdrawn in the
    // meantime: take the face back out, so Tencent holds nobody this app has
    // no consented record of.
    if (isForeignKeyViolation(error)) {
      await removeFacePerson(member.id).catch(() => {});
      throw new ServiceError("not_found", "Member not found.");
    }
    if (error instanceof ServiceError) {
      await removeFacePerson(member.id).catch(() => {});
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// A face for a member being created (server/new-members.ts)
// ---------------------------------------------------------------------------

/** A face Tencent has accepted for a member whose row is not written yet. */
export type PreparedFace = {
  memberId: string;
  photo: Uint8Array;
  notice: string;
};

/**
 * Enrol a face with Tencent under a freshly generated member id, before the
 * member exists: a refused photo then fails the whole form, and nothing is
 * created. Errors carry `fields.facePhoto` / `fields.faceConsent`, so a form
 * can show them beside the photo. Follow with `recordNewMemberFace` inside
 * the transaction that inserts the member, or `abandonPreparedFace` if that
 * transaction fails.
 */
export async function prepareNewMemberFace(
  actor: Actor,
  image: unknown,
  consent: unknown,
): Promise<PreparedFace> {
  authorize(actor, "members.update");
  if (!consentGiven(consent)) {
    const message = "Record their consent before adding a photo of their face.";
    throw new ServiceError("invalid", message, { faceConsent: message });
  }
  let photo: Uint8Array;
  try {
    photo = readImage(image);
  } catch (error) {
    if (error instanceof ServiceError) {
      throw new ServiceError("invalid", error.message, { facePhoto: error.message });
    }
    throw error;
  }
  requireFace();

  const memberId = crypto.randomUUID();
  const notice = await readConsentNotice();
  try {
    await enrollFacePerson(memberId, photo);
  } catch (error) {
    try {
      fromTencent(error);
    } catch (refusal) {
      if (refusal instanceof ServiceError && refusal.code === "invalid") {
        throw new ServiceError("invalid", refusal.message, { facePhoto: refusal.message });
      }
      throw refusal;
    }
  }
  return { memberId, photo, notice };
}

/** Write the face row and its audit entry, once the member row exists in `tx`. */
export async function recordNewMemberFace(
  tx: DbExecutor,
  actor: Actor,
  member: { id: string; fullName: string },
  face: PreparedFace,
): Promise<void> {
  const now = new Date();
  const values = {
    enrolledAt: now,
    enrolledBy: actor.id,
    consentAt: now,
    consentRecordedBy: actor.id,
  };
  await tx.insert(memberFaces).values({
    memberId: member.id,
    photo: Buffer.from(face.photo),
    consentNotice: face.notice,
    ...values,
  });
  await recordAudit(tx, {
    actorId: actor.id,
    action: "member.face_enroll",
    entity: "member",
    entityId: member.id,
    after: values,
    summary: `Enrolled ${member.fullName}’s face for check-in, with their consent`,
  });
}

/** The member was never created: take the face back out of Tencent. */
export async function abandonPreparedFace(face: PreparedFace): Promise<void> {
  await removeFacePerson(face.memberId).catch((error) => {
    console.error("Could not remove an abandoned face from Tencent", face.memberId, error);
  });
}

/**
 * Remove the member's face from Tencent, then the photo and consent here.
 * Idempotent: each step accepts that it already happened, so a retry after a
 * half-finished attempt completes it.
 */
export async function removeMemberFace(
  actor: Actor,
  memberId: string,
): Promise<void> {
  authorize(actor, "members.update");
  requireFace();
  const member = await findMember(memberId);

  try {
    await removeFacePerson(member.id);
  } catch (error) {
    fromTencent(error);
  }

  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(memberFaces)
      .where(eq(memberFaces.memberId, member.id))
      .returning({
        enrolledAt: memberFaces.enrolledAt,
        enrolledBy: memberFaces.enrolledBy,
        consentAt: memberFaces.consentAt,
        consentRecordedBy: memberFaces.consentRecordedBy,
      });
    // Nothing was enrolled — a double click. Nothing to record either.
    if (!removed) return;
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.face_remove",
      entity: "member",
      entityId: member.id,
      before: removed,
      summary: `Removed ${member.fullName}’s face and consent from check-in`,
    });
  });
}

/**
 * Before a member is deleted: take their face out of Tencent, so the deletion
 * cannot leave a face behind. Throws `unavailable` when Tencent cannot be
 * reached, and the deletion should wait — unless face recognition is not
 * configured at all, when there is no Tencent to reach and nothing to wait for.
 */
export async function forgetMemberFaceBeforeDelete(memberId: string): Promise<void> {
  const [face] = await db
    .select({ memberId: memberFaces.memberId })
    .from(memberFaces)
    .where(eq(memberFaces.memberId, memberId));
  if (!face) return;
  if (!isFaceConfigured()) {
    console.error(
      "Deleting a member with an enrolled face while face recognition is not configured; their face may remain in Tencent",
      memberId,
    );
    return;
  }
  try {
    await removeFacePerson(memberId);
  } catch (error) {
    if (!isTencentFaceError(error)) throw error;
    console.error("Could not remove a member's face from Tencent", error.code, error.requestId);
    throw new ServiceError(
      "unavailable",
      "Their face could not be removed from face recognition, so the member was not deleted. Try again in a moment.",
    );
  }
}

/** How many members are enrolled, for Settings. */
export async function countEnrolledFaces(actor: Actor): Promise<number> {
  authorize(actor, "settings.view");
  const [row] = await db.select({ faces: count() }).from(memberFaces);
  return row?.faces ?? 0;
}

/**
 * Delete every face: Tencent's whole group, then every photo and consent
 * here. For a church that stops using face check-in. `confirmation` must be
 * FACE_PURGE_CONFIRMATION, typed out — checked here, not only in the dialog.
 */
export async function purgeAllFaceData(
  actor: Actor,
  confirmation: unknown,
): Promise<{ removed: number }> {
  authorize(actor, "settings.update");
  if (!isPurgeConfirmed(confirmation)) {
    throw new ServiceError("invalid", "Type the confirmation phrase exactly to purge.");
  }
  requireFace();

  try {
    await deleteFaceGroup();
  } catch (error) {
    fromTencent(error);
  }

  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(memberFaces)
      .returning({ memberId: memberFaces.memberId });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "settings.face_purge",
      entity: "settings",
      entityId: SETTINGS_ID,
      before: { enrolledFaces: removed.length },
      after: { enrolledFaces: 0 },
      summary: `Purged all face data (${removed.length} ${removed.length === 1 ? "member" : "members"})`,
    });
    return { removed: removed.length };
  });
}

// ---------------------------------------------------------------------------
// Recognition
// ---------------------------------------------------------------------------

export type FaceIdentification =
  /** Recognised with confidence, and checked in (or already was). */
  | { status: "checked_in"; checkIn: CheckIn; score: number }
  /** Probably this member: the usher confirms before anything is recorded. */
  | {
      status: "confirm";
      memberId: string;
      memberName: string;
      memberStatus: MemberStatus;
      score: number;
    }
  /** A face, but nobody enrolled looks enough like it. */
  | { status: "no_match" }
  /** Nobody in the frame. The scan loop says nothing. */
  | { status: "no_face" }
  /** Tencent would not look, or could not; `message` says what to do. */
  | { status: "problem"; kind: Exclude<FaceProblemKind, "no_face">; message: string };

/**
 * Who is in `image`, and — when the match is strong enough — check them in to
 * `serviceId`. See FACE_AUTO_CHECK_IN_SCORE in lib/face-policy.ts for the bands.
 */
export async function identifyFace(
  actor: Actor,
  serviceId: string,
  image: unknown,
): Promise<FaceIdentification> {
  authorize(actor, "attendance.record");
  if (typeof serviceId !== "string" || !serviceId) {
    throw new ServiceError("invalid", "No service selected.");
  }
  const frame = readImage(image);
  requireFace();

  let match;
  try {
    match = await searchFace(frame);
  } catch (error) {
    if (!isTencentFaceError(error)) throw error;
    const problem = faceProblem(error.code);
    if (problem.kind === "no_face") return { status: "no_face" };
    if (problem.kind !== "photo") {
      console.error("Tencent face search failed", error.code, error.requestId);
    }
    return { status: "problem", kind: problem.kind, message: problem.message };
  }
  if (!match) return { status: "no_match" };

  const band = faceBand(match.score);
  if (band === "none") return { status: "no_match" };

  const member = await db.query.members.findFirst({
    where: eq(members.id, match.personId),
    columns: { id: true, fullName: true, status: true },
  });
  // A face left behind by a member deleted since: nobody to check in.
  if (!member) return { status: "no_match" };

  if (band === "confirm") {
    return {
      status: "confirm",
      memberId: member.id,
      memberName: member.fullName,
      memberStatus: member.status,
      score: match.score,
    };
  }

  const checkIn = await recordAttendanceForMember(actor, serviceId, member.id);
  return { status: "checked_in", checkIn, score: match.score };
}
