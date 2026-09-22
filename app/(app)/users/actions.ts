"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserSchema, editUserSchema, fieldErrors } from "@/lib/validators";

export type CreateUserState =
  | {
      ok?: boolean;
      email?: string;
      tempPassword?: string;
      errors?: Record<string, string>;
      message?: string;
    }
  | undefined;

export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requirePermission("users.create");

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, email, roleId } = parsed.data;

  const assignedRole = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
  });
  if (!assignedRole) {
    return { errors: { roleId: "Select an available role." } };
  }

  const taken = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (taken) {
    return { errors: { email: "That email is already in use." } };
  }

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();

  // Supabase owns the credential, so it has to be created first — we need the
  // id it assigns as the profile's primary key.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    // No mail server is configured for staff onboarding; the admin hands over
    // the temporary password directly, so skip the confirmation round trip.
    email_confirm: true,
  });

  if (error || !data.user) {
    return {
      errors: { email: error?.message ?? "Could not create the account." },
    };
  }

  try {
    await db.insert(users).values({
      id: data.user.id,
      name,
      email,
      roleId,
      mustChangePassword: true,
    });
  } catch (err) {
    // Roll the auth user back, otherwise it lingers with no profile and its
    // owner can sign in but gets bounced by requireUser().
    await admin.auth.admin.deleteUser(data.user.id);
    throw err;
  }

  revalidatePath("/users");
  return { ok: true, email, tempPassword };
}

export type EditUserState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

export async function updateUser(
  id: string,
  _prev: EditUserState,
  formData: FormData,
): Promise<EditUserState> {
  const currentUser = await requirePermission("users.update");

  const parsed = editUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, email, roleId } = parsed.data;

  const assignedRole = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
  });
  if (!assignedRole) {
    return { errors: { roleId: "Select an available role." } };
  }

  const clash = await db.query.users.findFirst({
    where: and(eq(users.email, email), ne(users.id, id)),
  });
  if (clash) {
    return { errors: { email: "That email is already in use." } };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { email: true, roleId: true },
  });

  if (existing && id === currentUser.id && existing.roleId !== roleId) {
    return {
      errors: { roleId: "You cannot change your own role." },
      message: "Ask another authorized staff member to change your role.",
    };
  }

  // Email is the login identity, so a change has to reach Supabase too, or the
  // staff member would keep signing in with the old address.
  if (existing && existing.email !== email) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });
    if (error) {
      return { errors: { email: error.message } };
    }
  }

  await db
    .update(users)
    .set({ name, email, roleId, updatedAt: new Date() })
    .where(eq(users.id, id));

  revalidatePath("/users");
  redirect("/users");
}

export type ResetPasswordState =
  | { email: string; tempPassword: string }
  | undefined;

export async function resetUserPassword(
  id: string,
  _prev: ResetPasswordState,
): Promise<ResetPasswordState> {
  await requirePermission("users.reset_password");

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(id, {
    password: tempPassword,
  });
  if (error) {
    throw new Error(`Could not reset the password: ${error.message}`);
  }

  const [updated] = await db
    .update(users)
    .set({ mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ email: users.email });

  revalidatePath("/users");
  return { email: updated.email, tempPassword };
}

export async function deleteUser(currentUserId: string, id: string) {
  await requirePermission("users.delete");
  if (id === currentUserId) {
    // Guard against locking yourself out.
    return;
  }

  // Delete the credential first: a profile with no auth user is merely orphaned
  // data, while an auth user with no profile is an account that can still sign
  // in. requireUser() rejects the latter, but leaving one around is worse.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    throw new Error(`Could not delete the account: ${error.message}`);
  }

  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/users");
}
