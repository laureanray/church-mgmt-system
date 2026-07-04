"use client";

import { AlertTriangle } from "lucide-react";

import { assignMemberToCellGroup } from "@/app/(app)/cell-groups/actions";
import type { SelectOption } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function UnassignedPanel({
  people,
  cellOptions,
  canManage,
}: {
  people: { id: string; name: string }[];
  cellOptions: SelectOption[];
  canManage: boolean;
}) {
  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-4" />
          {people.length} not in a cell group
        </CardTitle>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Everyone belongs to a cell group. 🎉
          </p>
        ) : (
          <ul className="max-h-[52vh] space-y-2 overflow-y-auto">
            {people.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{m.name}</span>
                {canManage ? (
                  <form
                    action={assignMemberToCellGroup}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="memberId" value={m.id} />
                    <select
                      name="cellGroupId"
                      defaultValue=""
                      required
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
                    >
                      <option value="" disabled>
                        Assign to…
                      </option>
                      {cellOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="secondary">
                      Add
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
