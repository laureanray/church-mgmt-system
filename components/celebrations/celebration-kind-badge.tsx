import { Cake, Heart, Sparkles, type LucideIcon } from "lucide-react";

import {
  CELEBRATION_KIND_LABELS,
  type CelebrationKind,
} from "@/lib/celebrations";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const KIND_STYLE: Record<
  CelebrationKind,
  { variant: BadgeVariant; icon: LucideIcon }
> = {
  birthday: { variant: "brand", icon: Cake },
  spiritual_birthday: { variant: "info", icon: Sparkles },
  wedding_anniversary: { variant: "success", icon: Heart },
};

/**
 * What is being celebrated. Each kind has its own icon as well as its own tone,
 * so the three stay distinguishable without relying on colour.
 */
export function CelebrationKindBadge({
  kind,
  className,
}: {
  kind: CelebrationKind;
  className?: string;
}) {
  const { variant, icon: Icon } = KIND_STYLE[kind];
  return (
    <Badge variant={variant} className={className}>
      <Icon data-icon="inline-start" aria-hidden />
      {CELEBRATION_KIND_LABELS[kind]}
    </Badge>
  );
}
