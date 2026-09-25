import { createMinistry } from "../actions";
import { BackLink } from "@/components/patterns/back-link";
import { PageHeader } from "@/components/patterns/page-header";
import { MinistryForm } from "@/components/ministries/ministry-form";
import { requirePermission } from "@/lib/auth-helpers";

export default async function NewMinistryPage() {
  await requirePermission("ministries.create");
  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/ministries" label="Back to ministries" />
      <PageHeader
        title="Add Ministry"
        description="Name the ministry and choose what access serving in it brings."
      />
      <MinistryForm action={createMinistry} />
    </div>
  );
}
