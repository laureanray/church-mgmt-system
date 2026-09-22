import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateService } from "../../actions";
import { db } from "@/db";
import { services } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { ServiceForm } from "@/components/services/service-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("services.update");
  const { id } = await params;

  const service = await db.query.services.findFirst({
    where: eq(services.id, id),
  });
  if (!service) notFound();

  const action = updateService.bind(null, service.id);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={`/services/${service.id}`} label="Back to service" />
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
