import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateUser } from "../../actions";
import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { UserForm } from "@/components/users/user-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("users.update");
  const { id } = await params;

  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) notFound();

  const roleOptions = await db
    .select({ value: roles.id, label: roles.name })
    .from(roles)
    .orderBy(roles.name);

  const action = updateUser.bind(null, user.id);

  return (
    <PageContainer width="form">
      <BackLink href="/users" label="Back to staff" />
      <PageHeader title="Edit Staff User" description={`Update ${user.name}.`} />
      <UserForm action={action} user={user} roles={roleOptions} />
    </PageContainer>
  );
}
