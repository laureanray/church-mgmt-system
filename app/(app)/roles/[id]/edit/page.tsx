import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateRole } from "../../actions";
import { db } from "@/db";
import { rolePermissions, roles } from "@/db/schema";
import { BackLink } from "@/components/patterns/back-link";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { RoleForm } from "@/components/roles/role-form";
import { requirePermission } from "@/lib/auth-helpers";
import { LOCKED_PERMISSIONS_NOTE, grantableFor } from "@/lib/delegation";
import type { PermissionKey } from "@/lib/permissions";

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermission("roles.update");
  const { id } = await params;
  const [role, assigned] = await Promise.all([
    db.query.roles.findFirst({ where: eq(roles.id, id) }),
    db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id))
      .orderBy(asc(rolePermissions.permissionKey)),
  ]);
  if (!role) notFound();

  // The same limits updateRole applies: your own role's permissions are your
  // own access, and nobody grants or removes what they do not hold.
  const ownRole = role.id === actor.role.id && role.id !== "admin";
  const grantable = ownRole ? [] : grantableFor(actor.permissions);
  const permissionsNote = ownRole
    ? "This is your own role, so its permissions are locked. Ask another authorized staff member to change them."
    : grantable
      ? LOCKED_PERMISSIONS_NOTE
      : undefined;

  return (
    <PageContainer>
      <BackLink href="/roles" label="Back to roles" />
      <PageHeader
        title={role.id === "admin" ? "Admin Role" : "Edit Role"}
        description={
          role.id === "admin"
            ? "The Admin role always has every permission and is protected from changes."
            : `Update ${role.name} and its module access.`
        }
      />
      <RoleForm
        action={updateRole.bind(null, role.id)}
        role={role}
        selectedPermissions={assigned.map(({ key }) => key as PermissionKey)}
        protectedRole={role.id === "admin"}
        grantable={grantable}
        permissionsNote={permissionsNote}
      />
    </PageContainer>
  );
}
