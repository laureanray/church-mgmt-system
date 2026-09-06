"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
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

  // Session-scoped client, not the admin one: this updates whoever is signed
  // in, which is exactly the guarantee we want for a self-service change.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      errors: { password: error.message },
      message: "Could not update the password.",
    };
  }

  // Clear the gate only after Supabase accepted the new password, so a
  // rejected change cannot let someone slip past /change-password.
  await db
    .update(users)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  redirect("/dashboard");
}
