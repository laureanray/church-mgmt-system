"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { recordAudit, type DbExecutor } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission } from "@/lib/auth-helpers";
import { wouldCreateCycle } from "@/lib/cell-graph";
import {
  assignSchema,
  cellGroupSchema,
  fieldErrors,
  promoteSchema,
} from "@/lib/validators";

export type CellGroupFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function readForm(formData: FormData) {
  return cellGroupSchema.safeParse({
    name: formData.get("name"),
    leaderId: formData.get("leaderId"),
    parentCellGroupId: formData.get("parentCellGroupId"),
    meetingDay: formData.get("meetingDay"),
    meetingTime: formData.get("meetingTime"),
    meetingLocation: formData.get("meetingLocation"),
    notes: formData.get("notes"),
    active: formData.get("active"),
  });
}

/**
 * Move a member into a cell and log the move. Every path that changes
 * `members.cell_group_id` goes through here, so the member's History tab shows
 * each one. A member already in that cell logs nothing.
 */
async function moveMember(
  tx: DbExecutor,
  actorId: string,
  memberId: string,
  cellGroupId: string | null,
) {
  const [previous] = await tx
    .select({
      fullName: members.fullName,
      cellGroupId: members.cellGroupId,
    })
    .from(members)
    .where(eq(members.id, memberId))
    .for("update");
  if (!previous) return;

  await tx
    .update(members)
    .set({ cellGroupId, updatedAt: new Date() })
    .where(eq(members.id, memberId));

  const target = cellGroupId
    ? await tx.query.cellGroups.findFirst({
        where: eq(cellGroups.id, cellGroupId),
        columns: { name: true },
      })
    : undefined;
  await recordAudit(tx, {
    actorId,
    action: "member.cell_group_change",
    entity: "member",
    entityId: memberId,
    before: { cellGroupId: previous.cellGroupId },
    after: { cellGroupId },
    summary: target
      ? `Moved ${previous.fullName} into ${target.name}`
      : `Removed ${previous.fullName} from their cell group`,
  });
}

export async function createCellGroup(
  _prev: CellGroupFormState,
  formData: FormData,
): Promise<CellGroupFormState> {
  const actor = await requirePermission("cell_groups.create");

  const parsed = readForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const row = await db.transaction(async (tx) => {
    const [row] = await tx.insert(cellGroups).values(parsed.data).returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "cell_group.create",
      entity: "cell_group",
      entityId: row.id,
      after: row,
      summary: `Created cell group ${row.name}`,
    });

    // Keep the leader inside the cell they lead so they are never "unassigned".
    if (parsed.data.leaderId) {
      await moveMember(tx, actor.id, parsed.data.leaderId, row.id);
    }
    return row;
  });

  revalidatePath("/cell-groups");
  revalidatePath("/members");
  redirect(`/cell-groups/${row.id}`);
}

export async function updateCellGroup(
  id: string,
  _prev: CellGroupFormState,
  formData: FormData,
): Promise<CellGroupFormState> {
  const actor = await requirePermission("cell_groups.update");

  const parsed = readForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  // Reject a parent choice that would create a cycle.
  if (parsed.data.parentCellGroupId) {
    const all = await db
      .select({
        id: cellGroups.id,
        leaderId: cellGroups.leaderId,
        parentCellGroupId: cellGroups.parentCellGroupId,
      })
      .from(cellGroups);
    if (wouldCreateCycle(id, parsed.data.parentCellGroupId, all)) {
      return {
        errors: {
          parentCellGroupId: "That would make the cell its own ancestor.",
        },
        message: "Please pick a different parent cell group.",
      };
    }
  }

  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(cellGroups)
      .where(eq(cellGroups.id, id))
      .for("update");
    if (!previous) return;

    const [updated] = await tx
      .update(cellGroups)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(cellGroups.id, id))
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "cell_group.update",
      entity: "cell_group",
      entityId: id,
      before: previous,
      after: updated,
      summary: (fields) => `Edited cell group ${updated.name}: ${describeFields(fields)}`,
    });

    if (parsed.data.leaderId) {
      await moveMember(tx, actor.id, parsed.data.leaderId, id);
    }
  });

  revalidatePath("/cell-groups");
  revalidatePath(`/cell-groups/${id}`);
  revalidatePath("/members");
  redirect(`/cell-groups/${id}`);
}

