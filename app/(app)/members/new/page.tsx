import { asc } from "drizzle-orm";

import { createMember } from "../actions";
import { db } from "@/db";
import { cellGroups } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { faceCheckInEnabled, getFaceConsentNotice } from "@/server/faces";
import { BackLink } from "@/components/patterns/back-link";
import { MemberForm } from "@/components/members/member-form";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";

export default async function NewMemberPage() {
  const user = await requirePermission("members.create");

  // A photo can be taken here only by someone who may enrol faces, and only
  // once face recognition is set up.
  const offerFace = faceCheckInEnabled() && hasPermission(user, "members.update");
  const [cellRows, notice] = await Promise.all([
    db
      .select({ id: cellGroups.id, name: cellGroups.name })
      .from(cellGroups)
      .orderBy(asc(cellGroups.name)),
    offerFace ? getFaceConsentNotice(user) : null,
  ]);
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <PageContainer width="form">
      <BackLink href="/members" label="Back to members" />
      <PageHeader
        title="Add Member"
        description="Create a member record. A unique attendance QR code is generated automatically."
      />
      <MemberForm
        action={createMember}
        cellOptions={cellOptions}
        submitLabel="Create member"
        face={notice ? { notice } : undefined}
      />
    </PageContainer>
  );
}
