import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, gte, ilike, lt } from "drizzle-orm";
import { CalendarDays } from "lucide-react";

import { db } from "@/db";
import { services } from "@/db/schema";
import { DataTable, type DataTableColumn } from "@/components/patterns/data-table";
import { LinkTabs } from "@/components/patterns/link-tabs";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth-helpers";
import {
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { formatDateTime } from "@/lib/format";
import { lineupSummary } from "@/lib/lam-query";
import { topUpAllSchedules } from "@/lib/occurrences";

type LineupRow = {
  id: string;
  name: string;
  scheduledAt: Date;
  songCount: number;
  teamCount: number;
  leaders: string[];
};

// A service stays under "Upcoming" for half a day after it starts, so the team
// can still open Sunday's line-up during Sunday — whatever timezone the server
// runs in.
const STILL_UPCOMING_MS = 12 * 60 * 60 * 1000;

function LineupStatus({ songs, team }: { songs: number; team: number }) {
  if (songs > 0 && team > 0) return <Badge variant="success">Planned</Badge>;
  if (songs === 0 && team === 0) return <Badge variant="outline">Not started</Badge>;
  return <Badge variant="warning">{songs === 0 ? "Needs songs" : "Needs team"}</Badge>;
}

export default async function LineupsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission("lam.view");

  // Line-ups are planned ahead, so the generated occurrences must exist.
  try {
    await topUpAllSchedules();
  } catch {
    // non-fatal: page still renders existing services
  }

  const params = await searchParams;
  const past = params.when === "past";
  // eslint-disable-next-line react-hooks/purity -- request-time cutoff, read after auth
  const cutoff = new Date(Date.now() - STILL_UPCOMING_MS);

  const { songCount, teamCount, leaders } = lineupSummary();
  const SORT_COLUMNS = {
    name: services.name,
    date: services.scheduledAt,
    songs: songCount,
    team: teamCount,
  };

  const ctx = tableContext("/lam", params, {
    sortKeys: Object.keys(SORT_COLUMNS),
    defaultSort: "date",
    // Upcoming reads soonest-first; past reads most-recent-first.
    defaultDirection: past ? "desc" : "asc",
  });
  const { state } = ctx;

  const where = and(
    past ? lt(services.scheduledAt, cutoff) : gte(services.scheduledAt, cutoff),
    state.query ? ilike(services.name, `%${state.query}%`) : undefined,
  );
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select({
        id: services.id,
        name: services.name,
        scheduledAt: services.scheduledAt,
        songCount,
        teamCount,
        leaders,
      })
      .from(services)
      .where(where)
      .orderBy(
        direction(SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS]),
        asc(services.id),
      )
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(services).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));


  const columns: DataTableColumn<LineupRow>[] = [
    {
      id: "name",
      header: "Service",
      sortKey: "name",
      hideable: false,
      cell: (row) => (
        <div>
          <Link href={`/lam/services/${row.id}`} className="font-medium hover:underline">
            {row.name}
          </Link>
          {/* Stands in for the Date column, which is hidden on small screens. */}
          <div className="text-xs text-muted-foreground sm:hidden">
            {formatDateTime(row.scheduledAt)}
          </div>
        </div>
      ),
    },
    {
      id: "date",
      header: "When",
      sortKey: "date",
      hideBelow: "sm",
      cellClassName: "text-muted-foreground",
      cell: (row) => formatDateTime(row.scheduledAt),
    },
    {
      id: "leader",
      header: "Worship Leader",
      label: "Worship leader",
      hideBelow: "md",
      cell: (row) =>
        row.leaders.join(", ") || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "songs",
      header: "Songs",
      sortKey: "songs",
      sortDirection: "desc",
      numeric: true,
      hideBelow: "lg",
      cell: (row) => row.songCount,
    },
    {
      id: "team",
      header: "Team",
      sortKey: "team",
      sortDirection: "desc",
      numeric: true,
      hideBelow: "lg",
      cell: (row) => row.teamCount,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <LineupStatus songs={row.songCount} team={row.teamCount} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Line-ups"
        description="Songs and serving team for each service."
      />
      <LinkTabs
        label="Which services"
        className="mb-4"
        tabs={[
          { label: "Upcoming", href: "/lam", active: !past },
          { label: "Past", href: "/lam?when=past", active: past },
        ]}
      />
      <DataTable
        ctx={ctx}
        caption={past ? "Past service line-ups" : "Upcoming service line-ups"}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        total={matching}
        search={{ placeholder: "Search services…", label: "Search services by name" }}
        empty={{
          icon: CalendarDays,
          title: past ? "No past services" : "No upcoming services",
          description: past
            ? undefined
            : "Line-ups are planned against services. Add a service or a recurring schedule under Services.",
        }}
        emptyFiltered={{ icon: CalendarDays, title: "No services match your search" }}
      />
    </PageContainer>
  );
}
