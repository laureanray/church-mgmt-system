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
    fullName: formData.get("fullName"),
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
  });
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

  await db
    .update(members)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(members.id, id));

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  redirect(`/members/${id}`);
}

export async function deleteMember(id: string) {
  await requireRole(["admin", "leader"]);
  await db.delete(members).where(eq(members.id, id));
  revalidatePath("/members");
  redirect("/members");
}
