import Link from "next/link";
import { Cake } from "lucide-react";

import { celebrationYearsLabel, type Celebration } from "@/lib/celebrations";
import type { TableContext } from "@/lib/data-table";
import { formatMonthDay } from "@/lib/format";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { Badge } from "@/components/ui/badge";
import { CelebrationKindBadge } from "./celebration-kind-badge";

/**
 * Who is celebrating what, and when. Rows arrive already sorted by
 * `collectCelebrations`; the table orders nothing itself.
 *
 * `today` marks the rows falling on it. `compact` is the dashboard's version:
 * no frame (it sits in a Card), and no cell-group column.
 */
export function CelebrationsTable({
  ctx,
  rows,
  today,
  caption,
  emptyTitle = "No celebrations",
  emptyDescription,
  compact = false,
}: {
  ctx: TableContext;
  rows: Celebration[];
  today: string;
  caption: string;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  compact?: boolean;
}) {
  const columns: DataTableColumn<Celebration>[] = [
    {
      id: "name",
      header: "Name",
      cellClassName: "font-medium",
      // On a phone the kind column is hidden and its badge moves under the
      // name, which leaves room for the date and its "Today" marker.
      cell: (c) => (
        <span className="flex flex-col items-start gap-1">
          <Link href={`/members/${c.memberId}`} className="hover:underline">
            {c.fullName}
          </Link>
          <CelebrationKindBadge kind={c.kind} className="sm:hidden" />
        </span>
      ),
    },
    {
      id: "kind",
      header: "Celebration",
      hideBelow: "sm",
      cell: (c) => <CelebrationKindBadge kind={c.kind} />,
    },
    {
      id: "date",
      header: "Date",
      cellClassName: "whitespace-nowrap",
      cell: (c) => (
        <span className="flex items-center gap-2">
          <time dateTime={c.observedOn}>{formatMonthDay(c.observedOn)}</time>
          {c.observedOn === today ? <Badge variant="brand">Today</Badge> : null}
        </span>
      ),
    },
    {
      id: "years",
      header: "Years",
      hideBelow: "sm",
      numeric: true,
      cellClassName: "text-muted-foreground whitespace-nowrap",
      cell: (c) => celebrationYearsLabel(c.kind, c.years) ?? "—",
    },
    ...(compact
      ? []
      : [
          {
            id: "cell",
            header: "Cell Group",
            label: "Cell group",
            hideBelow: "md",
            cellClassName: "text-muted-foreground",
            cell: (c) =>
              c.cellGroup ? (
                <Link
                  href={`/cell-groups/${c.cellGroup.id}`}
                  className="hover:underline"
                >
                  {c.cellGroup.name}
                </Link>
              ) : (
                "—"
              ),
          } satisfies DataTableColumn<Celebration>,
        ]),
  ];

  return (
    <DataTable
      ctx={ctx}
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(c) => c.key}
      framed={!compact}
      columnVisibility={false}
      density={compact ? "compact" : "default"}
      empty={{
        icon: compact ? undefined : Cake,
        title: emptyTitle,
        description: emptyDescription,
      }}
    />
  );
}
