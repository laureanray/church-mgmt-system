import Link from "next/link";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Pencil, QrCode, Users } from "lucide-react";

import { db } from "@/db";
import { attendance, members, services } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { SERVICE_TYPE_LABELS } from "@/lib/constants";
import {
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { formatDateTime, formatTime, initials } from "@/lib/format";
import { getSheetsConfig } from "@/lib/sheets";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/patterns/back-link";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { InfoTile } from "@/components/patterns/info-tile";
import { SyncServiceButton } from "@/components/integrations/sync-buttons";
import { DeleteServiceButton } from "@/components/services/delete-service-button";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AttendeeRow = {
  id: string;
  memberId: string;
  fullName: string | null;
  checkedInAt: Date;
};

const SORT_COLUMNS = {
  member: members.fullName,
  time: attendance.checkedInAt,
} as const;

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("services.view");
  const { id } = await params;

  const service = await db.query.services.findFirst({
    where: eq(services.id, id),
  });
  if (!service) notFound();

  const ctx = tableContext(`/services/${service.id}`, await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    defaultSort: "time",
    // Latest arrivals first — this list is read while people are still coming in.
    defaultDirection: "desc",
  });
  const { state } = ctx;

  const scanned = eq(attendance.serviceId, service.id);
  const where = and(
    scanned,
    state.query ? ilike(members.fullName, `%${state.query}%`) : undefined,
  );
  const direction = state.direction === "asc" ? asc : desc;

  const canUpdate = hasPermission(user, "services.update");
  const canDelete = hasPermission(user, "services.delete");
  const canScan = hasPermission(user, "attendance.view");
  const canSync = hasPermission(user, "services.sync");
  const [attendees, [{ matching }], total, sheetsOn] = await Promise.all([
    db
      .select({
        id: attendance.id,
        memberId: attendance.memberId,
        fullName: members.fullName,
        checkedInAt: attendance.checkedInAt,
      })
      .from(attendance)
      .leftJoin(members, eq(members.id, attendance.memberId))
      .where(where)
      .orderBy(
        direction(SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS]),
        asc(attendance.id),
      )
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db
      .select({ matching: count() })
      .from(attendance)
      .leftJoin(members, eq(members.id, attendance.memberId))
      .where(where),
    // The headline figure counts everyone who scanned in, not the page or the
    // search — it is the service's attendance, and narrowing the list below
    // must not appear to change it.
    db.$count(attendance, scanned),
    canSync ? getSheetsConfig().then(Boolean) : Promise.resolve(false),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const columns: DataTableColumn<AttendeeRow>[] = [
    {
      id: "member",
      header: "Member",
      sortKey: "member",
      hideable: false,
      cell: (row) => (
        <Link
          href={`/members/${row.memberId}`}
          className="flex items-center gap-2 font-medium hover:underline"
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {initials(row.fullName ?? "?")}
            </AvatarFallback>
          </Avatar>
          {row.fullName ?? "Unknown"}
        </Link>
      ),
    },
    {
      id: "time",
      header: "Checked In",
      label: "Checked in",
      sortKey: "time",
      sortDirection: "desc",
      align: "end",
      numeric: true,
      cellClassName: "text-muted-foreground",
      cell: (row) => formatTime(row.checkedInAt),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/services" label="Back to services" />

      <PageHeader title={service.name}>
        {canScan ? (
          <Link
            href={`/scan?service=${service.id}`}
            className={cn(buttonVariants())}
          >
            <QrCode className="size-4" />
            Scan attendance
          </Link>
        ) : null}
        {sheetsOn ? <SyncServiceButton serviceId={service.id} /> : null}
        {canUpdate ? (
            <Link
              href={`/services/${service.id}/edit`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
        ) : null}
        {canDelete ? (
            <DeleteServiceButton id={service.id} name={service.name} />
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <InfoTile
          label="When"
          value={formatDateTime(service.scheduledAt)}
          icon={CalendarDays}
        />
        <InfoTile
          label="Location"
          value={service.location ?? "—"}
          icon={MapPin}
        />
        <InfoTile
          label="Total Attendance"
          value={total}
          icon={Users}
          accent
          numeric
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Badge variant="secondary">{SERVICE_TYPE_LABELS[service.type]}</Badge>
        {service.notes ? (
          <span className="text-sm text-muted-foreground">{service.notes}</span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendees</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            ctx={ctx}
            caption="Members who scanned in to this service"
            columns={columns}
            rows={attendees}
            rowKey={(row) => row.id}
            total={matching}
            framed={false}
            columnVisibility={false}
            search={{
              placeholder: "Search attendees…",
              label: "Search attendees by name",
            }}
            empty={{
              title: "No one scanned in yet.",
              action: (
                <Link
                  href={`/scan?service=${service.id}`}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <QrCode className="size-4" />
                  Start scanning
                </Link>
              ),
            }}
            emptyFiltered={{ title: "No attendees match your search" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
