"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { attendance, members } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { extractToken } from "@/lib/qr";

export type ScanResult =
  | { status: "ok"; memberId: string; memberName: string; at: string }
  | { status: "duplicate"; memberId: string; memberName: string; at: string }
  | { status: "not_found"; token: string }
  | { status: "error"; message: string };

/**
 * Records attendance for the member whose QR token was scanned, against the
 * given service. Idempotent per (member, service) thanks to the unique index.
 */
export async function recordAttendance(
  serviceId: string,
  scannedText: string,
): Promise<ScanResult> {
  const user = await requireUser();

  if (!serviceId) {
    return { status: "error", message: "No service selected." };
  }

  const token = extractToken(scannedText);
  if (!token) {
    return { status: "error", message: "The scanned code was empty." };
  }

  const member = await db.query.members.findFirst({
    where: eq(members.qrToken, token),
  });
  if (!member) {
    return { status: "not_found", token };
  }

  const inserted = await db
    .insert(attendance)
    .values({ memberId: member.id, serviceId, recordedBy: user.id })
    .onConflictDoNothing()
    .returning({ checkedInAt: attendance.checkedInAt });

  if (inserted.length === 0) {
    const existing = await db.query.attendance.findFirst({
      where: and(
        eq(attendance.memberId, member.id),
        eq(attendance.serviceId, serviceId),
      ),
    });
    return {
      status: "duplicate",
      memberId: member.id,
      memberName: member.fullName,
      at: (existing?.checkedInAt ?? new Date()).toISOString(),
    };
  }

  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/dashboard");

  return {
    status: "ok",
    memberId: member.id,
    memberName: member.fullName,
    at: inserted[0].checkedInAt.toISOString(),
  };
}
