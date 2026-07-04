import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createSchedule } from "../actions";
import { requireRole } from "@/lib/auth-helpers";
import { ScheduleForm } from "@/components/services/schedule-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NewSchedulePage() {
  await requireRole(["admin", "leader"]);

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
        title="New Recurring Schedule"
        description="Set a weekly service. Upcoming dates are generated automatically."
      />
      <ScheduleForm action={createSchedule} submitLabel="Create schedule" />
    </div>
  );
}
