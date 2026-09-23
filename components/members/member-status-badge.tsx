import { MEMBER_STATUS_LABELS, type MemberStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/**
 * Tones follow what staff should do about each status: a visitor is someone to
 * welcome, an inactive member someone to follow up, and the two record-only
 * statuses are quiet because there is nothing left to act on.
 */
const STATUS_VARIANT: Record<Exclude<MemberStatus, "active">, BadgeVariant> = {
  visitor: "info",
  inactive: "warning",
  transferred: "secondary",
  deceased: "outline",
};

/**
 * A member's status, for anything other than `active`. Active is the norm, so
 * it renders nothing: a badge on every row would bury the ones that matter.
 */
export function MemberStatusBadge({
  status,
  className,
}: {
  status: MemberStatus;
  className?: string;
}) {
  if (status === "active") return null;
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {MEMBER_STATUS_LABELS[status]}
    </Badge>
  );
}
