import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateMember } from "../../actions";
import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("members.update");
  const { id } = await params;

  const member = await db.query.members.findFirst({
    where: eq(members.id, id),
  });
  if (!member) notFound();

  const action = updateMember.bind(null, member.id);

  const cellRows = await db
    .select({ id: cellGroups.id, name: cellGroups.name })
    .from(cellGroups)
    .orderBy(asc(cellGroups.name));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/members/${member.id}`} label="Back to member" />
      <PageHeader
        title="Edit Member"
        description={`Update ${member.fullName}'s details.`}
      />
      <MemberForm
        action={action}
        member={member}
        cellOptions={cellOptions}
        submitLabel="Save changes"
      />
    </div>
  );
}
