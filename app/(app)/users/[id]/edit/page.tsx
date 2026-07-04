import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { updateUser } from "../../actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { UserForm } from "@/components/users/user-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      <Link
        href="/users"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to staff
      </Link>
      <PageHeader title="Edit Staff User" description={`Update ${user.name}.`} />
      <UserForm action={action} user={user} />
    </div>
  );
}
