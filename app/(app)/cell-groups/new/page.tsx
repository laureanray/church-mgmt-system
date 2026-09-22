import { asc } from "drizzle-orm";

import { createCellGroup } from "../actions";
import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { BackLink } from "@/components/patterns/back-link";
import { CellGroupForm } from "@/components/cell-groups/cell-group-form";
import { PageHeader } from "@/components/patterns/page-header";

export default async function NewCellGroupPage() {
  await requirePermission("cell_groups.create");

  const [memberRows, cellRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.fullName })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({ id: cellGroups.id, name: cellGroups.name })
      .from(cellGroups)
      .orderBy(asc(cellGroups.name)),
  ]);

  const memberOptions = memberRows.map((m) => ({ value: m.id, label: m.name }));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/cell-groups" label="Back to cell groups" />
      <PageHeader
        title="New Cell Group"
        description="Create a cell group and assign its leader."
      />
      <CellGroupForm
        action={createCellGroup}
        memberOptions={memberOptions}
        cellOptions={cellOptions}
        submitLabel="Create cell group"
      />
    </div>
  );
}
