import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, ilike, inArray } from "drizzle-orm";
import { Plus, Users } from "lucide-react";

import { db } from "@/db";
import { members } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import {
  DEFAULT_DIRECTORY_STATUSES,
  GENDERS,
  GENDER_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  MEMBER_STATUSES,
  MEMBER_STATUS_LABELS,
} from "@/lib/constants";
import {
  allowedValues,
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { MemberStatusBadge } from "@/components/members/member-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type MemberRow = typeof members.$inferSelect;

/**
 * The sort keys the URL is allowed to name, and the column each maps to.
 * `tableContext` rejects anything outside this map, so `?sort=` can never
 * reach the query with a column the page did not choose to expose.
 */
const SORT_COLUMNS = {
  name: members.fullName,
  gender: members.gender,
  marital: members.maritalStatus,
  since: members.memberSinceYear,
  contact: members.contactNumber,
} as const;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("members.view");
  const manage = hasPermission(user, "members.create");

  const ctx = tableContext("/members", await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    filterKeys: ["gender", "marital", "status"],
    // People who have left or passed on stay on record but out of the way;
    // `?status=all` or a status of their own brings them back.
    filterDefaults: { status: DEFAULT_DIRECTORY_STATUSES },
    // Before this facet existed `?status=` meant marital status, so an old
    // `?status=married` bookmark must land on the default view, not on everyone.
    filterValues: {
      gender: GENDERS,
      marital: MARITAL_STATUSES,
      status: MEMBER_STATUSES,
    },
    defaultSort: "name",
  });
  const { state } = ctx;

  const gender = allowedValues(state.filters.gender, GENDERS);
  const marital = allowedValues(state.filters.marital, MARITAL_STATUSES);
  const status = allowedValues(state.filters.status, MEMBER_STATUSES);
  const where = and(
    state.query ? ilike(members.fullName, `%${state.query}%`) : undefined,
    gender.length ? inArray(members.gender, gender) : undefined,
    marital.length ? inArray(members.maritalStatus, marital) : undefined,
    status.length ? inArray(members.status, status) : undefined,
  );

  const sortColumn = SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS];
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }], total] = await Promise.all([
    db
      .select()
      .from(members)
      .where(where)
      // A LIMIT/OFFSET walk over a non-unique sort column can repeat or skip
      // rows between pages; the id breaks every remaining tie.
      .orderBy(direction(sortColumn), asc(members.id))
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(members).where(where),
    db.$count(members),
  ]);

  // A bookmark to page 9 of a list that has since shrunk should land on the
  // last page with rows, and say so in the URL.
  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const addMember = (
    <Link href="/members/new" className={cn(buttonVariants())}>
      <Plus className="size-4" />
      Add Member
    </Link>
  );

  const columns: DataTableColumn<MemberRow>[] = [
    {
      id: "name",
      header: "Name",
      sortKey: "name",
      hideable: false,
      cellClassName: "font-medium",
      cell: (m) => (
        <span className="flex items-center gap-2">
          <Link href={`/members/${m.id}`} className="hover:underline">
            {m.fullName}
          </Link>
          <MemberStatusBadge status={m.status} />
        </span>
      ),
    },
    {
      id: "gender",
      header: "Gender",
      sortKey: "gender",
      hideBelow: "sm",
      cell: (m) => (m.gender ? GENDER_LABELS[m.gender] : "—"),
    },
    {
      id: "marital",
      header: "Marital Status",
      label: "Marital status",
      sortKey: "marital",
      hideBelow: "md",
      cell: (m) =>
        m.maritalStatus ? (
          <Badge variant="secondary">
            {MARITAL_STATUS_LABELS[m.maritalStatus]}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "since",
      header: "Member Since",
      label: "Member since",
      sortKey: "since",
      hideBelow: "lg",
      numeric: true,
      cell: (m) => m.memberSinceYear ?? "—",
    },
    {
      id: "contact",
      header: "Contact",
      sortKey: "contact",
      hideBelow: "sm",
      cellClassName: "text-muted-foreground",
      cell: (m) => m.contactNumber ?? "—",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Members"
        description={`${total} member${total === 1 ? "" : "s"} in your church directory.`}
      >
        {manage ? addMember : null}
      </PageHeader>

      <DataTable
        ctx={ctx}
        caption="Church members"
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        total={matching}
        search={{
          placeholder: "Search by name…",
          label: "Search members by name",
        }}
        facets={[
          {
            id: "gender",
            label: "Gender",
            options: GENDERS.map((value) => ({
              value,
              label: GENDER_LABELS[value],
            })),
          },
          {
            id: "marital",
            label: "Marital status",
            options: MARITAL_STATUSES.map((value) => ({
              value,
              label: MARITAL_STATUS_LABELS[value],
            })),
          },
          {
            id: "status",
            label: "Status",
            allLabel: "Show all",
            options: MEMBER_STATUSES.map((value) => ({
              value,
              label: MEMBER_STATUS_LABELS[value],
            })),
          },
        ]}
        empty={
          total === 0
            ? {
                icon: Users,
                title: "No members yet",
                description:
                  "Add your first member to generate their attendance QR code.",
                action: manage ? addMember : null,
              }
            : {
                // The directory has people, but the default view hides all of
                // them — so this is no invitation to add a first member.
                icon: Users,
                title: "No active members or visitors",
                description: (
                  <Link
                    href={tableHref(ctx, { filters: { status: [] } })}
                    className="underline underline-offset-4"
                  >
                    Show all {total} member{total === 1 ? "" : "s"}
                  </Link>
                ),
              }
        }
        emptyFiltered={{
          icon: Users,
          title: "No members match your search",
        }}
      />
    </PageContainer>
  );
}