export async function deleteCellGroup(id: string) {
  const actor = await requirePermission("cell_groups.delete");
  await db.transaction(async (tx) => {
    // Postgres would fire the ON DELETE SET NULL cascades on its own, but doing
    // it explicitly also bumps updatedAt on the rows we touch — members become
    // unassigned, child cells become roots. Harmless alongside the cascade.
    const unassigned = await tx
      .update(members)
      .set({ cellGroupId: null, updatedAt: new Date() })
      .where(eq(members.cellGroupId, id))
      .returning({ id: members.id });
    await tx
      .update(cellGroups)
      .set({ parentCellGroupId: null, updatedAt: new Date() })
      .where(eq(cellGroups.parentCellGroupId, id));
    const [deleted] = await tx
      .delete(cellGroups)
      .where(eq(cellGroups.id, id))
      .returning();
    if (!deleted) return;

    // One entry for the cell rather than one per member: the member ids ride
    // along in `before`, so who was unassigned is still on record.
    await recordAudit(tx, {
      actorId: actor.id,
      action: "cell_group.delete",
      entity: "cell_group",
      entityId: id,
      before: { ...deleted, memberIds: unassigned.map((m) => m.id) },
      summary: `Deleted cell group ${deleted.name} (${unassigned.length} member${unassigned.length === 1 ? "" : "s"} unassigned)`,
    });
  });
  revalidatePath("/cell-groups");
  revalidatePath("/members");
  redirect("/cell-groups");
}

export async function assignMemberToCellGroup(formData: FormData) {
  const actor = await requirePermission("cell_groups.update");
  const parsed = assignSchema.safeParse({
    memberId: formData.get("memberId"),
    cellGroupId: formData.get("cellGroupId"),
  });
  if (!parsed.success) return;

  await db.transaction((tx) =>
    moveMember(tx, actor.id, parsed.data.memberId, parsed.data.cellGroupId),
  );

  revalidatePath("/cell-groups");
  revalidatePath(`/members/${parsed.data.memberId}`);
}

export async function promoteMemberToLeader(formData: FormData) {
  const actor = await requirePermission("cell_groups.update");

  const parsed = promoteSchema.safeParse({
    memberId: formData.get("memberId"),
    name: formData.get("name"),
    parentCellGroupId: formData.get("parentCellGroupId"),
  });
  if (!parsed.success) return;
  const { memberId, name, parentCellGroupId } = parsed.data;

  // A member leads at most one cell. Promoting an existing leader would create a
  // second cell with the same leaderId and then move their single cellGroupId to
  // it, leaving the first cell led by someone who is no longer one of its
  // members. The UI hides this form for existing leaders; this covers the rest.
  const alreadyLeads = await db.query.cellGroups.findFirst({
    where: eq(cellGroups.leaderId, memberId),
    columns: { id: true },
  });
  if (alreadyLeads) {
    redirect(`/cell-groups/${alreadyLeads.id}`);
  }

  const row = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(cellGroups)
      .values({ name, leaderId: memberId, parentCellGroupId })
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "cell_group.create",
      entity: "cell_group",
      entityId: row.id,
      after: row,
      summary: `Created cell group ${row.name}`,
    });

    // The new leader now belongs to the cell they lead.
    await moveMember(tx, actor.id, memberId, row.id);
    return row;
  });

  revalidatePath("/cell-groups");
  revalidatePath(`/members/${memberId}`);
  redirect(`/cell-groups/${row.id}`);
}
