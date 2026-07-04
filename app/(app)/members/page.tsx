import Link from "next/link";
import { asc, count, like } from "drizzle-orm";
import { Plus, Search, Users } from "lucide-react";

import { db } from "@/db";
import { members } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { canManage } from "@/lib/auth-helpers";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const where = query ? like(members.fullName, `%${query}%`) : undefined;

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

      <form className="mb-4 flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query ?? ""}
            placeholder="Search by name…"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState hasQuery={Boolean(query)} canManage={canManage(user.role)} />
      ) : (
        <div className="overflow-hidden rounded-lg border">
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
        </div>
      )}
    </>
  );
}

function EmptyState({
  hasQuery,
  canManage,
}: {
  hasQuery: boolean;
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
        <Users className="size-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium">
        {hasQuery ? "No members match your search" : "No members yet"}
      </h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {hasQuery
          ? "Try a different name."
          : "Add your first member to generate their attendance QR code."}
      </p>
      {!hasQuery && canManage ? (
        <Link href="/members/new" className={cn(buttonVariants(), "mt-4")}>
          <Plus className="size-4" />
          Add Member
        </Link>
      ) : null}
    </div>
  );
}
