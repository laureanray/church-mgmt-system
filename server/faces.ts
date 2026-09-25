import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { memberFaces, members, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { MemberStatus } from "@/lib/constants";
import { isForeignKeyViolation } from "@/lib/db-errors";
import {
  FACE_IMAGE_MAX_BYTES,
  faceBand,
  faceProblem,
  isJpeg,
  type FaceProblemKind,
} from "@/lib/face-policy";
import {
  enrollFacePerson,
  isFaceConfigured,
  isTencentFaceError,
  removeFacePerson,
  searchFace,
} from "@/lib/tencent-face";

import { authorize, type Actor } from "./actor";
import { recordAttendanceForMember, type CheckIn } from "./attendance";
import { ServiceError } from "./errors";

/**
 * Face check-in: enrolling a member's face, and recognising one at the door.
 *
 * Tencent holds the face; `member_faces` holds the local record of it (the
 * photo, when, by whom). Every change calls Tencent first and writes the row
 * and its audit entry after, so a refused photo leaves nothing behind locally.
 *
 * Recognition ends in `recordAttendanceForMember`, like every other way of
 * identifying someone, so a face check-in and a name check-in report a
 * duplicate identically. Scan frames are never stored.
 */

export type FaceEnrollment = {
  enrolledAt: Date;
  /** Null once the staff account that enrolled them has been deleted. */
  enrolledByName: string | null;
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

export async function getFaceEnrollment(
  actor: Actor,
  memberId: string,
): Promise<FaceEnrollment | null> {
  authorize(actor, "members.view");
  const [row] = await db
    .select({ enrolledAt: memberFaces.enrolledAt, enrolledByName: users.name })
    .from(memberFaces)
    .leftJoin(users, eq(users.id, memberFaces.enrolledBy))
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

/** Enrol `image` as the member's face, replacing any earlier one. */
export async function enrollMemberFace(
  actor: Actor,
  memberId: string,
  image: unknown,
): Promise<FaceEnrollment> {
  authorize(actor, "members.update");
  const photo = readImage(image);
  requireFace();
  const member = await findMember(memberId);

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
        })
        .from(memberFaces)
        .where(eq(memberFaces.memberId, member.id))
        .for("update");

      const enrolledAt = new Date();
      const values = {
        photo: Buffer.from(photo),
        enrolledAt,
        enrolledBy: actor.id,
      };
      await tx
        .insert(memberFaces)
        .values({ memberId: member.id, ...values })
        .onConflictDoUpdate({ target: memberFaces.memberId, set: values });

      // The photo stays out of the log: the entry records that it changed,
      // and when, never the face itself.
      await recordAudit(tx, {
        actorId: actor.id,
        action: "member.face_enroll",
        entity: "member",
        entityId: member.id,
        before: previous ?? null,
        after: { enrolledAt, enrolledBy: actor.id },
        summary: previous
          ? `Replaced ${member.fullName}’s face for check-in`
          : `Enrolled ${member.fullName}’s face for check-in`,
      });

      const [enrolledBy] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, actor.id));
      return { enrolledAt, enrolledByName: enrolledBy?.name ?? null };
    });
  } catch (error) {
    // Deleted while Tencent was enrolling them: take the face back out, so
    // Tencent holds nobody this app has no record of.
    if (isForeignKeyViolation(error)) {
      await removeFacePerson(member.id).catch(() => {});
      throw new ServiceError("not_found", "Member not found.");
    }
    throw error;
  }
}

/** Remove the member's face from Tencent and the local record. */
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
      });
    // Nothing was enrolled — a double click. Nothing to record either.
    if (!removed) return;
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.face_remove",
      entity: "member",
      entityId: member.id,
      before: removed,
      summary: `Removed ${member.fullName}’s face from check-in`,
    });
  });
}

/**
 * After a member is deleted (the row cascades with them), take their face out
 * of Tencent too. Best effort: the deletion has already committed, and a
 * leftover face matches nobody, since recognition ignores unknown members.
 */
export async function forgetDeletedMemberFace(memberId: string): Promise<void> {
  if (!isFaceConfigured()) return;
  try {
    await removeFacePerson(memberId);
  } catch (error) {
    console.error("Could not remove a deleted member's face from Tencent", error);
  }
}

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
