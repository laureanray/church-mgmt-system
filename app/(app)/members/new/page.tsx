import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { createMember } from "../actions";
import { db } from "@/db";
import { cellGroups } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NewMemberPage() {
  await requireRole(["admin", "leader"]);

  const cellRows = await db
    .select({ id: cellGroups.id, name: cellGroups.name })
    .from(cellGroups)
    .orderBy(asc(cellGroups.name));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/members"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to members
      </Link>
      <PageHeader
        title="Add Member"
        description="Create a member record. A unique attendance QR code is generated automatically."
      />
      <MemberForm
        action={createMember}
        cellOptions={cellOptions}
        submitLabel="Create member"
      />
    </div>
  );
}
