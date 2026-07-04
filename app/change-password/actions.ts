"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { changePasswordSchema, fieldErrors } from "@/lib/validators";

export type ChangePasswordState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

export async function changeOwnPassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the fields below.",
    };
  }

  const passwordHash = await hash(parsed.data.password, 10);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  redirect("/dashboard");
}
