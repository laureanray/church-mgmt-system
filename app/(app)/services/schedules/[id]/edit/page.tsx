import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { updateSchedule } from "../../actions";
import { db } from "@/db";
import { serviceSchedules } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { ScheduleForm } from "@/components/services/schedule-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "leader"]);
  const { id } = await params;

  const schedule = await db.query.serviceSchedules.findFirst({
    where: eq(serviceSchedules.id, id),
  });
  if (!schedule) notFound();

  const action = updateSchedule.bind(null, schedule.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/services"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to services
      </Link>
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
