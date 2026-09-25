"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { attendance, services } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth-helpers";
import { fieldErrors, serviceSchema } from "@/lib/validators";

export type ServiceFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function readServiceForm(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    scheduledAt: formData.get("scheduledAt"),
    location: formData.get("location"),
    notes: formData.get("notes"),
  });
}

export async function createService(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  await requirePermission("services.create");

  const parsed = readServiceForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const [row] = await db
    .insert(services)
    .values(parsed.data)
    .returning({ id: services.id });

  revalidatePath("/services");
  redirect(`/services/${row.id}`);
}

export async function updateService(
  id: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  await requirePermission("services.update");

  const parsed = readServiceForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  await db
    .update(services)
    .set(parsed.data)
    .where(eq(services.id, id));

  revalidatePath("/services");
  revalidatePath(`/services/${id}`);
  redirect(`/services/${id}`);
}

export async function deleteService(id: string) {
  const actor = await requirePermission("services.delete");
  await db.transaction(async (tx) => {
    // Deleting a service cascades to its attendance, which is the one way
    // attendance can be removed — so the count goes on record with it.
    const checkIns = await tx.$count(attendance, eq(attendance.serviceId, id));
    const [deleted] = await tx
      .delete(services)
      .where(eq(services.id, id))
      .returning();
    if (!deleted) return;
    await recordAudit(tx, {
      actorId: actor.id,
      action: "service.delete",
      entity: "service",
      entityId: id,
      before: { ...deleted, attendanceCount: checkIns },
      summary: `Deleted service ${deleted.name} and its ${checkIns} check-in${checkIns === 1 ? "" : "s"}`,
    });
  });
  revalidatePath("/services");
  redirect("/services");
}
