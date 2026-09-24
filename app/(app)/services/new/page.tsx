
import { createService } from "../actions";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { ServiceForm } from "@/components/services/service-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";

export default async function NewServicePage() {
  await requirePermission("services.create");

  return (
    <PageContainer width="form">
      <BackLink href="/services" label="Back to services" />
      <PageHeader
        title="Add Service"
        description="Create a service to record attendance against."
      />
      <ServiceForm action={createService} submitLabel="Create service" />
    </PageContainer>
  );
}
