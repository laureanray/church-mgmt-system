import { History } from "lucide-react";

import type { AuditSnapshot } from "@/lib/audit-diff";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITIES,
  AUDIT_ENTITY_LABELS,
  type AuditAction,
  type AuditEntity,
} from "@/lib/constants";
import type { TableContext } from "@/lib/data-table";
import { formatDateTime } from "@/lib/format";
import { AuditChanges } from "@/components/audit/audit-changes";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { Badge } from "@/components/ui/badge";

export type AuditRow = {
  id: string;
  at: Date;
  /** Null once the staff user who made the change has been deleted. */
  actorName: string | null;
  action: AuditAction;
  entity: AuditEntity;
  summary: string;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
};

/** Narrow a queried `audit_log` row, whose text and jsonb columns are untyped. */
export function toAuditRow(row: {
  id: string;
  at: Date;
  actorName: string | null;
  action: string;
  entity: string;
  summary: string;
  before: unknown;
  after: unknown;
}): AuditRow {
  return {
    ...row,
    action: row.action as AuditAction,
    entity: row.entity as AuditEntity,
    before: row.before as AuditSnapshot | null,
    after: row.after as AuditSnapshot | null,
  };
}

/** Sort keys the audit tables expose; pages map each to a column. */
export const AUDIT_SORT_KEYS = ["at", "action"] as const;

function ActionBadge({ action }: { action: AuditAction }) {
  return (
    <Badge variant={action.endsWith(".delete") ? "destructive" : "outline"}>
      {AUDIT_ACTION_LABELS[action]}
    </Badge>
  );
}

/**
 * The audit log as a table. `variant="log"` is the full `/settings/audit` view,
 * searchable and faceted by action and record type; `variant="record"` is one
 * record's History tab, where both of those would only ever show one value.
 *
 * Like every DataTable, it renders what the page queried: the page reads
 * `ctx.state`, filters and sorts in SQL, and passes one page of rows.
 */
export function AuditLogTable({
  ctx,
  rows,
  total,
  variant = "log",
}: {
  ctx: TableContext;
  rows: AuditRow[];
  total: number;
  variant?: "log" | "record";
}) {
  const full = variant === "log";

  const columns: DataTableColumn<AuditRow>[] = [
    {
      id: "at",
      header: "When",
      sortKey: "at",
      sortDirection: "desc",
      hideable: false,
      width: "w-40",
      cellClassName: "text-muted-foreground whitespace-nowrap",
      cell: (row) => formatDateTime(row.at),
    },
    {
      id: "actor",
      header: "By",
      hideBelow: "sm",
      cell: (row) =>
        row.actorName ?? (
          <span className="text-muted-foreground">Deleted user</span>
        ),
    },
    {
      id: "action",
      header: "Action",
      sortKey: "action",
      // The summary already says what happened; on a phone it is the column
      // worth the width.
      hideBelow: "sm",
      cell: (row) => <ActionBadge action={row.action} />,
    },
    {
      id: "entity",
      header: "Record",
      hideBelow: "md",
      defaultHidden: !full,
      cellClassName: "text-muted-foreground",
      cell: (row) => AUDIT_ENTITY_LABELS[row.entity],
    },
    {
      id: "summary",
      header: "Summary",
      hideable: false,
      // Cells do not wrap by default; a summary is a sentence, so let it.
      cellClassName: "min-w-40 whitespace-normal",
      cell: (row) => row.summary,
    },
    {
      id: "changes",
      header: "Changes",
      hideBelow: "lg",
      cellClassName: "min-w-56 whitespace-normal",
      cell: (row) => <AuditChanges before={row.before} after={row.after} />,
    },
  ];

  return (
    <DataTable
      ctx={ctx}
      caption={full ? "Audit log" : "Changes to this record"}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      total={total}
      density="compact"
      framed={full}
      columnVisibility={full}
      search={
        full
          ? { placeholder: "Search summaries…", label: "Search the audit log" }
          : undefined
      }
      facets={
        full
          ? [
              {
                id: "action",
                label: "Action",
                options: AUDIT_ACTIONS.map((value) => ({
                  value,
                  label: AUDIT_ACTION_LABELS[value],
                })),
              },
              {
                id: "entity",
                label: "Record",
                options: AUDIT_ENTITIES.map((value) => ({
                  value,
                  label: AUDIT_ENTITY_LABELS[value],
                })),
              },
            ]
          : undefined
      }
      empty={{
        icon: History,
        title: full ? "Nothing logged yet" : "No changes recorded yet",
        description: full
          ? "Edits to members, cell groups, staff, roles and settings appear here as they happen."
          : "Edits made from now on appear here.",
      }}
      emptyFiltered={{ icon: History, title: "No entries match" }}
    />
  );
}
