import { cn } from "@/lib/utils";

/**
 * The outer frame of every page in the app group.
 *
 * Every page starts at the same left edge, so moving from a list to one of its
 * records never shifts the title. That rules out `mx-auto`: a centred column
 * narrower than the list it came from moves the whole page inwards.
 *
 * - `full` (default) — lists, dashboards and record views. The layout's
 *   `<main>` padding is the only inset.
 * - `form` — create and edit screens, capped at a readable line length and
 *   left-aligned rather than centred.
 */
export function PageContainer({
  width = "full",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  width?: "full" | "form";
}) {
  return (
    <div
      {...props}
      data-slot="page-container"
      data-width={width}
      className={cn("w-full", width === "form" && "max-w-3xl", className)}
    />
  );
}
