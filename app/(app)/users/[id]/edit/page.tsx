import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateUser } from "../../actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { UserForm } from "@/components/users/user-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;

  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) notFound();

  const action = updateUser.bind(null, user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/users" label="Back to staff" />
      <PageHeader title="Edit Staff User" description={`Update ${user.name}.`} />
      <UserForm action={action} user={user} />
    </div>
  );
}
