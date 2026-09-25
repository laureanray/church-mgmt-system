"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { members } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import type { SessionUser } from "@/lib/session-user";
import { extractToken } from "@/lib/qr";
import * as attendanceService from "@/server/attendance";
import type { CheckIn, CheckInCandidate } from "@/server/attendance";
import { isServiceError } from "@/server/errors";

/*
 * The web adapter for server/attendance.ts: the check-in screen's actions.
 * Each way of identifying someone ends in the same service call, so a check-in
 * by name and one by QR code report duplicates identically.
 */

export type CheckInResult = CheckIn | { status: "error"; message: string };

export type ScanResult = CheckInResult | { status: "not_found"; token: string };

async function checkIn(
  user: SessionUser,
  serviceId: string,
  memberId: string,
): Promise<CheckInResult> {
  let result: CheckIn;
  try {
    result = await attendanceService.recordAttendanceForMember(
      user,
      serviceId,
      memberId,
    );
  } catch (error) {
    if (
      isServiceError(error) &&
      (error.code === "invalid" || error.code === "not_found")
    ) {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  if (result.status === "ok") {
    revalidatePath(`/services/${serviceId}`);
    revalidatePath("/dashboard");
  }
  return result;
}

/** Check in the member an usher picked by name. */
export async function checkInMember(
  serviceId: string,
  memberId: string,
): Promise<CheckInResult> {
  const user = await requirePermission("attendance.record");
  return checkIn(user, serviceId, memberId);
}

/**
 * Names for the check-in search. A query too short to search returns nothing
 * rather than an error: the box is mid-typing, not wrong.
 */
export async function searchMembersForCheckIn(
  query: string,
): Promise<CheckInCandidate[]> {
  const user = await requirePermission("attendance.record");
  try {
    return await attendanceService.searchCheckInCandidates(user, query);
  } catch (error) {
    if (isServiceError(error) && error.code === "invalid") return [];
    throw error;
  }
}

/**
 * Records attendance for the member whose QR token was scanned, against the
 * given service. Idempotent per (member, service) thanks to the unique index.
 */
export async function recordAttendance(
  serviceId: string,
  scannedText: string,
): Promise<ScanResult> {
  const user = await requirePermission("attendance.record");

  if (!serviceId) {
    return { status: "error", message: "No service selected." };
  }

  const token = extractToken(scannedText);
  if (!token) {
    return { status: "error", message: "The scanned code was empty." };
  }

  const member = await db.query.members.findFirst({
    where: eq(members.qrToken, token),
    columns: { id: true },
  });
  if (!member) {
    return { status: "not_found", token };
  }

  return checkIn(user, serviceId, member.id);
}
