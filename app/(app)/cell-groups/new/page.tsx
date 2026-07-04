import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { createCellGroup } from "../actions";
import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { CellGroupForm } from "@/components/cell-groups/cell-group-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NewCellGroupPage() {
  await requireRole(["admin", "leader"]);

  const [memberRows, cellRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.fullName })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({ id: cellGroups.id, name: cellGroups.name })
      .from(cellGroups)
      .orderBy(asc(cellGroups.name)),
  ]);

  const memberOptions = memberRows.map((m) => ({ value: m.id, label: m.name }));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/cell-groups"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to cell groups
      </Link>
      <PageHeader
        title="New Cell Group"
        description="Create a cell group and assign its leader."
      />
      <CellGroupForm
        action={createCellGroup}
        memberOptions={memberOptions}
        cellOptions={cellOptions}
        submitLabel="Create cell group"
      />
    </div>
  );
}
