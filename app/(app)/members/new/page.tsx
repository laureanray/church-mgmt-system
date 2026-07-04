import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createMember } from "../actions";
import { requireRole } from "@/lib/auth-helpers";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NewMemberPage() {
  await requireRole(["admin", "leader"]);

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
      <MemberForm action={createMember} submitLabel="Create member" />
    </div>
  );
}
