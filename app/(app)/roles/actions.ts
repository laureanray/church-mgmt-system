"use server";

import { and, eq, ilike, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { roleSchema, fieldErrors } from "@/lib/validators";

export type RoleFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function roleValues(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    permissions: formData.getAll("permissions"),
  };
}

export async function createRole(
  _previous: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  await requirePermission("roles.create");
  const parsed = roleSchema.safeParse(roleValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, description, permissions } = parsed.data;
  const duplicate = await db.query.roles.findFirst({
    where: ilike(roles.name, name),
  });
  if (duplicate) return { errors: { name: "That role name is already in use." } };

  await db.transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ name, description })
      .returning({ id: roles.id });
    if (permissions.length) {
      await tx.insert(rolePermissions).values(
        permissions.map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
        })),
      );
    }
  });

  revalidatePath("/roles");
  redirect("/roles");
}

export async function updateRole(
  id: string,
  _previous: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  await requirePermission("roles.update");
  if (id === "admin") {
    return { message: "The Admin role is protected and cannot be changed." };
  }

  const parsed = roleSchema.safeParse(roleValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }
  const { name, description, permissions } = parsed.data;
  const duplicate = await db.query.roles.findFirst({
    where: and(ilike(roles.name, name), ne(roles.id, id)),
  });
  if (duplicate) return { errors: { name: "That role name is already in use." } };

  await db.transaction(async (tx) => {
    await tx
      .update(roles)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(roles.id, id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (permissions.length) {
      await tx.insert(rolePermissions).values(
        permissions.map((permissionKey) => ({ roleId: id, permissionKey })),
      );
    }
  });

  revalidatePath("/roles");
  revalidatePath("/users");
  redirect("/roles");
}

export async function deleteRole(id: string) {
  await requirePermission("roles.delete");
  const role = await db.query.roles.findFirst({ where: eq(roles.id, id) });
  if (!role || role.isSystem) return;

  const assigned = await db.query.users.findFirst({
    where: eq(users.roleId, id),
    columns: { id: true },
  });
  if (assigned) return;

  await db.delete(roles).where(eq(roles.id, id));
  revalidatePath("/roles");
  revalidatePath("/users");
}
