import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { updateMember } from "../../actions";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "leader"]);
  const { id } = await params;

  const member = await db.query.members.findFirst({
    where: eq(members.id, id),
  });
  if (!member) notFound();

  const action = updateMember.bind(null, member.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/members/${member.id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to member
      </Link>
      <PageHeader
        title="Edit Member"
        description={`Update ${member.fullName}'s details.`}
      />
      <MemberForm
        action={action}
        member={member}
        submitLabel="Save changes"
      />
    </div>
  );
}
