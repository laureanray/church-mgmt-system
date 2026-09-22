
import { createSchedule } from "../actions";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { ScheduleForm } from "@/components/services/schedule-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function NewSchedulePage() {
  await requirePermission("services.create");

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/services" label="Back to services" />
      <PageHeader
        title="New Recurring Schedule"
        description="Set a weekly service. Upcoming dates are generated automatically."
      />
      <ScheduleForm action={createSchedule} submitLabel="Create schedule" />
    </div>
  );
}
