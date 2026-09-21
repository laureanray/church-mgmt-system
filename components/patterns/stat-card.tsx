import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A headline number in a card, for the dashboard's top row.
 *
 * `accent` marks the icon with the brand colour. It marks the one figure a
 * row is *about* — use it at most once per row, or it stops meaning anything.
 *
 * The value is `tabular-nums` so a counter ticking 9 → 10 does not reflow the
 * digits beside it.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  className,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center",
            accent
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
