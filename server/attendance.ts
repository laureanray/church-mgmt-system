import "server-only";

import { and, asc, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { attendance, cellGroups, members } from "@/db/schema";
import type { MemberStatus } from "@/lib/constants";
import { isForeignKeyViolation } from "@/lib/db-errors";

import { authorize, type Actor } from "./actor";
import { parseInput, ServiceError } from "./errors";

/**
 * Check-in: the one place a member is recorded against a service. Every way
 * of identifying someone at the door — a name typed by an usher, a face, a
 * QR code until it is retired — ends in `recordAttendanceForMember`, so the
 * (member, service) uniqueness rule and the duplicate report live here once.
 *
 * Check-ins are not audited: the attendance row carries `recordedBy` itself.
 */

export type CheckIn = {
  status: "ok" | "duplicate";
  memberId: string;
  memberName: string;
  /** Lets the check-in screen mark a lapsed member and offer to reactivate them. */
  memberStatus: MemberStatus;
  /** When they were checked in: now, or the original time for a duplicate. */
  at: string;
};

export async function recordAttendanceForMember(
  actor: Actor,
  serviceId: string,
  memberId: string,
): Promise<CheckIn> {
  authorize(actor, "attendance.record");
  // Server actions pass these straight from the browser, so the types are a
  // claim rather than a guarantee.
  if (typeof serviceId !== "string" || !serviceId) {
    throw new ServiceError("invalid", "No service selected.");
  }
  if (typeof memberId !== "string" || !memberId) {
    throw new ServiceError("invalid", "No member selected.");
  }

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    columns: { id: true, fullName: true, status: true },
  });
  if (!member) throw new ServiceError("not_found", "That member no longer exists.");

  let inserted: { checkedInAt: Date }[];
  try {
    inserted = await db
      .insert(attendance)
      .values({ memberId: member.id, serviceId, recordedBy: actor.id })
      .onConflictDoNothing()
      .returning({ checkedInAt: attendance.checkedInAt });
  } catch (error) {
    // The member was just read, so a missing parent row is almost always the
    // service; a member deleted in between lands here too. Nothing was written.
    if (isForeignKeyViolation(error)) {
      throw new ServiceError("not_found", "That service or member no longer exists.");
    }
    throw error;
  }

  const found = {
    memberId: member.id,
    memberName: member.fullName,
    memberStatus: member.status,
  };

  // An empty RETURNING after ON CONFLICT DO NOTHING is the duplicate: the
  // unique constraint decided it atomically, so two ushers checking in the
  // same person at once still produce one row.
  if (inserted.length === 0) {
    const existing = await db.query.attendance.findFirst({
      where: and(
        eq(attendance.memberId, member.id),
        eq(attendance.serviceId, serviceId),
      ),
      columns: { checkedInAt: true },
    });
    return {
      status: "duplicate",
      ...found,
      at: (existing?.checkedInAt ?? new Date()).toISOString(),
    };
  }

  return { status: "ok", ...found, at: inserted[0].checkedInAt.toISOString() };
}

/** Fewer characters than this match too much of the directory to be useful. */
export const CHECK_IN_SEARCH_MIN_LENGTH = 2;
export const CHECK_IN_SEARCH_LIMIT = 10;

const checkInSearchSchema = z
  .string()
  .trim()
  .min(CHECK_IN_SEARCH_MIN_LENGTH)
  .max(100);

export type CheckInCandidate = {
  id: string;
  fullName: string;
  status: MemberStatus;
  /** With the birth year, what tells two people with a common name apart. */
  cellGroupName: string | null;
  birthYear: number | null;
};

/** ILIKE treats these as wildcards; a name containing one means it literally. */
function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * Members whose name contains the query, for an usher picking someone at the
 * door. Every status is included: someone returning after a long absence is
 * exactly who this is for, and the screen flags them.
 */
export async function searchCheckInCandidates(
  actor: Actor,
  query: unknown,
): Promise<CheckInCandidate[]> {
  authorize(actor, "attendance.record");
  const text = parseInput(checkInSearchSchema, query);

  const rows = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      status: members.status,
      cellGroupName: cellGroups.name,
      birthdate: members.birthdate,
    })
    .from(members)
    .leftJoin(cellGroups, eq(cellGroups.id, members.cellGroupId))
    .where(ilike(members.fullName, `%${escapeLike(text)}%`))
    .orderBy(asc(members.fullName), asc(members.id))
    .limit(CHECK_IN_SEARCH_LIMIT);

  return rows.map(({ birthdate, ...row }) => ({
    ...row,
    birthYear: birthdate ? Number(birthdate.slice(0, 4)) : null,
  }));
}
