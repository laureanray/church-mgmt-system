"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { services } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
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
  await requireRole(["admin", "leader"]);

  const parsed = readServiceForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { scheduledAt, ...rest } = parsed.data;
  const [row] = await db
    .insert(services)
    .values({ ...rest, scheduledAt: new Date(scheduledAt) })
    .returning({ id: services.id });

  revalidatePath("/services");
  redirect(`/services/${row.id}`);
}

export async function updateService(
  id: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  await requireRole(["admin", "leader"]);

  const parsed = readServiceForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { scheduledAt, ...rest } = parsed.data;
  await db
    .update(services)
    .set({ ...rest, scheduledAt: new Date(scheduledAt) })
    .where(eq(services.id, id));

  revalidatePath("/services");
  revalidatePath(`/services/${id}`);
  redirect(`/services/${id}`);
}

export async function deleteService(id: string) {
  await requireRole(["admin", "leader"]);
  await db.delete(services).where(eq(services.id, id));
  revalidatePath("/services");
  redirect("/services");
}
