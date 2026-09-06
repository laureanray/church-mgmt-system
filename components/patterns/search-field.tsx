import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The list-page search box: a GET form whose field name becomes the query
 * string, so a search is a plain navigation and the result is linkable and
 * back-button-safe. No `action` is set — it submits to the current route.
 *
 * The visible Button matters beyond redundancy with Enter: on iOS Safari a
 * single-input form has no "Go" key unless one is present.
 */
export function SearchField({
  name = "q",
  defaultValue,
  placeholder = "Search…",
  label = "Search",
  submitLabel = "Search",
  className,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  submitLabel?: string;
  className?: string;
}) {
  return (
    <form className={cn("mb-4 flex max-w-sm items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          name={name}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          aria-label={label}
          className="pl-8"
        />
      </div>
      <Button type="submit" variant="secondary">
        {submitLabel}
      </Button>
    </form>
  );
}
