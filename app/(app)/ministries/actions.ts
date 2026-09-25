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
import { recordAudit, type DbExecutor } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission, requireUser } from "@/lib/auth-helpers";
import {
  delegatedEdit,
  describePermissions,
  grantRefusal,
  permissionsBeyond,
} from "@/lib/delegation";
import { canManageRoster, effectivePermissions } from "@/lib/ministry-access";
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
  const actor = await requirePermission("ministries.create");
  const parsed = ministrySchema.safeParse(ministryValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, description, active } = parsed.data;
  const { permissions, refused } = delegatedEdit({
    held: actor.permissions,
    before: [],
    submitted: parsed.data.permissions,
  });
  if (refused.length) return { message: grantRefusal(refused) };

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
      .returning();
    if (permissions.length) {
      await tx.insert(ministryPermissions).values(
        permissions.map((permissionKey) => ({
          ministryId: ministry.id,
          permissionKey,
        })),
      );
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "ministry.create",
      entity: "ministry",
      entityId: ministry.id,
      after: { ...ministry, permissions: [...permissions].sort() },
      summary: `Created ministry ${ministry.name}`,
    });
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
  const actor = await requirePermission("ministries.update");
  const parsed = ministrySchema.safeParse(ministryValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, description, active } = parsed.data;
  const duplicate = await db.query.ministries.findFirst({
    where: and(ilike(ministries.name, name), ne(ministries.id, id)),
  });
  if (duplicate) {
    return { errors: { name: "That ministry name is already in use." } };
  }

  const refusal = await db.transaction(async (tx) => {
    const before = await ministryWithGrants(tx, id);
    if (!before) return null;

    const { permissions, refused } = delegatedEdit({
      held: actor.permissions,
      before: before.permissions,
      submitted: parsed.data.permissions,
    });
    if (refused.length) return grantRefusal(refused);
    // An inactive ministry grants nothing, so switching one back on hands its
    // whole grant list to the roster at once.
    const restored = !before.active && active
      ? permissionsBeyond(actor.permissions, permissions)
      : [];
    if (restored.length) {
      return `Reactivating this ministry would restore access you do not hold: ${describePermissions(restored)}.`;
    }

    const [updated] = await tx
      .update(ministries)
      .set({ name, description, active, updatedAt: new Date() })
      .where(eq(ministries.id, id))
      .returning();
    if (!updated) return null;
    await tx
      .delete(ministryPermissions)
      .where(eq(ministryPermissions.ministryId, id));
    if (permissions.length) {
      await tx
        .insert(ministryPermissions)
        .values(permissions.map((permissionKey) => ({ ministryId: id, permissionKey })));
    }
    // The grants ride along as one field, so a change to what the ministry
    // grants reads in the log like any other edit.
    await recordAudit(tx, {
      actorId: actor.id,
      action: "ministry.update",
      entity: "ministry",
      entityId: id,
      before,
      after: { ...updated, permissions: [...permissions].sort() },
      summary: (fields) => `Edited ministry ${updated.name}: ${describeFields(fields)}`,
    });
    return null;
  });
  if (refusal) return { message: refusal };

  revalidateMinistry(id);
  redirect(`/ministries/${id}`);
}

export async function deleteMinistry(id: string) {
  const actor = await requirePermission("ministries.delete");
  const ministry = await db.query.ministries.findFirst({
    where: eq(ministries.id, id),
    columns: { isSystem: true },
  });
  // Built-in ministries own a module; LAM's roster is who a line-up can list.
  if (!ministry || ministry.isSystem) return;

  await db.transaction(async (tx) => {
    const before = await ministryWithGrants(tx, id);
    const rosterCount = await tx.$count(ministryMembers, eq(ministryMembers.ministryId, id));
    const [deleted] = await tx
      .delete(ministries)
      .where(and(eq(ministries.id, id), eq(ministries.isSystem, false)))
      .returning();
    if (!before || !deleted) return;
    await recordAudit(tx, {
      actorId: actor.id,
      action: "ministry.delete",
      entity: "ministry",
      entityId: id,
      before: { ...before, rosterCount },
      summary: `Deleted ministry ${deleted.name} and its roster of ${rosterCount}`,
    });
  });
  revalidateMinistry();
  redirect("/ministries");
}

/** A ministry row with its grants as a sorted list — how the log stores one. */
async function ministryWithGrants(executor: DbExecutor, id: string) {
  const ministry = await executor.query.ministries.findFirst({
    where: eq(ministries.id, id),
  });
  if (!ministry) return null;
  const grants = await executor
    .select({ key: ministryPermissions.permissionKey })
    .from(ministryPermissions)
    .where(eq(ministryPermissions.ministryId, id))
    .orderBy(ministryPermissions.permissionKey);
  return { ...ministry, permissions: grants.map((grant) => grant.key) };
}

