import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createService } from "../actions";
import { requireRole } from "@/lib/auth-helpers";
import { ServiceForm } from "@/components/services/service-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NewServicePage() {
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
        title="Add Service"
        description="Create a service to record attendance against."
      />
      <ServiceForm action={createService} submitLabel="Create service" />
    </div>
  );
}
