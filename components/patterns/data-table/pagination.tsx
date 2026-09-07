import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import {
  PER_PAGE_OPTIONS,
  pageCount,
  paginationRange,
  rowRange,
  tableHref,
  type TableContext,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A page control, or a disabled button at the ends of the list.
 *
 * The bounds are a real `disabled` button rather than a dimmed link: a link
 * that goes nowhere is still focusable and still announced as a link, which
 * puts a screen-reader user in a loop at page one.
 */
function PageLink({
  href,
  label,
  disabled,
  current,
  children,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  current?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="ghost" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Link
      href={href}
      // Paging changes the rows, not the page: scrolling to the top would take
      // the table the reader is looking at out of view.
      scroll={false}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: current ? "secondary" : "ghost",
          size: "icon-sm",
        }),
        "tabular-nums",
      )}
    >
      {children}
    </Link>
  );
}

function RowsPerPage({ ctx }: { ctx: TableContext }) {
  const { perPage } = ctx.state;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="Rows per page" />}
      >
        <span className="tabular-nums">{perPage}</span>
        <span className="hidden md:inline">per page</span>
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Rows per page</DropdownMenuLabel>
          {PER_PAGE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option}
              render={
                <Link href={tableHref(ctx, { perPage: option })} scroll={false} />
              }
              className={cn(
                "tabular-nums",
                option === perPage && "font-medium text-foreground",
              )}
            >
              {option}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Row range, page size and page links.
 *
 * `total` is the count of rows matching the current search and facets — not
 * the count on this page — because it is what the page count is derived from.
 */
export function DataTablePagination({
  ctx,
  total,
}: {
  ctx: TableContext;
  total: number;
}) {
  const { state } = ctx;
  const pages = pageCount(total, state.perPage);
  // A bookmark to page 9 of a list that has since shrunk should show the last
  // page that has rows, and the control should agree with what is on screen.
  const page = Math.min(state.page, pages);
  const { from, to } = rowRange(page, state.perPage, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col-reverse items-center justify-between gap-2 border-t px-2 py-1.5 sm:flex-row"
    >
      <p
        className="text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        {total === 0
          ? "No rows"
          : `Showing ${from}–${to} of ${total} row${total === 1 ? "" : "s"}`}
      </p>

      <div className="flex items-center gap-0.5">
        <RowsPerPage ctx={ctx} />

        <PageLink
          href={tableHref(ctx, { page: 1 })}
          label="First page"
          disabled={page <= 1}
        >
          <ChevronsLeft aria-hidden />
        </PageLink>
        <PageLink
          href={tableHref(ctx, { page: page - 1 })}
          label="Previous page"
          disabled={page <= 1}
        >
          <ChevronLeft aria-hidden />
        </PageLink>

        {/* Numbers need room; below `sm` the position is spelled out instead. */}
        <span className="hidden items-center gap-0.5 sm:flex">
          {paginationRange(page, pages).map((slot, index) =>
            slot === "ellipsis" ? (
              <span
                key={`gap-${index}`}
                className="px-1 text-sm text-muted-foreground"
                aria-hidden
              >
                &hellip;
              </span>
            ) : (
              <PageLink
                key={slot}
                href={tableHref(ctx, { page: slot })}
                label={`Page ${slot}`}
                current={slot === page}
              >
                {slot}
              </PageLink>
            ),
          )}
        </span>
        <span className="px-2 text-xs text-muted-foreground tabular-nums sm:hidden">
          Page {page} of {pages}
        </span>

        <PageLink
          href={tableHref(ctx, { page: page + 1 })}
          label="Next page"
          disabled={page >= pages}
        >
          <ChevronRight aria-hidden />
        </PageLink>
        <PageLink
          href={tableHref(ctx, { page: pages })}
          label="Last page"
          disabled={page >= pages}
        >
          <ChevronsRight aria-hidden />
        </PageLink>
      </div>
    </nav>
  );
}
