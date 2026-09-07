import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The placeholder shown where a table or list would go when a query returns
 * nothing.
 *
 * Two distinct cases share this shape and must not share wording: an *empty*
 * collection invites the reader to create the first record, while an empty
 * *search* should only suggest a different query — offering "Add member" to
 * someone whose search missed is how you get duplicate records.
 *
 * `variant` controls only the frame, never the emphasis of the text:
 *
 * - `"outline"` (default) stands in for the whole page body, so it draws its
 *   own dashed border.
 * - `"inline"` sits inside a Card that already has a border and a title, so it
 *   drops the border — a second border inside the first reads as a mistake.
 *
 * The icon is independent of both: pass one when the empty region is large
 * enough to carry it, omit it for a one-line "nothing here yet".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "outline",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "outline" | "inline";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "outline"
          ? "rounded-lg border border-dashed py-16"
          : "py-8",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <h3 className="text-sm font-medium">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
