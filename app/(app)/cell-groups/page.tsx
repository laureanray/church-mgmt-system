import Link from "next/link";
import { asc } from "drizzle-orm";
import { Network, Plus } from "lucide-react";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth-helpers";
import { buildCellGraph } from "@/lib/cell-graph";
import { cn } from "@/lib/utils";
import { CellGroupsView } from "@/components/cell-groups/cell-groups-view";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export default async function CellGroupsPage() {
  const user = await requireUser();

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
  const manage = canManage(user.role);

  return (
    <>
      <PageHeader
        title="Cell Groups"
        description={`${cells.length} cell group${
          cells.length === 1 ? "" : "s"
        } · ${graph.unassignedCount} not yet assigned`}
      >
        {manage ? (
          <Link href="/cell-groups/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            New Cell Group
          </Link>
        ) : null}
      </PageHeader>

      {cells.length === 0 && unassigned.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
            <Network className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium">No cell groups yet</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Create your first cell group, then assign members to see the network
            graph.
          </p>
        </div>
      ) : (
        <CellGroupsView
          nodes={graph.nodes}
          links={graph.links}
          cells={cells}
          unassigned={unassigned}
          cellOptions={cellOptions}
          canManage={manage}
        />
      )}
    </>
  );
}
