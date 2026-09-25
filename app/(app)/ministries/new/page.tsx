import { createMinistry } from "../actions";
import { BackLink } from "@/components/patterns/back-link";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { MinistryForm } from "@/components/ministries/ministry-form";
import { requirePermission } from "@/lib/auth-helpers";
import { LOCKED_PERMISSIONS_NOTE, grantableFor } from "@/lib/delegation";
import { MINISTRY_GRANTABLE_KEYS } from "@/lib/permissions";

export default async function NewMinistryPage() {
  const actor = await requirePermission("ministries.create");
  const grantable = grantableFor(actor.permissions, MINISTRY_GRANTABLE_KEYS);
  return (
    <PageContainer>
      <BackLink href="/ministries" label="Back to ministries" />
      <PageHeader
        title="Add Ministry"
        description="Name the ministry and choose what access serving in it brings."
      />
      <MinistryForm
        action={createMinistry}
        grantable={grantable}
        permissionsNote={grantable ? LOCKED_PERMISSIONS_NOTE : undefined}
      />
    </PageContainer>
  );
}
