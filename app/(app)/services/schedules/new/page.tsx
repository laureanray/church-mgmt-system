
import { createSchedule } from "../actions";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { ScheduleForm } from "@/components/services/schedule-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";

export default async function NewSchedulePage() {
  await requirePermission("services.create");

  return (
    <PageContainer width="form">
      <BackLink href="/services" label="Back to services" />
      <PageHeader
        title="New Recurring Schedule"
        description="Set a weekly service. Upcoming dates are generated automatically."
      />
      <ScheduleForm action={createSchedule} submitLabel="Create schedule" />
    </PageContainer>
  );
}
