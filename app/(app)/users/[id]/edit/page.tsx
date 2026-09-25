import { asc, eq, isNull, or, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { updateUser } from "../../actions";
import { db } from "@/db";
import { members, rolePermissions, roles, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { loadUserAccess } from "@/lib/access";
import { canManageAccount } from "@/lib/delegation";
import { effectivePermissions, permissionSources } from "@/lib/ministry-access";
import { AccessSummary } from "@/components/ministries/access-summary";
import { BackLink } from "@/components/patterns/back-link";
import { UserForm } from "@/components/users/user-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermission("users.update");
  const { id } = await params;

  const [user, allRoles, memberOptions, access] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, id) }),
    db
      .select({
        value: roles.id,
        label: roles.name,
        permissions: sql<string[]>`coalesce(
          (select array_agg(${rolePermissions.permissionKey}) from ${rolePermissions}
            where ${rolePermissions.roleId} = ${roles.id}),
          '{}'
        )`,
      })
      .from(roles)
      .orderBy(roles.name),
    // Unclaimed members, plus the one this login already has.
    db
      .select({ value: members.id, label: members.fullName })
      .from(members)
      .where(or(isNull(members.userId), eq(members.userId, id)))
      .orderBy(asc(members.fullName), asc(members.id)),
    loadUserAccess(id),
  ]);
  if (!user || !access) notFound();

  // updateUser refuses an account holding more than the editor — changing its
  // email would hand them that access — and any role holding more, so the
  // page does the same. See lib/delegation.ts.
  const targetPermissions = effectivePermissions(
    access.rolePermissions,
    access.ministryGrants,
  );
  if (!canManageAccount(actor.permissions, targetPermissions)) {
    redirect("/no-access");
  }
  const roleOptions = allRoles
    .filter((role) => canManageAccount(actor.permissions, role.permissions))
    .map(({ value, label }) => ({ value, label }));

  const action = updateUser.bind(null, user.id);
  const entries = permissionSources(
    { name: access.profile.roleName, permissions: access.rolePermissions },
    access.ministries,
    access.ministryGrants,
  );

  return (
    <PageContainer width="form">
      <BackLink href="/users" label="Back to staff" />
      <PageHeader title="Edit Staff User" description={`Update ${user.name}.`} />
      <UserForm
        action={action}
        user={user}
        roles={roleOptions}
        memberOptions={memberOptions}
        memberId={access.memberId}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Effective access</CardTitle>
          <CardDescription>
            As currently saved: the role&apos;s permissions plus those of every
            active ministry the linked member serves in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccessSummary
            entries={entries}
            emptyTitle="No access"
            emptyDescription="This role grants nothing and the login has no ministries."
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
