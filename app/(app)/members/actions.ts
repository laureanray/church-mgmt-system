"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { fieldErrors, memberSchema } from "@/lib/validators";

export type MemberFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function readMemberForm(formData: FormData) {
  return memberSchema.safeParse({
    firstName: formData.get("firstName"),
    middleName: formData.get("middleName"),
    lastName: formData.get("lastName"),
    birthdate: formData.get("birthdate"),
    spiritualBirthday: formData.get("spiritualBirthday"),
    memberSinceYear: formData.get("memberSinceYear"),
    gender: formData.get("gender"),
    maritalStatus: formData.get("maritalStatus"),
    spouseName: formData.get("spouseName"),
    weddingAnniversary: formData.get("weddingAnniversary"),
    contactNumber: formData.get("contactNumber"),
    homeAddress: formData.get("homeAddress"),
    motherName: formData.get("motherName"),
    fatherName: formData.get("fatherName"),
    educationalLevel: formData.get("educationalLevel"),
    occupation: formData.get("occupation"),
    cellGroupId: formData.get("cellGroupId"),
  });
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
  await requireRole(["admin", "leader"]);

  const parsed = readMemberForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const [row] = await db
    .insert(members)
    .values({ qrToken: nanoid(16), ...parsed.data })
    .returning({ id: members.id });

  revalidatePath("/members");
  revalidateCellGroups(parsed.data.cellGroupId);
  redirect(`/members/${row.id}`);
}

export async function updateMember(
  id: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  await requireRole(["admin", "leader"]);

  const parsed = readMemberForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const previous = await db.query.members.findFirst({
    where: eq(members.id, id),
    columns: { cellGroupId: true },
  });

  const [updated] = await db
    .update(members)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(members.id, id))
    .returning({ cellGroupId: members.cellGroupId });

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  // `previous` may differ from the new value when the member was moved.
  revalidateCellGroups(previous?.cellGroupId, updated?.cellGroupId);
  redirect(`/members/${id}`);
}

export async function deleteMember(id: string) {
  await requireRole(["admin", "leader"]);
  const [deleted] = await db
    .delete(members)
    .where(eq(members.id, id))
    .returning({ cellGroupId: members.cellGroupId });
  revalidatePath("/members");
  revalidateCellGroups(deleted?.cellGroupId);
  redirect("/members");
}
