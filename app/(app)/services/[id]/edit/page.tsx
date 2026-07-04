import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { updateService } from "../../actions";
import { db } from "@/db";
import { services } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { ServiceForm } from "@/components/services/service-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "leader"]);
  const { id } = await params;

  const service = await db.query.services.findFirst({
    where: eq(services.id, id),
  });
  if (!service) notFound();

  const action = updateService.bind(null, service.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/services/${service.id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to service
      </Link>
      <PageHeader
        title="Edit Service"
        description={`Update ${service.name}.`}
      />
      <ServiceForm
        action={action}
        service={service}
        submitLabel="Save changes"
      />
    </div>
  );
}
