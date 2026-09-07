import Link from "next/link";
import { asc, count, ilike } from "drizzle-orm";
import { Plus, Users } from "lucide-react";

import { db } from "@/db";
import { members } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { canManage } from "@/lib/auth-helpers";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { SearchField } from "@/components/patterns/search-field";
import { TableCard } from "@/components/patterns/table-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim();

  const where = query ? ilike(members.fullName, `%${query}%`) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(members)
      .where(where)
      .orderBy(asc(members.fullName))
      .limit(200),
    db.select({ total: count() }).from(members),
  ]);

  return (
    <>
      <PageHeader
        title="Members"
        description={`${total} member${total === 1 ? "" : "s"} in your church directory.`}
      >
        {canManage(user.role) ? (
          <Link href="/members/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            Add Member
          </Link>
        ) : null}
      </PageHeader>

      <SearchField
        defaultValue={query}
        placeholder="Search by name…"
        label="Search members by name"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? "No members match your search" : "No members yet"}
          description={
            query
              ? "Try a different name."
              : "Add your first member to generate their attendance QR code."
          }
          action={
            !query && canManage(user.role) ? (
              <Link href="/members/new" className={cn(buttonVariants())}>
                <Plus className="size-4" />
                Add Member
              </Link>
            ) : null
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Gender</TableHead>
                <TableHead className="hidden md:table-cell">
                  Marital Status
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Member Since
                </TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link
                      href={`/members/${m.id}`}
                      className="block hover:underline"
                    >
                      {m.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {m.gender ? GENDER_LABELS[m.gender] : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {m.maritalStatus ? (
                      <Badge variant="secondary">
                        {MARITAL_STATUS_LABELS[m.maritalStatus]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell tabular-nums">
                    {m.memberSinceYear ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {m.contactNumber ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
