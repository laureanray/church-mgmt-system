import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateSchedule } from "../../actions";
import { db } from "@/db";
import { serviceSchedules } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { ScheduleForm } from "@/components/services/schedule-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("services.update");
  const { id } = await params;

  const schedule = await db.query.serviceSchedules.findFirst({
    where: eq(serviceSchedules.id, id),
  });
  if (!schedule) notFound();

  const action = updateSchedule.bind(null, schedule.id);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/services" label="Back to services" />
      <PageHeader
        title="Edit Schedule"
        description={`Update ${schedule.name}. Future un-attended occurrences will be rebuilt.`}
      />
      <ScheduleForm
        action={action}
        schedule={schedule}
        submitLabel="Save changes"
      />
    </div>
  );
}
