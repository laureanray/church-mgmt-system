import Link from "next/link";
import { Search, X } from "lucide-react";

import {
  clearNarrowingPatch,
  isNarrowed,
  paramName,
  preservedParams,
  tableHref,
  toggleFilterValue,
  type TableContext,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableColumnVisibility } from "./column-visibility";
import { DataTableFacetFilter } from "./facet-filter";
import { columnLabel, hiddenColumnIds, type DataTableColumn } from "./types";

export type DataTableFacetConfig = {
  /** Parameter name, unprefixed. Must appear in the context's `filterKeys`. */
  id: string;
  label: string;
  options: { value: string; label: string }[];
};

export type DataTableSearchConfig = {
  placeholder?: string;
  /** Accessible name for the input — "Search members by name", not "Search". */
  label: string;
};

/**
 * Search, facets and column visibility above the table.
 *
 * The search is a GET form with no `action`, so it submits to the current
 * route and a search is a plain navigation: linkable, back-button-safe and
 * working before any JavaScript has loaded. That is also why every other
 * parameter is re-emitted as a hidden input — submitting a GET form *replaces*
 * the query string rather than merging into it, so a sort not repeated here
 * would be dropped the moment someone searched.
 */
export function DataTableToolbar<TRow>({
  ctx,
  columns,
  search,
  facets = [],
  columnVisibility = true,
  children,
}: {
  ctx: TableContext;
  columns: readonly DataTableColumn<TRow>[];
  search?: DataTableSearchConfig;
  facets?: DataTableFacetConfig[];
  columnVisibility?: boolean;
  children?: React.ReactNode;
}) {
  const { state } = ctx;
  const hidden = hiddenColumnIds(columns, state.hidden);
  const toggleable = columns.filter((column) => column.hideable !== false);

  const toggles = toggleable.map((column) => {
    const next = new Set(hidden);
    if (next.has(column.id)) next.delete(column.id);
    else next.add(column.id);
    return {
      id: column.id,
      label: columnLabel(column),
      visible: !hidden.has(column.id),
      // Ordered by the columns themselves rather than by click order, so the
      // same set of hidden columns always produces the same URL.
      href: tableHref(ctx, {
        hidden: columns.filter((c) => next.has(c.id)).map((c) => c.id),
      }),
    };
  });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {search ? (
        <form className="flex min-w-0 flex-1 basis-64 items-center gap-2 sm:max-w-xs">
          {preservedParams(ctx).map((param, index) => (
            <input
              key={`${param.name}-${index}`}
              type="hidden"
              name={param.name}
              value={param.value}
            />
          ))}
          <div className="relative min-w-0 flex-1">
            <Search
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name={paramName(state.prefix, "query")}
              defaultValue={state.query}
              placeholder={search.placeholder ?? "Search…"}
              aria-label={search.label}
              className="pl-8"
            />
          </div>
          {/* Not redundant with Enter: iOS Safari gives a single-input form no
              "Go" key unless a submit control is present. */}
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      ) : null}

      {facets.map((facet) => {
        const selected = state.filters[facet.id] ?? [];
        return (
          <DataTableFacetFilter
            key={facet.id}
            label={facet.label}
            clearHref={tableHref(ctx, { filters: { [facet.id]: [] } })}
            options={facet.options.map((option) => ({
              ...option,
              selected: selected.includes(option.value),
              href: tableHref(ctx, {
                filters: {
                  [facet.id]: toggleFilterValue(selected, option.value),
                },
              }),
            }))}
          />
        );
      })}

      {isNarrowed(state) ? (
        <Link
          href={tableHref(ctx, clearNarrowingPatch(state))}
          scroll={false}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          <X aria-hidden />
          Reset
        </Link>
      ) : null}

      {children || (columnVisibility && toggles.length > 0) ? (
        <div className="ml-auto flex items-center gap-2">
          {children}
          {columnVisibility && toggles.length > 0 ? (
            <DataTableColumnVisibility
              columns={toggles}
              isDefault={state.hidden === null}
              resetHref={tableHref(ctx, { hidden: null })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
