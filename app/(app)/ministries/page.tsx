import Link from "next/link";
import { redirect } from "next/navigation";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { HandHeart, Pencil, Plus } from "lucide-react";

import { db } from "@/db";
import {
  members,
  ministries,
  ministryMembers,
  ministryPermissions,
} from "@/db/schema";
import { deleteMinistry } from "./actions";
import { DataTable, type DataTableColumn } from "@/components/patterns/data-table";
import { ConfirmDeleteButton } from "@/components/patterns/confirm-delete-button";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { hasPermission, requireUser } from "@/lib/auth-helpers";
import {
  allowedValues,
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";

type MinistryRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  rosterCount: number;
  grantCount: number;
  heads: string[];
};

const SORT_COLUMNS = {
  name: ministries.name,
  roster: countDistinct(ministryMembers.memberId),
  grants: countDistinct(ministryPermissions.permissionKey),
} as const;

const STATUSES = ["active", "inactive"] as const;

export default async function MinistriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  // Staff with ministries.view see every ministry; anyone on a roster sees the
  // ministries they serve in, which is how a head reaches their roster.
  const seesAll = hasPermission(user, "ministries.view");
  if (!seesAll && user.ministries.length === 0) redirect("/no-access");

  const ctx = tableContext("/ministries", await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    filterKeys: ["status"],
    defaultSort: "name",
  });
  const { state } = ctx;

  const status = allowedValues(state.filters.status, STATUSES);
  const where = and(
    seesAll
      ? undefined
      : inArray(
          ministries.id,
          user.ministries.map((m) => m.id),
        ),
    state.query
      ? or(
          ilike(ministries.name, `%${state.query}%`),
          ilike(ministries.description, `%${state.query}%`),
        )
      : undefined,
    status.length === 1 ? eq(ministries.active, status[0] === "active") : undefined,
  );
  const sortColumn = SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS];
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select({
        id: ministries.id,
        name: ministries.name,
        description: ministries.description,
        active: ministries.active,
        isSystem: ministries.isSystem,
        rosterCount: countDistinct(ministryMembers.memberId),
        grantCount: countDistinct(ministryPermissions.permissionKey),
        // In the row query, not a follow-up, so the page stays one batch.
        // The subquery's own ministry_members shadows the outer join's.
        heads: sql<string[]>`coalesce(
          (select array_agg(${members.fullName} order by ${members.fullName})
            from ${ministryMembers}
            join ${members} on ${members.id} = ${ministryMembers.memberId}
            where ${ministryMembers.ministryId} = ${ministries.id}
              and ${ministryMembers.position} = 'head'),
          '{}'
        )`,
      })
      .from(ministries)
      .leftJoin(ministryMembers, eq(ministryMembers.ministryId, ministries.id))
      .leftJoin(
        ministryPermissions,
        eq(ministryPermissions.ministryId, ministries.id),
      )
      .where(where)
      .groupBy(ministries.id)
      .orderBy(direction(sortColumn), asc(ministries.id))
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(ministries).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));


  const canCreate = hasPermission(user, "ministries.create");
  const canUpdate = hasPermission(user, "ministries.update");
  const canDelete = hasPermission(user, "ministries.delete");

  const addMinistry = (
    <Link href="/ministries/new" className={cn(buttonVariants())}>
      <Plus className="size-4" />
      Add ministry
    </Link>
  );

  const columns: DataTableColumn<MinistryRow>[] = [
    {
      id: "name",
      header: "Ministry",
      sortKey: "name",
      hideable: false,
      cell: (ministry) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/ministries/${ministry.id}`}
              className="font-medium hover:underline"
            >
              {ministry.name}
            </Link>
            {ministry.isSystem ? <Badge variant="outline">Built in</Badge> : null}
            {ministry.active ? null : <Badge variant="secondary">Inactive</Badge>}
          </div>
          {ministry.description ? (
            <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
              {ministry.description}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "heads",
      header: "Heads",
      hideBelow: "md",
      cellClassName: "text-muted-foreground",
      cell: (ministry) =>
        ministry.heads.join(", ") || "—",
    },
    {
      id: "roster",
      header: "Roster",
      sortKey: "roster",
      sortDirection: "desc",
      numeric: true,
      cell: (ministry) => ministry.rosterCount,
    },
    {
      id: "grants",
      header: "Permissions",
      sortKey: "grants",
      sortDirection: "desc",
      numeric: true,
      hideBelow: "sm",
      cell: (ministry) => ministry.grantCount,
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      hideable: false,
      align: "end",
      width: "w-20",
      cell: (ministry) => (
        <div className="flex items-center justify-end gap-0.5">
          {canUpdate ? (
            <Link
              href={`/ministries/${ministry.id}/edit`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
              aria-label={`Edit ${ministry.name}`}
            >
              <Pencil className="size-4" />
            </Link>
          ) : null}
          {canDelete && !ministry.isSystem ? (
            <ConfirmDeleteButton
              name={ministry.name}
              title={`Delete “${ministry.name}”?`}
              description="This removes the ministry, its roster, and the access it grants. Member records are kept."
              confirmLabel="Delete ministry"
              action={deleteMinistry.bind(null, ministry.id)}
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={seesAll ? "Ministries" : "My Ministries"}
        description="Where members serve. A ministry adds its access to the role of every rostered member who has a staff login."
      >
        {canCreate ? addMinistry : null}
      </PageHeader>
      <DataTable
        ctx={ctx}
        caption="Ministries"
        columns={columns}
        rows={rows}
        rowKey={(ministry) => ministry.id}
        total={matching}
        search={{ placeholder: "Search ministries…", label: "Search ministries" }}
        facets={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
        ]}
        empty={{
          icon: HandHeart,
          title: "No ministries yet",
          description: "Add a ministry to keep its roster and grant its members access.",
          action: canCreate ? addMinistry : null,
        }}
        emptyFiltered={{ icon: HandHeart, title: "No ministries match your search" }}
      />
    </>
  );
}
