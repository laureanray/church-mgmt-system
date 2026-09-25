import { createRole } from "../actions";
import { BackLink } from "@/components/patterns/back-link";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { RoleForm } from "@/components/roles/role-form";
import { requirePermission } from "@/lib/auth-helpers";
import { LOCKED_PERMISSIONS_NOTE, grantableFor } from "@/lib/delegation";

export default async function NewRolePage() {
  const actor = await requirePermission("roles.create");
  const grantable = grantableFor(actor.permissions);
  return (
    <PageContainer>
      <BackLink href="/roles" label="Back to roles" />
      <PageHeader
        title="Create Role"
        description="Choose exactly which modules and actions this role can access."
      />
      <RoleForm
        action={createRole}
        grantable={grantable}
        permissionsNote={grantable ? LOCKED_PERMISSIONS_NOTE : undefined}
      />
    </PageContainer>
  );
}
