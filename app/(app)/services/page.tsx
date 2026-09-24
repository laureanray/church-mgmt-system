import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, gte, ilike, inArray, min } from "drizzle-orm";
import {
  CalendarDays,
  CalendarPlus,
  Pencil,
  Plus,
  Repeat,
  Users,
} from "lucide-react";

import { db } from "@/db";
import { attendance, serviceSchedules, services } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import {
  DAYS_OF_WEEK,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
} from "@/lib/constants";
import {
  allowedValues,
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { formatDateTime, formatTimeOfDay } from "@/lib/format";
import { topUpAllSchedules } from "@/lib/occurrences";
import { cn } from "@/lib/utils";
import { DeleteScheduleButton } from "@/components/services/delete-schedule-button";
import { ScheduleActiveToggle } from "@/components/services/schedule-active-toggle";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ServiceRow = {
  id: string;
  name: string;
  type: (typeof SERVICE_TYPES)[number];
  scheduledAt: Date;
  location: string | null;
  scheduleId: string | null;
  attendeeCount: number;
};

const SORT_COLUMNS = {
  name: services.name,
  type: services.type,
  date: services.scheduledAt,
  location: services.location,
} as const;

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("services.view");
  const canCreate = hasPermission(user, "services.create");
  const canUpdate = hasPermission(user, "services.update");
  const canDelete = hasPermission(user, "services.delete");

  // Keep upcoming occurrences populated for all active schedules.
  try {
    await topUpAllSchedules();
  } catch {
    // non-fatal: page still renders existing data
  }

  const now = new Date();

  const ctx = tableContext("/services", await searchParams, {
    sortKeys: [...Object.keys(SORT_COLUMNS), "attendance"],
    filterKeys: ["type"],
    defaultSort: "date",
    // A service list reads newest-first; the oldest Sunday of 2019 is not what
    // anyone opens this page for.
    defaultDirection: "desc",
  });
  const { state } = ctx;

  const types = allowedValues(state.filters.type, SERVICE_TYPES);
  const where = and(
    state.query ? ilike(services.name, `%${state.query}%`) : undefined,
    types.length ? inArray(services.type, types) : undefined,
  );

  // Counted per service rather than by joining and grouping every check-in:
  // only one page of services survives the LIMIT, so a handful of indexed
  // counts beat aggregating the whole attendance table to discard most groups.
  const attendeeCount = db.$count(
    attendance,
    eq(attendance.serviceId, services.id),
  );
  const sortExpression =
    state.sort === "attendance"
      ? attendeeCount
      : SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS];
  const direction = state.direction === "asc" ? asc : desc;

  const [schedules, occurrences, [{ matching }]] = await Promise.all([
    db
      .select({
        id: serviceSchedules.id,
        name: serviceSchedules.name,
        type: serviceSchedules.type,
        dayOfWeek: serviceSchedules.dayOfWeek,
        timeOfDay: serviceSchedules.timeOfDay,
        location: serviceSchedules.location,
        active: serviceSchedules.active,
        next: min(services.scheduledAt),
      })
      .from(serviceSchedules)
      .leftJoin(
        services,
        and(
          eq(services.scheduleId, serviceSchedules.id),
          gte(services.scheduledAt, now),
        ),
      )
      .groupBy(serviceSchedules.id)
      .orderBy(asc(serviceSchedules.name)),
    db
      .select({
        id: services.id,
        name: services.name,
        type: services.type,
        scheduledAt: services.scheduledAt,
        location: services.location,
        scheduleId: services.scheduleId,
        attendeeCount,
      })
      .from(services)
      .where(where)
      // Two services can share a timestamp, and a LIMIT/OFFSET walk over a
      // non-unique ordering can repeat or skip rows between pages.
      .orderBy(direction(sortExpression), asc(services.id))
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(services).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const serviceColumns: DataTableColumn<ServiceRow>[] = [
    {
      id: "name",
      header: "Service",
      sortKey: "name",
      hideable: false,
      cellClassName: "font-medium",
      cell: (s) => (
        <Link
          href={`/services/${s.id}`}
          className="flex items-center gap-1.5 hover:underline"
        >
          {s.scheduleId ? (
            <Repeat
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="From a recurring schedule"
            />
          ) : null}
          {s.name}
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      sortKey: "type",
      hideBelow: "sm",
      cell: (s) => <Badge variant="secondary">{SERVICE_TYPE_LABELS[s.type]}</Badge>,
    },
    {
      id: "date",
      header: "Date & Time",
      label: "Date and time",
      sortKey: "date",
      sortDirection: "desc",
      cellClassName: "text-muted-foreground",
      cell: (s) => formatDateTime(s.scheduledAt),
    },
    {
      id: "location",
      header: "Location",
      sortKey: "location",
      hideBelow: "md",
      cellClassName: "text-muted-foreground",
      cell: (s) => s.location ?? "—",
    },
    {
      id: "attendance",
      header: "Attendance",
      sortKey: "attendance",
      sortDirection: "desc",
      align: "end",
      numeric: true,
      cell: (s) => (
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5 text-muted-foreground" aria-hidden />
          {s.attendeeCount}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Services"
        description="Recurring schedules and individual services you track attendance for."
      >
        {canCreate ? (
          <>
            <Link
              href="/services/schedules/new"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Repeat className="size-4" />
              Add Schedule
            </Link>
            <Link href="/services/new" className={cn(buttonVariants())}>
              <Plus className="size-4" />
              Add Service
            </Link>
          </>
        ) : null}
      </PageHeader>

      {/* Recurring schedules ------------------------------------------------ */}
      {schedules.length > 0 || canCreate ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="size-4 text-muted-foreground" />
              Recurring Schedules
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <EmptyState
                variant="inline"
                title="No recurring schedules yet."
                action={
                  canCreate ? (
                    <Link
                      href="/services/schedules/new"
                      className={cn(buttonVariants({ size: "sm" }))}
                    >
                      <CalendarPlus className="size-4" />
                      Create a weekly service
                    </Link>
                  ) : null
                }
              />
            ) : (
              <div className="divide-y">
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <Badge variant="secondary">
                          {SERVICE_TYPE_LABELS[s.type]}
                        </Badge>
                        {!s.active ? (
                          <Badge variant="outline">Paused</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Every {DAYS_OF_WEEK[s.dayOfWeek]} ·{" "}
                        {formatTimeOfDay(s.timeOfDay)}
                        {s.location ? ` · ${s.location}` : ""}
                      </p>
                    </div>

                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.next
                        ? `Next ${formatDateTime(s.next)}`
                        : "Nothing upcoming"}
                    </span>

                    {canUpdate || canDelete ? (
                      <div className="flex items-center gap-1">
                        {canUpdate ? (
                          <>
                            <ScheduleActiveToggle
                              id={s.id}
                              active={s.active}
                              name={s.name}
                            />
                            <Link
                              href={`/services/schedules/${s.id}/edit`}
                              className={cn(
                                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                              )}
                              aria-label={`Edit ${s.name}`}
                            >
                              <Pencil className="size-4" />
                            </Link>
                          </>
                        ) : null}
                        {canDelete ? (
                          <DeleteScheduleButton id={s.id} name={s.name} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Individual services ----------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Services</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            ctx={ctx}
            caption="All services"
            columns={serviceColumns}
            rows={occurrences}
            rowKey={(s) => s.id}
            total={matching}
            // Already inside a Card, and a second border inside the first
            // reads as a mistake.
            framed={false}
            search={{
              placeholder: "Search services…",
              label: "Search services by name",
            }}
            facets={[
              {
                id: "type",
                label: "Type",
                options: SERVICE_TYPES.map((value) => ({
                  value,
                  label: SERVICE_TYPE_LABELS[value],
                })),
              },
            ]}
            empty={{
              icon: CalendarDays,
              title: "No services yet",
              description:
                "Create a schedule or a one-off service, then scan members in.",
            }}
            emptyFiltered={{
              icon: CalendarDays,
              title: "No services match your search",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
