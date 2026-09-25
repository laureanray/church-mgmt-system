import { createRole } from "../actions";
import { BackLink } from "@/components/patterns/back-link";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { RoleForm } from "@/components/roles/role-form";
import { requirePermission } from "@/lib/auth-helpers";

export default async function NewRolePage() {
  await requirePermission("roles.create");
  return (
    <PageContainer>
      <BackLink href="/roles" label="Back to roles" />
      <PageHeader
        title="Create Role"
        description="Choose exactly which modules and actions this role can access."
      />
      <RoleForm action={createRole} />
    </PageContainer>
  );
}
