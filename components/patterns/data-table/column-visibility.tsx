"use client";

import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ColumnToggle = {
  id: string;
  label: string;
  href: string;
  visible: boolean;
};

/**
 * Show/hide per column, persisted in the URL like the rest of the table state
 * — so a reader who trims the table down to three columns can send that view
 * to someone else, and it survives a refresh.
 *
 * Hiding is independent of the responsive `hideBelow` rules, which drop
 * columns on narrow screens whatever this menu says.
 */
export function DataTableColumnVisibility({
  columns,
  resetHref,
  isDefault,
}: {
  columns: ColumnToggle[];
  resetHref: string;
  isDefault: boolean;
}) {
  const router = useRouter();
  const go = (href: string) => router.push(href, { scroll: false });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" aria-label="Choose columns" />}
      >
        <Columns3 aria-hidden />
        <span className="hidden sm:inline">Columns</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.visible}
              onCheckedChange={() => go(column.href)}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {isDefault ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => go(resetHref)}>
              Reset columns
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
