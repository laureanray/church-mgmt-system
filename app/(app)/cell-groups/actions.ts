"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
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

export async function createCellGroup(
  _prev: CellGroupFormState,
  formData: FormData,
): Promise<CellGroupFormState> {
  await requirePermission("cell_groups.create");

  const parsed = readForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const [row] = await db
    .insert(cellGroups)
    .values(parsed.data)
    .returning({ id: cellGroups.id });

  // Keep the leader inside the cell they lead so they are never "unassigned".
  if (parsed.data.leaderId) {
    await db
      .update(members)
      .set({ cellGroupId: row.id, updatedAt: new Date() })
      .where(eq(members.id, parsed.data.leaderId));
  }

  revalidatePath("/cell-groups");
  revalidatePath("/members");
  redirect(`/cell-groups/${row.id}`);
}

export async function updateCellGroup(
  id: string,
  _prev: CellGroupFormState,
  formData: FormData,
): Promise<CellGroupFormState> {
  await requirePermission("cell_groups.update");

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

  await db
    .update(cellGroups)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(cellGroups.id, id));

  if (parsed.data.leaderId) {
    await db
      .update(members)
      .set({ cellGroupId: id, updatedAt: new Date() })
      .where(eq(members.id, parsed.data.leaderId));
  }

  revalidatePath("/cell-groups");
  revalidatePath(`/cell-groups/${id}`);
  revalidatePath("/members");
  redirect(`/cell-groups/${id}`);
}

export async function deleteCellGroup(id: string) {
  await requirePermission("cell_groups.delete");
  // Postgres would fire the ON DELETE SET NULL cascades on its own, but doing
  // it explicitly also bumps updatedAt on the rows we touch — members become
  // unassigned, child cells become roots. Harmless alongside the cascade.
  await db
    .update(members)
    .set({ cellGroupId: null, updatedAt: new Date() })
    .where(eq(members.cellGroupId, id));
  await db
    .update(cellGroups)
    .set({ parentCellGroupId: null, updatedAt: new Date() })
    .where(eq(cellGroups.parentCellGroupId, id));
  await db.delete(cellGroups).where(eq(cellGroups.id, id));
  revalidatePath("/cell-groups");
  revalidatePath("/members");
  redirect("/cell-groups");
}

export async function assignMemberToCellGroup(formData: FormData) {
  await requirePermission("cell_groups.update");
  const parsed = assignSchema.safeParse({
    memberId: formData.get("memberId"),
    cellGroupId: formData.get("cellGroupId"),
  });
  if (!parsed.success) return;

  await db
    .update(members)
    .set({ cellGroupId: parsed.data.cellGroupId, updatedAt: new Date() })
    .where(eq(members.id, parsed.data.memberId));

  revalidatePath("/cell-groups");
  revalidatePath(`/members/${parsed.data.memberId}`);
}

export async function promoteMemberToLeader(formData: FormData) {
  await requirePermission("cell_groups.update");

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

  const [row] = await db
    .insert(cellGroups)
    .values({ name, leaderId: memberId, parentCellGroupId })
    .returning({ id: cellGroups.id });

  // The new leader now belongs to the cell they lead.
  await db
    .update(members)
    .set({ cellGroupId: row.id, updatedAt: new Date() })
    .where(eq(members.id, memberId));

  revalidatePath("/cell-groups");
  revalidatePath(`/members/${memberId}`);
  redirect(`/cell-groups/${row.id}`);
}
