"use server";

import { and, eq, ilike, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import { recordAudit, type DbExecutor } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission } from "@/lib/auth-helpers";
import { delegatedEdit, grantRefusal, sameGrants } from "@/lib/delegation";
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

const OWN_ROLE =
  "You cannot change the permissions of your own role. Ask another authorized staff member.";

/** A role with its permission keys, sorted so a reorder is not a change. */
async function roleSnapshot(tx: DbExecutor, id: string) {
  const role = await tx.query.roles.findFirst({ where: eq(roles.id, id) });
  if (!role) return null;
  const granted = await tx
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, id));
  return { ...role, permissions: granted.map(({ key }) => key).sort() };
}

export async function createRole(
  _previous: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("roles.create");
  const parsed = roleSchema.safeParse(roleValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, description } = parsed.data;
  const { permissions, refused } = delegatedEdit({
    held: actor.permissions,
    before: [],
    submitted: parsed.data.permissions,
  });
  if (refused.length) return { message: grantRefusal(refused) };

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
    await recordAudit(tx, {
      actorId: actor.id,
      action: "role.create",
      entity: "role",
      entityId: role.id,
      after: await roleSnapshot(tx, role.id),
      summary: `Created role ${name}`,
    });
  });

  revalidatePath("/roles");
  redirect("/roles");
}

export async function updateRole(
  id: string,
  _previous: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("roles.update");
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
  const { name, description } = parsed.data;
  const duplicate = await db.query.roles.findFirst({
    where: and(ilike(roles.name, name), ne(roles.id, id)),
  });
  if (duplicate) return { errors: { name: "That role name is already in use." } };

  // Read the current grants inside the transaction that replaces them, so the
  // permissions this actor may not touch are carried over from what is saved
  // at that moment rather than from an earlier read.
  const refusal = await db.transaction(async (tx) => {
    const before = await roleSnapshot(tx, id);
    if (!before) return null;

    const edit = delegatedEdit({
      held: actor.permissions,
      before: before.permissions,
      submitted: parsed.data.permissions,
    });
    if (edit.refused.length) return grantRefusal(edit.refused);
    // A role's permissions are the access of everyone in it, so changing your
    // own is the same self-escalation as changing your own role.
    if (id === actor.role.id && !sameGrants(before.permissions, edit.permissions)) {
      return OWN_ROLE;
    }

    await tx
      .update(roles)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(roles.id, id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (edit.permissions.length) {
      await tx.insert(rolePermissions).values(
        edit.permissions.map((permissionKey) => ({ roleId: id, permissionKey })),
      );
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "role.update",
      entity: "role",
      entityId: id,
      before,
      after: await roleSnapshot(tx, id),
      summary: (fields) => `Edited role ${name}: ${describeFields(fields)}`,
    });
    return null;
  });
  if (refusal) return { message: refusal };

  revalidatePath("/roles");
  revalidatePath("/users");
  redirect("/roles");
}

export async function deleteRole(id: string) {
  const actor = await requirePermission("roles.delete");
  const role = await roleSnapshot(db, id);
  if (!role || role.isSystem) return;

  const assigned = await db.query.users.findFirst({
    where: eq(users.roleId, id),
    columns: { id: true },
  });
  if (assigned) return;

  await db.transaction(async (tx) => {
    await tx.delete(roles).where(eq(roles.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      action: "role.delete",
      entity: "role",
      entityId: id,
      before: role,
      summary: `Deleted role ${role.name}`,
    });
  });
  revalidatePath("/roles");
  revalidatePath("/users");
}
