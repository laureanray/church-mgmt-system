"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { fieldErrors, userSchema } from "@/lib/validators";

export type UserFormState =
  | { ok?: boolean; errors?: Record<string, string>; message?: string }
  | undefined;

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireRole(["admin"]);

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });
  if (existing) {
    return { errors: { email: "A user with this email already exists." } };
  }

  const passwordHash = await hash(parsed.data.password, 10);
  await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
    role: parsed.data.role,
  });

  revalidatePath("/users");
  return { ok: true };
}

export async function deleteUser(currentUserId: string, id: string) {
  await requireRole(["admin"]);

  if (id === currentUserId) {
    // Guard against locking yourself out.
    return;
  }

  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/users");
}
