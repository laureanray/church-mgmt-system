"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth-helpers";
import { isServiceError } from "@/server/errors";
import * as facesService from "@/server/faces";
import * as membersService from "@/server/members";

/*
 * The web adapter for server/members.ts. The rules live in the service; this
 * file only translates between it and the browser — FormData in, form state or
 * a redirect out, and the revalidation the web app's routes need.
 *
 * `requirePermission` here is for the redirect to /no-access. The service
 * authorizes again, and that is the check the HTTP API relies on.
 */

export type MemberFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

const MEMBER_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "birthdate",
  "spiritualBirthday",
  "memberSinceYear",
  "gender",
  "maritalStatus",
  "status",
  "spouseName",
  "weddingAnniversary",
  "contactNumber",
  "homeAddress",
  "motherName",
  "fatherName",
  "educationalLevel",
  "occupation",
  "cellGroupId",
] as const;

function readMemberForm(formData: FormData) {
  return Object.fromEntries(
    MEMBER_FIELDS.map((field) => [field, formData.get(field)]),
  );
}

/** A validation failure becomes form state; anything else is rethrown. */
function toFormState(error: unknown): MemberFormState {
  if (isServiceError(error) && error.code === "invalid") {
    return { errors: error.fields, message: error.message };
  }
  if (isServiceError(error) && error.code === "not_found") notFound();
  throw error;
}

/**
 * Members carry `cellGroupId`, so any member mutation can change a cell roster,
 * the graph, and the unassigned count on /cell-groups. Revalidate the cell
 * routes a mutation touched — both sides of a move, hence the varargs.
 */
function revalidateCellGroups(...cellGroupIds: (string | null | undefined)[]) {
  revalidatePath("/cell-groups");
  for (const cellGroupId of new Set(cellGroupIds.filter(Boolean))) {
    revalidatePath(`/cell-groups/${cellGroupId}`);
  }
}

export async function createMember(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const user = await requirePermission("members.create");

  let member;
  try {
    member = await membersService.createMember(user, readMemberForm(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/members");
  // The dashboard's Active Members tile counts on status.
  revalidatePath("/dashboard");
  revalidateCellGroups(member.cellGroupId);
  redirect(`/members/${member.id}`);
}

export async function updateMember(
  id: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const user = await requirePermission("members.update");

  let result;
  try {
    result = await membersService.updateMember(
      user,
      id,
      readMemberForm(formData),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  // The dashboard's Active Members tile counts on status.
  revalidatePath("/dashboard");
  // The previous group differs from the new one when the member was moved.
  revalidateCellGroups(result.previousCellGroupId, result.member.cellGroupId);
  redirect(`/members/${id}`);
}

export async function deleteMember(id: string) {
  const user = await requirePermission("members.delete");

  let cellGroupId: string | null = null;
  try {
    ({ cellGroupId } = await membersService.deleteMember(user, id));
  } catch (error) {
    // Already gone — a double click, or someone else got there first.
    if (!isServiceError(error) || error.code !== "not_found") throw error;
  }

  revalidatePath("/members");
  // The dashboard's Active Members tile counts on status.
  revalidatePath("/dashboard");
  revalidateCellGroups(cellGroupId);
  redirect("/members");
}

export type ReactivateResult =
  | { status: "ok" }
  | { status: "error"; message: string };

/** See `reactivateMember` in server/members.ts for the rule. */
export async function reactivateMember(
  memberId: string,
): Promise<ReactivateResult> {
  const user = await requirePermission("members.update");

  try {
    await membersService.reactivateMember(user, memberId);
  } catch (error) {
    if (isServiceError(error) && error.code === "conflict") {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/dashboard");
  return { status: "ok" };
}

export type FaceEnrollResult =
  | { status: "ok"; enrolledAt: string; enrolledByName: string | null }
  | { status: "error"; message: string };

export type FaceRemoveResult = { status: "ok" } | { status: "error"; message: string };

/** A refused photo or an unreachable Tencent becomes a message; the rest rethrows. */
function toFaceError(error: unknown): { status: "error"; message: string } {
  if (
    isServiceError(error) &&
    (error.code === "invalid" ||
      error.code === "unavailable" ||
      error.code === "not_found")
  ) {
    return { status: "error", message: error.message };
  }
  throw error;
}

/**
 * Enrol the photo in `formData` ("photo", a JPEG the browser has already
 * scaled down) as the member's face for check-in.
 */
export async function enrollMemberFace(
  memberId: string,
  formData: FormData,
): Promise<FaceEnrollResult> {
  const user = await requirePermission("members.update");

  const file = formData.get("photo");
  const photo =
    file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null;

  let enrollment;
  try {
    enrollment = await facesService.enrollMemberFace(user, memberId, photo);
  } catch (error) {
    return toFaceError(error);
  }

  revalidatePath(`/members/${memberId}`);
  return {
    status: "ok",
    enrolledAt: enrollment.enrolledAt.toISOString(),
    enrolledByName: enrollment.enrolledByName,
  };
}

export async function removeMemberFace(
  memberId: string,
): Promise<FaceRemoveResult> {
  const user = await requirePermission("members.update");
  try {
    await facesService.removeMemberFace(user, memberId);
  } catch (error) {
    return toFaceError(error);
  }
  revalidatePath(`/members/${memberId}`);
  return { status: "ok" };
}
