import { asc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateCellGroup } from "../../actions";
import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { CellGroupForm } from "@/components/cell-groups/cell-group-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function EditCellGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "leader"]);
  const { id } = await params;

  const cellGroup = await db.query.cellGroups.findFirst({
    where: eq(cellGroups.id, id),
  });
  if (!cellGroup) notFound();

  const [memberRows, cellRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.fullName })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({ id: cellGroups.id, name: cellGroups.name })
      .from(cellGroups)
      .where(ne(cellGroups.id, id)) // can't be its own parent
      .orderBy(asc(cellGroups.name)),
  ]);

  const memberOptions = memberRows.map((m) => ({ value: m.id, label: m.name }));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));
  const action = updateCellGroup.bind(null, cellGroup.id);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/cell-groups/${cellGroup.id}`} label="Back to cell group" />
      <PageHeader title="Edit Cell Group" description={`Update ${cellGroup.name}.`} />
      <CellGroupForm
        action={action}
        cellGroup={cellGroup}
        memberOptions={memberOptions}
        cellOptions={cellOptions}
        submitLabel="Save changes"
      />
    </div>
  );
}
