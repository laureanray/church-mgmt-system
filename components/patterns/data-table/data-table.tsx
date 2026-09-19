import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  clearNarrowingPatch,
  isNarrowed,
  sortDirectionFor,
  sortPatch,
  tableHref,
  type TableContext,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { TableCard } from "@/components/patterns/table-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./pagination";
import {
  DataTableToolbar,
  type DataTableFacetConfig,
  type DataTableSearchConfig,
} from "./toolbar";
import {
  ALIGN_CELL_CLASS,
  ALIGN_HEADER_CLASS,
  HIDE_BELOW_CLASS,
  columnLabel,
  hiddenColumnIds,
  type DataTableColumn,
} from "./types";

export type DataTableEmpty = {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export type DataTableProps<TRow> = {
  /** Parsed URL state for this table — see `tableContext` in `lib/data-table`. */
  ctx: TableContext;
  columns: DataTableColumn<TRow>[];
  /** The current page of rows. Already searched, sorted and sliced by the page. */
  rows: TRow[];
  rowKey: (row: TRow) => string;
  /**
   * Rows matching the current search and facets, before paging. Supply it to
   * get pagination; omit it for a table that is always shown whole.
   */
  total?: number;
  /** Accessible name for the table, rendered as a visually hidden caption. */
  caption: string;
  search?: DataTableSearchConfig;
  facets?: DataTableFacetConfig[];
  columnVisibility?: boolean;
  /** Shown when the collection itself is empty. */
  empty: DataTableEmpty;
  /**
   * Shown when a search or facet matched nothing. Deliberately separate: an
   * empty *search* must not offer the create action an empty *collection*
   * does, or the reader whose search missed is one click from a duplicate.
   */
  emptyFiltered?: Partial<Omit<DataTableEmpty, "action">>;
  density?: "default" | "compact";
  /** Extra toolbar controls, aligned to the trailing edge. */
  toolbar?: React.ReactNode;
  /** Draw the bordered frame. Turn off when the table already sits in a Card. */
  framed?: boolean;
  className?: string;
};

function HeaderCell<TRow>({
  ctx,
  column,
}: {
  ctx: TableContext;
  column: DataTableColumn<TRow>;
}) {
  const align = column.align ?? "start";
  const shared = cn(
    column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
    column.width,
    column.headerClassName,
  );
  const label = columnLabel(column);
  const content = column.srOnlyHeader ? (
    <span className="sr-only">{label}</span>
  ) : (
    column.header
  );

  if (!column.sortKey) {
    return (
      <TableHead scope="col" className={cn(shared, ALIGN_CELL_CLASS[align])}>
        {content}
      </TableHead>
    );
  }

  const direction = sortDirectionFor(ctx.state, column.sortKey);
  const Icon =
    direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <TableHead
      scope="col"
      // `aria-sort` is how a screen reader announces the current ordering; the
      // arrow alone says it only to people who can see it.
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn(shared, "p-0")}
    >
      <Link
        href={tableHref(
          ctx,
          sortPatch(ctx.state, column.sortKey, column.sortDirection),
        )}
        scroll={false}
        className={cn(
          "flex h-10 w-full items-center gap-1 px-2 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          direction ? "text-foreground" : "text-muted-foreground",
          ALIGN_HEADER_CLASS[align],
        )}
      >
        {content}
        <Icon
          className={cn("size-3.5 shrink-0", !direction && "opacity-50")}
          aria-hidden
        />
      </Link>
    </TableHead>
  );
}

/**
 * The one table in this app.
 *
 * Sorting, paging, searching, faceting and column visibility all live in the
 * URL (`lib/data-table.ts`), which is what lets the whole component render on
 * the server: `cell` returns ordinary server JSX, so a row can hold a `<Link>`,
 * an `<Avatar>` or a delete button without any of the data reaching the
 * browser. The page does the real work — it reads `ctx.state`, translates it
 * into `WHERE`, `ORDER BY` and `LIMIT`, and passes back one page of rows plus
 * the total.
 *
 * The corollary is that this component never sorts or filters anything itself.
 * Handing it every row and hoping is how you ship a table that is correct at
 * 50 members and wrong at 5,000.
 */
export function DataTable<TRow>({
  ctx,
  columns,
  rows,
  rowKey,
  total,
  caption,
  search,
  facets,
  columnVisibility = true,
  empty,
  emptyFiltered,
  density = "default",
  toolbar,
  framed = true,
  className,
}: DataTableProps<TRow>) {
  const { state } = ctx;
  const hidden = hiddenColumnIds(columns, state.hidden);
  const visible = columns.filter((column) => !hidden.has(column.id));
  const narrowed = isNarrowed(state);
  const hasToolbar = Boolean(
    search || facets?.length || toolbar || (columnVisibility && columns.length),
  );

  const placeholder: DataTableEmpty = narrowed
    ? {
        title: emptyFiltered?.title ?? "No matches",
        description:
          emptyFiltered?.description ??
          "Try a different search, or clear the filters to see everything.",
        icon: emptyFiltered?.icon ?? empty.icon,
        action: (
          <Link
            href={tableHref(ctx, clearNarrowingPatch(state))}
            scroll={false}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Clear filters
          </Link>
        ),
      }
    : empty;

  return (
    <div className={className}>
      {hasToolbar ? (
        <DataTableToolbar
          ctx={ctx}
          columns={columns}
          search={search}
          facets={facets}
          columnVisibility={columnVisibility}
        >
          {toolbar}
        </DataTableToolbar>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          variant={framed ? "outline" : "inline"}
          icon={placeholder.icon}
          title={placeholder.title}
          description={placeholder.description}
          action={placeholder.action}
        />
      ) : (
        <TableCard className={framed ? undefined : "rounded-none border-0"}>
          <Table>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                {visible.map((column) => (
                  <HeaderCell key={column.id} ctx={ctx} column={column} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {visible.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
                        ALIGN_CELL_CLASS[column.align ?? "start"],
                        column.numeric && "tabular-nums",
                        density === "compact" && "py-1",
                        column.width,
                        column.cellClassName,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {total === undefined ? null : (
            <DataTablePagination ctx={ctx} total={total} />
          )}
        </TableCard>
      )}
    </div>
  );
}
