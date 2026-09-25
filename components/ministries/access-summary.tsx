import { ShieldOff } from "lucide-react";

import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import type { PermissionSource } from "@/lib/ministry-access";
import {
  PERMISSIONS,
  groupPermissionsByModule,
  type PermissionKey,
} from "@/lib/permissions";

export type AccessEntry = {
  permission: PermissionKey;
  /** Omit to list permissions without saying where they come from. */
  sources?: PermissionSource[];
};

/**
 * A read-only list of permissions, grouped by module. With sources, it answers
 * "why can this person do that?" — each permission names the role and every
 * ministry that grants it.
 */
export function AccessSummary({
  entries,
  emptyTitle = "No access",
  emptyDescription,
}: {
  entries: AccessEntry[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={ShieldOff}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const byKey = new Map(entries.map((entry) => [entry.permission, entry]));
  const modules = groupPermissionsByModule(
    PERMISSIONS.filter((item) => byKey.has(item.key)),
  );

  return (
    // A container query, not a viewport one: the summary sits in a narrow side
    // column on a ministry page and in a full-width card on a staff page.
    <dl className="@container divide-y">
      {modules.map((module) => (
        <div
          key={module.key}
          className="grid gap-2 py-3 first:pt-0 last:pb-0 @md:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1.4fr)]"
        >
          <dt className="text-sm font-medium">{module.label}</dt>
          <dd>
            <ul className="space-y-1.5">
              {module.permissions.map((permission) => {
                const sources = byKey.get(permission.key)?.sources;
                return (
                  <li
                    key={permission.key}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                  >
                    <span>{permission.label}</span>
                    {sources?.map((source) =>
                      source.kind === "role" ? (
                        <Badge key="role" variant="outline">
                          Role: {source.name}
                        </Badge>
                      ) : (
                        <Badge key={source.id} variant="brand">
                          {source.name}
                        </Badge>
                      ),
                    )}
                  </li>
                );
              })}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
