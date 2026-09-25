import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateMinistry } from "../../actions";
import { db } from "@/db";
import { ministries, ministryPermissions } from "@/db/schema";
import { BackLink } from "@/components/patterns/back-link";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { MinistryForm } from "@/components/ministries/ministry-form";
import { requirePermission } from "@/lib/auth-helpers";
import { LOCKED_PERMISSIONS_NOTE, grantableFor } from "@/lib/delegation";
import { MINISTRY_GRANTABLE_KEYS, isMinistryGrantable } from "@/lib/permissions";

export default async function EditMinistryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermission("ministries.update");
  const { id } = await params;
  const [ministry, grants] = await Promise.all([
    db.query.ministries.findFirst({ where: eq(ministries.id, id) }),
    db
      .select({ key: ministryPermissions.permissionKey })
      .from(ministryPermissions)
      .where(eq(ministryPermissions.ministryId, id)),
  ]);
  if (!ministry) notFound();
  const grantable = grantableFor(actor.permissions, MINISTRY_GRANTABLE_KEYS);

  return (
    <PageContainer>
      <BackLink href={`/ministries/${ministry.id}`} label={`Back to ${ministry.name}`} />
      <PageHeader title="Edit Ministry" description={`Update ${ministry.name} and the access it grants.`} />
      <MinistryForm
        action={updateMinistry.bind(null, ministry.id)}
        ministry={ministry}
        selectedPermissions={grants.map(({ key }) => key).filter(isMinistryGrantable)}
        cancelHref={`/ministries/${ministry.id}`}
        grantable={grantable}
        permissionsNote={grantable ? LOCKED_PERMISSIONS_NOTE : undefined}
      />
    </PageContainer>
  );
}
