import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Pencil, Users } from "lucide-react";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { formatMeeting } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/patterns/back-link";
import { EmptyState } from "@/components/patterns/empty-state";
import { DeleteCellGroupButton } from "@/components/cell-groups/delete-cell-group-button";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CellGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("cell_groups.view");
  const { id } = await params;

  const cellGroup = await db.query.cellGroups.findFirst({
    where: eq(cellGroups.id, id),
    with: { leader: true, parent: true, children: true },
  });
  if (!cellGroup) notFound();

  const roster = await db
    .select({ id: members.id, name: members.fullName })
    .from(members)
    .where(eq(members.cellGroupId, id))
    .orderBy(asc(members.fullName));

  const canUpdate = hasPermission(user, "cell_groups.update");
  const canDelete = hasPermission(user, "cell_groups.delete");

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/cell-groups" label="Back to cell groups" />

      <PageHeader
        title={cellGroup.name}
        description={formatMeeting(
          cellGroup.meetingDay,
          cellGroup.meetingTime,
          cellGroup.meetingLocation,
        )}
      >
        {canUpdate || canDelete ? (
          <>
            {canUpdate ? (
              <Link
                href={`/cell-groups/${cellGroup.id}/edit`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Pencil className="size-4" />
                Edit
              </Link>
            ) : null}
            {canDelete ? (
              <DeleteCellGroupButton id={cellGroup.id} name={cellGroup.name} />
            ) : null}
          </>
        ) : null}
      </PageHeader>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leadership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Leader:{" "}
              {cellGroup.leader ? (
                <Link
                  href={`/members/${cellGroup.leader.id}`}
                  className="font-medium hover:underline"
                >
                  {cellGroup.leader.fullName}
                </Link>
              ) : (
                <Badge variant="outline">No leader</Badge>
              )}
            </p>
            <p>
              Upline:{" "}
              {cellGroup.parent ? (
                <Link
                  href={`/cell-groups/${cellGroup.parent.id}`}
                  className="font-medium hover:underline"
                >
                  {cellGroup.parent.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Top level</span>
              )}
            </p>
            {cellGroup.children.length > 0 ? (
              <p className="text-muted-foreground">
                {cellGroup.children.length} child cell
                {cellGroup.children.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Members ({roster.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roster.length === 0 ? (
              <EmptyState variant="inline" title="No members yet." />
            ) : (
              <ul className="space-y-1 text-sm">
                {roster.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/members/${m.id}`}
                      className="hover:underline"
                    >
                      {m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