/**
 * Records a roster change against the member, like a cell group move, so it
 * shows on their History tab: a roster place is part of what they may do.
 */
async function recordRosterChange(
  executor: DbExecutor,
  actorId: string,
  change: {
    ministryId: string;
    memberId: string;
    before: MinistryPosition | null;
    after: MinistryPosition | null;
  },
) {
  const [names] = await executor
    .select({ ministry: ministries.name, member: members.fullName })
    .from(ministries)
    .innerJoin(members, eq(members.id, change.memberId))
    .where(eq(ministries.id, change.ministryId));
  if (!names) return;

  const summary =
    change.before === null
      ? `Added ${names.member} to ${names.ministry}`
      : change.after === null
        ? `Removed ${names.member} from ${names.ministry}`
        : change.after === "head"
          ? `Made ${names.member} a head of ${names.ministry}`
          : `Made ${names.member} a member of ${names.ministry}, no longer a head`;
  await recordAudit(executor, {
    actorId,
    action: "member.ministry_change",
    entity: "member",
    entityId: change.memberId,
    before: { ministry: change.before && names.ministry, position: change.before },
    after: { ministry: change.after && names.ministry, position: change.after },
    summary,
  });
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
  const actor = await requireRosterManager(ministryId);
  const parsed = rosterAddSchema.safeParse({ memberId: formData.get("memberId") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const member = await db.query.members.findFirst({
    where: eq(members.id, parsed.data.memberId),
    columns: { id: true, fullName: true },
  });
  if (!member) return { errors: { memberId: "That member no longer exists." } };

  // Rostering your own member record hands you the ministry's grants, so it is
  // held to the same ceiling as granting them. Checked whether or not the
  // ministry is active: reactivating it later would hand them over all the same.
  if (member.id === actor.memberId) {
    const grants = await db
      .select({
        ministryId: ministryPermissions.ministryId,
        permissionKey: ministryPermissions.permissionKey,
      })
      .from(ministryPermissions)
      .where(eq(ministryPermissions.ministryId, ministryId));
    const beyond = permissionsBeyond(actor.permissions, effectivePermissions([], grants));
    if (beyond.length) {
      return {
        errors: {
          memberId: `You cannot add yourself: this ministry grants access you do not hold (${describePermissions(beyond)}).`,
        },
      };
    }
  }

  const added = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(ministryMembers)
      .values({ ministryId, memberId: member.id })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await recordRosterChange(tx, actor.id, {
        ministryId,
        memberId: member.id,
        before: null,
        after: row.position,
      });
    }
    return row;
  });
  if (!added) {
    return { errors: { memberId: `${member.fullName} is already on this roster.` } };
  }

  revalidateMinistry(ministryId);
  revalidatePath(`/members/${member.id}`);
  return undefined;
}

export async function removeRosterMember(ministryId: string, memberId: string) {
  const actor = await requireRosterManager(ministryId);
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(ministryMembers)
      .where(
        and(
          eq(ministryMembers.ministryId, ministryId),
          eq(ministryMembers.memberId, memberId),
        ),
      )
      .returning();
    if (!removed) return;
    await recordRosterChange(tx, actor.id, {
      ministryId,
      memberId,
      before: removed.position,
      after: null,
    });
  });
  revalidateMinistry(ministryId);
  revalidatePath(`/members/${memberId}`);
}

export async function setRosterPosition(
  ministryId: string,
  memberId: string,
  position: MinistryPosition,
) {
  // Appointing heads is not delegated to heads — see canAppointHeads.
  const actor = await requirePermission("ministries.update");
  // Bound arguments travel through the client, so they are parsed like input.
  const parsed = rosterPositionSchema.safeParse({ memberId, position });
  if (!parsed.success) return;

  await db.transaction(async (tx) => {
    const onRoster = and(
      eq(ministryMembers.ministryId, ministryId),
      eq(ministryMembers.memberId, memberId),
    );
    const [current] = await tx
      .select({ position: ministryMembers.position })
      .from(ministryMembers)
      .where(onRoster)
      .for("update");
    if (!current || current.position === parsed.data.position) return;
    await tx
      .update(ministryMembers)
      .set({ position: parsed.data.position })
      .where(onRoster);
    await recordRosterChange(tx, actor.id, {
      ministryId,
      memberId,
      before: current.position,
      after: parsed.data.position,
    });
  });
  revalidateMinistry(ministryId);
  revalidatePath(`/members/${memberId}`);
}
