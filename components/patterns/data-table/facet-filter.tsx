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

/**
 * A multi-select facet.
 *
 * Almost every other control on the table is a plain link, and this one is not.
 * A facet is multi-select, and a real `menuitemcheckbox` announces "checked" to
 * a screen reader where a link dressed up with a tick does not — so the menu
 * earns its keep here in a way it would not for, say, the page size.
 */
export function DataTableFacetFilter({
  label,
  options,
  clearHref,
}: {
  label: string;
  options: FacetOption[];
  clearHref: string;
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
        {selected.length > 0 ? (
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
        {selected.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => go(clearHref)}>
              Clear {label.toLowerCase()}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
