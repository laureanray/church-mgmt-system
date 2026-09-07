import { asc } from "drizzle-orm";

import { createMember } from "../actions";
import { db } from "@/db";
import { cellGroups } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function NewMemberPage() {
  await requireRole(["admin", "leader"]);

  const cellRows = await db
    .select({ id: cellGroups.id, name: cellGroups.name })
    .from(cellGroups)
    .orderBy(asc(cellGroups.name));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/members" label="Back to members" />
      <PageHeader
        title="Add Member"
        description="Create a member record. A unique attendance QR code is generated automatically."
      />
      <MemberForm
        action={createMember}
        cellOptions={cellOptions}
        submitLabel="Create member"
      />
    </div>
  );
}
