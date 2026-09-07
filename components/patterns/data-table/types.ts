import type { SortDirection } from "@/lib/data-table";

export type ColumnAlign = "start" | "center" | "end";
export type ColumnBreakpoint = "sm" | "md" | "lg" | "xl";

/**
 * Tailwind scans source for whole class names, so these have to be spelled out
 * rather than assembled — `hidden ${breakpoint}:table-cell` compiles to nothing
 * and the column silently stays visible at every width.
 */
export const HIDE_BELOW_CLASS: Record<ColumnBreakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export const ALIGN_CELL_CLASS: Record<ColumnAlign, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

/** A sortable header is a flex row, where `text-*` alignment has no effect. */
export const ALIGN_HEADER_CLASS: Record<ColumnAlign, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

export type DataTableColumn<TRow> = {
  /** Stable id — the handle used by the column-visibility menu and the URL. */
  id: string;
  header: React.ReactNode;
  cell: (row: TRow) => React.ReactNode;
  /**
   * Sort key for this column. Setting it makes the header a link; the page
   * must list the same key in `sortKeys` and map it to a database column.
   */
  sortKey?: string;
  /**
   * Direction the first click sorts in. Dates and counts read newest- and
   * largest-first, so those columns pass `"desc"`.
   */
  sortDirection?: SortDirection;
  align?: ColumnAlign;
  /** Drop the column below this breakpoint, rather than let the table scroll. */
  hideBelow?: ColumnBreakpoint;
  /** Numeric values get tabular figures so digits line up down the column. */
  numeric?: boolean;
  /** Exclude from the column-visibility menu — for a row's actions, say. */
  hideable?: boolean;
  /** Start hidden. Only applies until the reader touches the menu. */
  defaultHidden?: boolean;
  /** The header is decorative; the name below is what assistive tech reads. */
  srOnlyHeader?: boolean;
  /** Name for the visibility menu, when `header` is not plain text. */
  label?: string;
  headerClassName?: string;
  cellClassName?: string;
  /** A width utility, e.g. `"w-28"`. */
  width?: string;
};

export function columnLabel<TRow>(column: DataTableColumn<TRow>): string {
  if (column.label) return column.label;
  return typeof column.header === "string" ? column.header : column.id;
}

/**
 * Which columns are hidden right now.
 *
 * The URL wins outright when it says anything at all, including when it says
 * "nothing is hidden" — otherwise a column marked `defaultHidden` could never
 * be switched on, because showing it would produce exactly the state that
 * falls back to the defaults again.
 */
export function hiddenColumnIds<TRow>(
  columns: readonly DataTableColumn<TRow>[],
  hidden: string[] | null,
): Set<string> {
  if (hidden !== null) return new Set(hidden);
  return new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id));
}
