"use server";

import { hash } from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/password";
import { createUserSchema, editUserSchema, fieldErrors } from "@/lib/validators";

export type CreateUserState =
  | {
      ok?: boolean;
      username?: string;
      tempPassword?: string;
      errors?: Record<string, string>;
      message?: string;
    }
  | undefined;

export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireRole(["admin"]);

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, username, email, role } = parsed.data;

  const takenUsername = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (takenUsername) {
    return { errors: { username: "That username is already taken." } };
  }
  if (email) {
    const takenEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (takenEmail) {
      return { errors: { email: "That email is already in use." } };
    }
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hash(tempPassword, 10);

  await db.insert(users).values({
    name,
    username,
    email,
    passwordHash,
    role,
    mustChangePassword: true,
  });

  revalidatePath("/users");
  return { ok: true, username, tempPassword };
}

export type EditUserState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

export async function updateUser(
  id: string,
  _prev: EditUserState,
  formData: FormData,
): Promise<EditUserState> {
  await requireRole(["admin"]);

  const parsed = editUserSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, username, email, role } = parsed.data;

  const clashUsername = await db.query.users.findFirst({
    where: and(eq(users.username, username), ne(users.id, id)),
  });
  if (clashUsername) {
    return { errors: { username: "That username is already taken." } };
  }
  if (email) {
    const clashEmail = await db.query.users.findFirst({
      where: and(eq(users.email, email), ne(users.id, id)),
    });
    if (clashEmail) {
      return { errors: { email: "That email is already in use." } };
    }
  }

  await db
    .update(users)
    .set({ name, username, email, role, updatedAt: new Date() })
    .where(eq(users.id, id));

  revalidatePath("/users");
  redirect("/users");
}

export type ResetPasswordState =
  | { username: string; tempPassword: string }
  | undefined;

export async function resetUserPassword(
  id: string,
  _prev: ResetPasswordState,
  _formData: FormData,
): Promise<ResetPasswordState> {
  await requireRole(["admin"]);

  const tempPassword = generateTempPassword();
  const passwordHash = await hash(tempPassword, 10);

  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ username: users.username });

  revalidatePath("/users");
  return { username: updated.username, tempPassword };
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
