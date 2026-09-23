"use client";

import { useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

/**
 * One option, with the URL that toggling it leads to. The href is computed on
 * the server: this component holds no table state, only strings, which is what
 * lets a Server Component render it.
 */
export type FacetOption = {
  value: string;
  label: string;
  href: string;
  selected: boolean;
};

/** Where the menu's trailing reset item leads, and what it is called. */
export type FacetReset = {
  label: string;
  href: string;
};

/**
 * A multi-select facet.
 *
 * Almost every other control on the table is a plain link, and this one is not.
 * A facet is multi-select, and a real `menuitemcheckbox` announces "checked" to
 * a screen reader where a link dressed up with a tick does not — so the menu
 * earns its keep here in a way it would not for, say, the page size.
 *
 * A facet with a default selection can also offer `all`, a checkbox that lifts
 * the filter entirely; without it a reader cannot reach the rows the default
 * leaves out except by ticking every other value one at a time.
 */
export function DataTableFacetFilter({
  label,
  options,
  all,
  reset,
}: {
  label: string;
  options: FacetOption[];
  /** The "show everything" choice, for a facet whose default hides rows. */
  all?: Omit<FacetOption, "value">;
  /** Omit when the facet is already on its default. */
  reset?: FacetReset | null;
}) {
  const router = useRouter();
  const selected = options.filter((option) => option.selected);
  // The table is what changed, not the page, so hold the viewport still.
  const go = (href: string) => router.push(href, { scroll: false });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <ListFilter aria-hidden />
        {label}
        {all?.selected ? (
          <Badge variant="brand">All</Badge>
        ) : selected.length > 0 ? (
          <Badge variant="brand" aria-label={`${selected.length} selected`}>
            {selected.length}
          </Badge>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={option.selected}
              onCheckedChange={() => go(option.href)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {all ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={all.selected}
              onCheckedChange={() => go(all.href)}
            >
              {all.label}
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
        {reset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => go(reset.href)}>
              {reset.label}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
