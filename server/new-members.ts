import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { memberSchema } from "@/lib/validators";

import { authorize, type Actor } from "./actor";
import { recordAttendanceForMember, type CheckIn } from "./attendance";
import { parseInput, ServiceError } from "./errors";
import {
  abandonPreparedFace,
  prepareNewMemberFace,
  recordNewMemberFace,
} from "./faces";
import { insertMember, type Member } from "./members";

/**
 * Creating a member together with their face, and adding a first-time
 * visitor at the door. Both write the member through `insertMember`, so they
 * are created and audited exactly as the plain form does.
 *
 * The face goes to Tencent first, under the id the member is about to get:
 * a photo Tencent refuses fails the whole request and nothing is created. If
 * the member insert fails after that, the face is taken back out.
 */

type FaceInput = { photo: unknown; consent: unknown };

/** Whether the form carried a photo at all; without one there is no face step. */
export function hasFacePhoto(photo: unknown): boolean {
  return photo instanceof Uint8Array && photo.length > 0;
}

async function createWithOptionalFace(
  actor: Actor,
  data: z.output<typeof memberSchema>,
  face: FaceInput | null,
): Promise<Member> {
  if (!face || !hasFacePhoto(face.photo)) {
    return db.transaction((tx) => insertMember(tx, actor, data));
  }
  const prepared = await prepareNewMemberFace(actor, face.photo, face.consent);
  try {
    return await db.transaction(async (tx) => {
      const member = await insertMember(tx, actor, data, prepared.memberId);
      await recordNewMemberFace(tx, actor, member, prepared);
      return member;
    });
  } catch (error) {
    await abandonPreparedFace(prepared);
    throw error;
  }
}

/** The member form, with an optional photo of their face (and their consent). */
export async function createMemberWithFace(
  actor: Actor,
  input: unknown,
  face: FaceInput | null,
): Promise<Member> {
  authorize(actor, "members.create");
  // Validated before Tencent sees anything, so a form error costs no call.
  const data = parseInput(memberSchema, input);
  return createWithOptionalFace(actor, data, face);
}

const visitorSchema = z.object({
  firstName: z.unknown(),
  lastName: z.unknown(),
  contactNumber: z.unknown(),
});

/**
 * A first-time visitor at the door: create them as a `visitor` and check them
 * in to `serviceId`, with their face if they agreed to one. The check-in is
 * separate from the creation, so a visitor created for a service deleted in
 * the meantime still exists — the error says so, and name search finds them.
 */
export async function addVisitorAndCheckIn(
  actor: Actor,
  serviceId: string,
  input: unknown,
  face: FaceInput | null,
): Promise<{ member: Member; checkIn: CheckIn }> {
  authorize(actor, "members.create");
  authorize(actor, "attendance.record");
  // Checked before anyone is created: a visitor with nothing to check in to
  // is a duplicate waiting to happen.
  if (typeof serviceId !== "string" || !serviceId) {
    throw new ServiceError("invalid", "Select a service first.");
  }
  const fields = parseInput(visitorSchema, input);
  const data = parseInput(memberSchema, { ...fields, status: "visitor" });

  const member = await createWithOptionalFace(actor, data, face);
  const checkIn = await recordAttendanceForMember(actor, serviceId, member.id);
  return { member, checkIn };
}
