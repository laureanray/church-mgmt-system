import Link from "next/link";
import { and, asc, count, desc, eq, ilike, notInArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Music, Pencil, Users } from "lucide-react";

import {
  addRosterMember,
  deleteMinistry,
  removeRosterMember,
  setRosterPosition,
} from "../actions";
import { db } from "@/db";
import { members, ministries, ministryMembers, ministryPermissions } from "@/db/schema";
import { AccessSummary } from "@/components/ministries/access-summary";
import { AddRosterMemberForm } from "@/components/ministries/add-roster-member-form";
import { RosterRowActions } from "@/components/ministries/roster-row-actions";
import { BackLink } from "@/components/patterns/back-link";
import { ConfirmDeleteButton } from "@/components/patterns/confirm-delete-button";
import { DataTable, type DataTableColumn } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasPermission, requireUser } from "@/lib/auth-helpers";
import {
  LAM_MINISTRY_ID,
  MINISTRY_POSITION_LABELS,
  type MinistryPosition,
} from "@/lib/constants";
import {
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { formatDateTime, initials } from "@/lib/format";
import {
  canAppointHeads,
  canManageRoster,
  canViewMinistry,
} from "@/lib/ministry-access";
import { isMinistryGrantable } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type RosterRow = {
  memberId: string;
  fullName: string;
  position: MinistryPosition;
  joinedAt: Date;
  hasLogin: boolean;
};

const SORT_COLUMNS = {
  name: members.fullName,
  position: ministryMembers.position,
  joined: ministryMembers.joinedAt,
} as const;

export default async function MinistryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!canViewMinistry(user, id)) redirect("/no-access");

  const ministry = await db.query.ministries.findFirst({
    where: eq(ministries.id, id),
  });
  if (!ministry) notFound();

  const ctx = tableContext(`/ministries/${ministry.id}`, await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    // "head" sorts before "member", so heads lead the roster.
    defaultSort: "position",
  });
  const { state } = ctx;

  const onRoster = eq(ministryMembers.ministryId, ministry.id);
  const where = and(
    onRoster,
    state.query ? ilike(members.fullName, `%${state.query}%`) : undefined,
  );
  const direction = state.direction === "asc" ? asc : desc;
  const manageRoster = canManageRoster(user, ministry.id);

  const [roster, [{ matching }], grants, candidates] = await Promise.all([
    db
      .select({
        memberId: members.id,
        fullName: members.fullName,
        position: ministryMembers.position,
        joinedAt: ministryMembers.joinedAt,
        userId: members.userId,
      })
      .from(ministryMembers)
      .innerJoin(members, eq(members.id, ministryMembers.memberId))
      .where(where)
      .orderBy(
        direction(SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS]),
        asc(members.fullName),
        asc(members.id),
      )
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db
      .select({ matching: count() })
      .from(ministryMembers)
      .innerJoin(members, eq(members.id, ministryMembers.memberId))
      .where(where),
    db
      .select({ key: ministryPermissions.permissionKey })
      .from(ministryPermissions)
      .where(eq(ministryPermissions.ministryId, ministry.id)),
    manageRoster
      ? db
          .select({ value: members.id, label: members.fullName })
          .from(members)
          .where(
            notInArray(
              members.id,
              db
                .select({ id: ministryMembers.memberId })
                .from(ministryMembers)
                .where(onRoster),
            ),
          )
          .orderBy(asc(members.fullName), asc(members.id))
      : Promise.resolve([]),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const rows: RosterRow[] = roster.map(({ userId, ...row }) => ({
    ...row,
    hasLogin: userId !== null,
  }));
  const canOpenMembers = hasPermission(user, "members.view");
  const appoint = canAppointHeads(user);

  const columns: DataTableColumn<RosterRow>[] = [
    {
      id: "name",
      header: "Member",
      sortKey: "name",
      hideable: false,
      cell: (row) => {
        const name = (
          <span className="flex items-center gap-2 font-medium">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(row.fullName)}</AvatarFallback>
            </Avatar>
            {row.fullName}
          </span>
        );
        return canOpenMembers ? (
          <Link href={`/members/${row.memberId}`} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        );
      },
    },
    {
      id: "position",
      header: "Position",
      sortKey: "position",
      cell: (row) => (
        <Badge variant={row.position === "head" ? "brand" : "secondary"}>
          {MINISTRY_POSITION_LABELS[row.position]}
        </Badge>
      ),
    },
    {
      id: "login",
      header: "Access",
      hideBelow: "sm",
      cell: (row) =>
        row.hasLogin ? (
          <span className="text-sm">Has staff login</span>
        ) : (
          <span className="text-sm text-muted-foreground">No login</span>
        ),
    },
    {
      id: "joined",
      header: "Joined",
      sortKey: "joined",
      sortDirection: "desc",
      hideBelow: "md",
      cellClassName: "text-muted-foreground",
      cell: (row) => formatDateTime(row.joinedAt),
    },
  ];
  if (manageRoster) {
    columns.push({
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      hideable: false,
      align: "end",
      width: "w-36",
      cell: (row) => (
        <RosterRowActions
          name={row.fullName}
          position={row.position}
          canAppoint={appoint}
          canRemove={manageRoster}
          togglePositionAction={setRosterPosition.bind(
            null,
            ministry.id,
            row.memberId,
            row.position === "head" ? "member" : "head",
          )}
          removeAction={removeRosterMember.bind(null, ministry.id, row.memberId)}
        />
      ),
    });
  }

  const grantEntries = grants
    .map(({ key }) => key)
    .filter(isMinistryGrantable)
    .map((permission) => ({ permission }));

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/ministries" label="Back to ministries" />
      <PageHeader title={ministry.name} description={ministry.description ?? undefined}>
        {ministry.id === LAM_MINISTRY_ID && hasPermission(user, "lam.view") ? (
          <Link href="/lam" className={cn(buttonVariants({ variant: "outline" }))}>
            <Music className="size-4" />
            Line-ups
          </Link>
        ) : null}
        {hasPermission(user, "ministries.update") ? (
          <Link
            href={`/ministries/${ministry.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Pencil className="size-4" />
            Edit
          </Link>
        ) : null}
        {hasPermission(user, "ministries.delete") && !ministry.isSystem ? (
          <ConfirmDeleteButton
            trigger="button"
            name={ministry.name}
            title={`Delete “${ministry.name}”?`}
            description="This removes the ministry, its roster, and the access it grants. Member records are kept."
            confirmLabel="Delete ministry"
            action={deleteMinistry.bind(null, ministry.id)}
          />
        ) : null}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ministry.isSystem ? <Badge variant="outline">Built in</Badge> : null}
        {ministry.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive — grants no access</Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Roster</CardTitle>
            <CardDescription>
              {ministry.id === LAM_MINISTRY_ID
                ? "Everyone who can be scheduled on a service line-up."
                : "Everyone serving in this ministry."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manageRoster ? (
              <AddRosterMemberForm
                action={addRosterMember.bind(null, ministry.id)}
                options={candidates}
              />
            ) : null}
            <DataTable
              ctx={ctx}
              caption={`${ministry.name} roster`}
              columns={columns}
              rows={rows}
              rowKey={(row) => row.memberId}
              total={matching}
              framed={false}
              search={{ placeholder: "Search roster…", label: "Search the roster by name" }}
              empty={{
                icon: Users,
                title: "No one on the roster yet",
                description: manageRoster
                  ? "Add the members who serve in this ministry."
                  : undefined,
              }}
              emptyFiltered={{ title: "No one on the roster matches your search" }}
            />
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">Access granted</CardTitle>
            <CardDescription>
              Added to the role of each rostered member with a staff login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccessSummary
              entries={grantEntries}
              emptyTitle="Grants no access"
              emptyDescription="This ministry is a roster only."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
