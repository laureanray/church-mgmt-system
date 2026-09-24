"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { members } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission } from "@/lib/auth-helpers";
import { isLapsed, MEMBER_STATUS_LABELS } from "@/lib/constants";
import { fieldErrors, memberSchema } from "@/lib/validators";

export type MemberFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function readMemberForm(formData: FormData) {
  return memberSchema.safeParse({
    firstName: formData.get("firstName"),
    middleName: formData.get("middleName"),
    lastName: formData.get("lastName"),
    birthdate: formData.get("birthdate"),
    spiritualBirthday: formData.get("spiritualBirthday"),
    memberSinceYear: formData.get("memberSinceYear"),
    gender: formData.get("gender"),
    maritalStatus: formData.get("maritalStatus"),
    status: formData.get("status"),
    spouseName: formData.get("spouseName"),
    weddingAnniversary: formData.get("weddingAnniversary"),
    contactNumber: formData.get("contactNumber"),
    homeAddress: formData.get("homeAddress"),
    motherName: formData.get("motherName"),
    fatherName: formData.get("fatherName"),
    educationalLevel: formData.get("educationalLevel"),
    occupation: formData.get("occupation"),
    cellGroupId: formData.get("cellGroupId"),
  });
}

/**
 * Members carry `cellGroupId`, so any member mutation can change a cell roster,
 * the graph, and the unassigned count on /cell-groups. Revalidate the cell
 * routes a mutation touched — both sides of a move, hence the varargs.
 */
function revalidateCellGroups(...cellGroupIds: (string | null | undefined)[]) {
  revalidatePath("/cell-groups");
  for (const cellGroupId of new Set(cellGroupIds.filter(Boolean))) {
    revalidatePath(`/cell-groups/${cellGroupId}`);
  }
}

export async function createMember(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const actor = await requirePermission("members.create");

  const parsed = readMemberForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const row = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(members)
      .values({ qrToken: nanoid(16), ...parsed.data })
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.create",
      entity: "member",
      entityId: row.id,
      after: row,
      summary: `Added ${row.fullName}`,
    });
    return row;
  });

  revalidatePath("/members");
  // The dashboard's Active Members tile counts on status.
  revalidatePath("/dashboard");
  revalidateCellGroups(parsed.data.cellGroupId);
  redirect(`/members/${row.id}`);
}

export async function updateMember(
  id: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const actor = await requirePermission("members.update");

  const parsed = readMemberForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { previous, updated } = await db.transaction(async (tx) => {
    // Locked so the "before" in the log is the row this update replaced, not
    // one a concurrent edit has already moved on from.
    const [previous] = await tx
      .select()
      .from(members)
      .where(eq(members.id, id))
      .for("update");
    if (!previous) return { previous: undefined, updated: undefined };

    const [updated] = await tx
      .update(members)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(members.id, id))
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action:
        previous.status === updated.status
          ? "member.update"
          : "member.status_change",
      entity: "member",
      entityId: id,
      before: previous,
      after: updated,
      summary: (fields) => `Edited ${updated.fullName}: ${describeFields(fields)}`,
    });
    return { previous, updated };
  });

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  // The dashboard's Active Members tile counts on status.
  revalidatePath("/dashboard");
  // `previous` may differ from the new value when the member was moved.
  revalidateCellGroups(previous?.cellGroupId, updated?.cellGroupId);
  redirect(`/members/${id}`);
}

export async function deleteMember(id: string) {
  const actor = await requirePermission("members.delete");
  const deleted = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(members)
      .where(eq(members.id, id))
      .returning();
    if (deleted) {
      await recordAudit(tx, {
        actorId: actor.id,
        action: "member.delete",
        entity: "member",
        entityId: id,
        before: deleted,
        summary: `Deleted ${deleted.fullName}`,
      });
    }
    return deleted;
  });
  revalidatePath("/members");
  // The dashboard's Active Members tile counts on status.
  revalidatePath("/dashboard");
  revalidateCellGroups(deleted?.cellGroupId);
  redirect("/members");
}

export type ReactivateResult =
  | { status: "ok" }
  | { status: "error"; message: string };

/**
 * Mark a lapsed member active again — what check-in offers when someone who
 * had stopped attending walks back in. Only a lapsed status is replaced, so a
 * stale prompt cannot flip a member someone has since edited.
 */
export async function reactivateMember(
  memberId: string,
): Promise<ReactivateResult> {
  const actor = await requirePermission("members.update");

  const updated = await db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(members)
      .where(eq(members.id, memberId))
      .for("update");
    if (!previous || !isLapsed(previous.status)) return null;

    const [updated] = await tx
      .update(members)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(members.id, memberId))
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.status_change",
      entity: "member",
      entityId: memberId,
      before: previous,
      after: updated,
      summary: `Marked ${updated.fullName} active at check-in (was ${MEMBER_STATUS_LABELS[previous.status].toLowerCase()})`,
    });
    return updated;
  });

  if (!updated) {
    return {
      status: "error",
      message: "This member’s status has already changed.",
    };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/dashboard");
  return { status: "ok" };
}
