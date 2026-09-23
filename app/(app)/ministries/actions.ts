"use server";

import { and, eq, ilike, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  members,
  ministries,
  ministryMembers,
  ministryPermissions,
} from "@/db/schema";
import { requirePermission, requireUser } from "@/lib/auth-helpers";
import { canManageRoster } from "@/lib/ministry-access";
import type { MinistryPosition } from "@/lib/constants";
import {
  fieldErrors,
  ministrySchema,
  rosterAddSchema,
  rosterPositionSchema,
} from "@/lib/validators";

export type MinistryFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

export type RosterFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function ministryValues(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active"),
    permissions: formData.getAll("permissions"),
  };
}

function revalidateMinistry(id?: string) {
  revalidatePath("/ministries");
  if (id) revalidatePath(`/ministries/${id}`);
}

export async function createMinistry(
  _previous: MinistryFormState,
  formData: FormData,
): Promise<MinistryFormState> {
  await requirePermission("ministries.create");
  const parsed = ministrySchema.safeParse(ministryValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, description, active, permissions } = parsed.data;
  const duplicate = await db.query.ministries.findFirst({
    where: ilike(ministries.name, name),
  });
  if (duplicate) {
    return { errors: { name: "That ministry name is already in use." } };
  }

  const id = await db.transaction(async (tx) => {
    const [ministry] = await tx
      .insert(ministries)
      .values({ name, description, active })
      .returning({ id: ministries.id });
    if (permissions.length) {
      await tx.insert(ministryPermissions).values(
        permissions.map((permissionKey) => ({
          ministryId: ministry.id,
          permissionKey,
        })),
      );
    }
    return ministry.id;
  });

  revalidateMinistry();
  redirect(`/ministries/${id}`);
}

export async function updateMinistry(
  id: string,
  _previous: MinistryFormState,
  formData: FormData,
): Promise<MinistryFormState> {
  await requirePermission("ministries.update");
  const parsed = ministrySchema.safeParse(ministryValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, description, active, permissions } = parsed.data;
  const duplicate = await db.query.ministries.findFirst({
    where: and(ilike(ministries.name, name), ne(ministries.id, id)),
  });
  if (duplicate) {
    return { errors: { name: "That ministry name is already in use." } };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ministries)
      .set({ name, description, active, updatedAt: new Date() })
      .where(eq(ministries.id, id));
    await tx
      .delete(ministryPermissions)
      .where(eq(ministryPermissions.ministryId, id));
    if (permissions.length) {
      await tx
        .insert(ministryPermissions)
        .values(permissions.map((permissionKey) => ({ ministryId: id, permissionKey })));
    }
  });

  revalidateMinistry(id);
  redirect(`/ministries/${id}`);
}

export async function deleteMinistry(id: string) {
  await requirePermission("ministries.delete");
  const ministry = await db.query.ministries.findFirst({
    where: eq(ministries.id, id),
    columns: { isSystem: true },
  });
  // Built-in ministries own a module; LAM's roster is who a line-up can list.
  if (!ministry || ministry.isSystem) return;

  await db.delete(ministries).where(eq(ministries.id, id));
  revalidateMinistry();
  redirect("/ministries");
}

/**
 * Roster changes are open to the ministry's own heads as well as to staff with
 * `ministries.update`, so they cannot use requirePermission alone.
 */
async function requireRosterManager(ministryId: string) {
  const user = await requireUser();
  if (!canManageRoster(user, ministryId)) redirect("/no-access");
  return user;
}

export async function addRosterMember(
  ministryId: string,
  _previous: RosterFormState,
  formData: FormData,
): Promise<RosterFormState> {
  await requireRosterManager(ministryId);
  const parsed = rosterAddSchema.safeParse({ memberId: formData.get("memberId") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const member = await db.query.members.findFirst({
    where: eq(members.id, parsed.data.memberId),
    columns: { id: true, fullName: true },
  });
  if (!member) return { errors: { memberId: "That member no longer exists." } };

  const added = await db
    .insert(ministryMembers)
    .values({ ministryId, memberId: member.id })
    .onConflictDoNothing()
    .returning({ memberId: ministryMembers.memberId });
  if (added.length === 0) {
    return { errors: { memberId: `${member.fullName} is already on this roster.` } };
  }

  revalidateMinistry(ministryId);
  revalidatePath(`/members/${member.id}`);
  return undefined;
}

export async function removeRosterMember(ministryId: string, memberId: string) {
  await requireRosterManager(ministryId);
  await db
    .delete(ministryMembers)
    .where(
      and(
        eq(ministryMembers.ministryId, ministryId),
        eq(ministryMembers.memberId, memberId),
      ),
    );
  revalidateMinistry(ministryId);
  revalidatePath(`/members/${memberId}`);
}

export async function setRosterPosition(
  ministryId: string,
  memberId: string,
  position: MinistryPosition,
) {
  // Appointing heads is not delegated to heads — see canAppointHeads.
  await requirePermission("ministries.update");
  // Bound arguments travel through the client, so they are parsed like input.
  const parsed = rosterPositionSchema.safeParse({ memberId, position });
  if (!parsed.success) return;

  await db
    .update(ministryMembers)
    .set({ position: parsed.data.position })
    .where(
      and(
        eq(ministryMembers.ministryId, ministryId),
        eq(ministryMembers.memberId, memberId),
      ),
    );
  revalidateMinistry(ministryId);
  revalidatePath(`/members/${memberId}`);
}
