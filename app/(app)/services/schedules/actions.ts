"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { serviceSchedules } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import {
  deleteFutureEmptyOccurrences,
  generateForSchedule,
} from "@/lib/occurrences";
import { fieldErrors, scheduleSchema } from "@/lib/validators";

export type ScheduleFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function readScheduleForm(formData: FormData) {
  return scheduleSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    dayOfWeek: formData.get("dayOfWeek"),
    timeOfDay: formData.get("timeOfDay"),
    location: formData.get("location"),
    notes: formData.get("notes"),
  });
}

export async function createSchedule(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  await requireRole(["admin", "leader"]);

  const parsed = readScheduleForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const [schedule] = await db
    .insert(serviceSchedules)
    .values(parsed.data)
    .returning();

  // Populate the upcoming occurrences right away.
  await generateForSchedule(schedule);

  revalidatePath("/services");
  revalidatePath("/scan");
  redirect("/services");
}

export async function updateSchedule(
  id: string,
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  await requireRole(["admin", "leader"]);

  const parsed = readScheduleForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const [schedule] = await db
    .update(serviceSchedules)
    .set(parsed.data)
    .where(eq(serviceSchedules.id, id))
    .returning();

  // Day/time or name may have changed — rebuild future (un-attended) occurrences.
  await deleteFutureEmptyOccurrences(id);
  if (schedule.active) {
    await generateForSchedule(schedule);
  }

  revalidatePath("/services");
  revalidatePath("/scan");
  redirect("/services");
}

export async function toggleScheduleActive(id: string, active: boolean) {
  await requireRole(["admin", "leader"]);

  const [schedule] = await db
    .update(serviceSchedules)
    .set({ active })
    .where(eq(serviceSchedules.id, id))
    .returning();

  if (active && schedule) {
    await generateForSchedule(schedule);
  } else {
    // Pausing: drop future occurrences nobody has been scanned into.
    await deleteFutureEmptyOccurrences(id);
  }

  revalidatePath("/services");
  revalidatePath("/scan");
}

export async function deleteSchedule(id: string) {
  await requireRole(["admin", "leader"]);
  // FK is ON DELETE SET NULL — past occurrences become standalone services and
  // keep their attendance history.
  await db.delete(serviceSchedules).where(eq(serviceSchedules.id, id));

  revalidatePath("/services");
  revalidatePath("/scan");
  redirect("/services");
}
