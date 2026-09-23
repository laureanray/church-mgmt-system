import Link from "next/link";

import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  MINISTRY_POSITION_LABELS,
  type MinistryPosition,
} from "@/lib/constants";

export type MemberMinistry = {
  id: string;
  name: string;
  position: MinistryPosition;
  active: boolean;
};

/**
 * The ministries one member serves in, as a compact list for their record.
 * `linkable` is decided per ministry by the page, since a viewer may open some
 * ministries (their own) and not others.
 */
export function MemberMinistries({
  ministries,
  linkableIds = [],
}: {
  ministries: MemberMinistry[];
  linkableIds?: string[];
}) {
  if (ministries.length === 0) {
    return <EmptyState variant="inline" title="Not serving in a ministry" className="py-4" />;
  }

  const linkable = new Set(linkableIds);
  return (
    <ul className="divide-y">
      {ministries.map((ministry) => (
        <li
          key={ministry.id}
          className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
        >
          {linkable.has(ministry.id) ? (
            <Link href={`/ministries/${ministry.id}`} className="truncate hover:underline">
              {ministry.name}
            </Link>
          ) : (
            <span className="truncate">{ministry.name}</span>
          )}
          <span className="flex shrink-0 items-center gap-1">
            {ministry.active ? null : <Badge variant="outline">Inactive</Badge>}
            <Badge variant={ministry.position === "head" ? "brand" : "secondary"}>
              {MINISTRY_POSITION_LABELS[ministry.position]}
            </Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}
