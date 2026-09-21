import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A single attribute — "When", "Location" — as an icon-led card.
 *
 * The quieter sibling of [StatCard]: same card, but the icon leads and the
 * value stays at body size, because these read as facts about one record rather
 * than as figures to compare across a row.
 */
export function InfoTile({
  label,
  value,
  icon: Icon,
  accent,
  numeric,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  accent?: boolean;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center",
            accent
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={cn("text-sm font-medium", numeric && "tabular-nums")}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
