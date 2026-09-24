import Link from "next/link";
import { asc } from "drizzle-orm";
import { Network, Plus } from "lucide-react";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { buildCellGraph } from "@/lib/cell-graph";
import { cn } from "@/lib/utils";
import { CellGroupsView } from "@/components/cell-groups/cell-groups-view";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { buttonVariants } from "@/components/ui/button";

export default async function CellGroupsPage() {
  const user = await requirePermission("cell_groups.view");

  const [people, cells] = await Promise.all([
    db
      .select({
        id: members.id,
        name: members.fullName,
        cellGroupId: members.cellGroupId,
      })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({
        id: cellGroups.id,
        name: cellGroups.name,
        leaderId: cellGroups.leaderId,
        parentCellGroupId: cellGroups.parentCellGroupId,
      })
      .from(cellGroups)
      .orderBy(asc(cellGroups.name)),
  ]);

  const graph = buildCellGraph(
    people.map((p) => ({ id: p.id, name: p.name, cellGroupId: p.cellGroupId })),
    cells.map((c) => ({
      id: c.id,
      leaderId: c.leaderId,
      parentCellGroupId: c.parentCellGroupId,
    })),
  );

  const unassigned = people
    .filter((p) => !p.cellGroupId)
    .map((p) => ({ id: p.id, name: p.name }));
  const cellOptions = cells.map((c) => ({ value: c.id, label: c.name }));
  const canCreate = hasPermission(user, "cell_groups.create");
  const canUpdate = hasPermission(user, "cell_groups.update");

  return (
    <PageContainer>
      <PageHeader
        title="Cell Groups"
        description={`${cells.length} cell group${
          cells.length === 1 ? "" : "s"
        } · ${graph.unassignedCount} not yet assigned`}
      >
        {canCreate ? (
          <Link href="/cell-groups/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            New Cell Group
          </Link>
        ) : null}
      </PageHeader>

      {cells.length === 0 && unassigned.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No cell groups yet"
          description="Create your first cell group, then assign members to see the network graph."
        />
      ) : (
        <CellGroupsView
          nodes={graph.nodes}
          links={graph.links}
          cells={cells}
          unassigned={unassigned}
          cellOptions={cellOptions}
          canManage={canUpdate}
        />
      )}
    </PageContainer>
  );
}
