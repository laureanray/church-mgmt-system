import Link from "next/link";
import { desc, eq, gte } from "drizzle-orm";
import {
  CalendarDays,
  CalendarPlus,
  QrCode,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

import { db } from "@/db";
import { attendance, members, services } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "@/lib/constants";
import { tableContext } from "@/lib/data-table";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RecentServiceRow = {
  id: string;
  name: string;
  type: (typeof SERVICE_TYPES)[number];
  scheduledAt: Date;
  attendeeCount: number;
};

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  // This async Server Component reads the clock after request-bound authentication.
  // eslint-disable-next-line react-hooks/purity
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [membersCount, servicesCount, attendanceCount, weekCheckins, recent] =
    await Promise.all([
      db.$count(members),
      db.$count(services),
      db.$count(attendance),
      db.$count(attendance, gte(attendance.checkedInAt, weekAgo)),
      // Counted per service rather than by joining and grouping the whole
      // attendance table: only five rows survive the LIMIT, so five indexed
      // counts beat aggregating every check-in ever recorded to discard all
      // but five of the groups.
      db
        .select({
          id: services.id,
          name: services.name,
          type: services.type,
          scheduledAt: services.scheduledAt,
          attendeeCount: db.$count(
            attendance,
            eq(attendance.serviceId, services.id),
          ),
        })
        .from(services)
        .orderBy(desc(services.scheduledAt))
        .limit(5),
    ]);

  const manage = hasPermission(user, "members.create");

  // A fixed five-row summary: no state to read, but the same table so the
  // dashboard's rows look and behave like every other list in the app.
  const recentCtx = tableContext("/dashboard", {});

  const recentColumns: DataTableColumn<RecentServiceRow>[] = [
    {
      id: "name",
      header: "Service",
      cellClassName: "font-medium",
      cell: (s) => (
        <Link href={`/services/${s.id}`} className="hover:underline">
          {s.name}
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "sm",
      cell: (s) => <Badge variant="secondary">{SERVICE_TYPE_LABELS[s.type]}</Badge>,
    },
    {
      id: "date",
      header: "Date",
      cellClassName: "text-muted-foreground",
      cell: (s) => formatDateTime(s.scheduledAt),
    },
    {
      id: "attendance",
      header: "Attendance",
      align: "end",
      numeric: true,
      cell: (s) => s.attendeeCount,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name?.split(" ")[0] ?? "there"}`}
        description="Here's what's happening in your church."
      >
        <Link href="/scan" className={cn(buttonVariants())}>
          <QrCode className="size-4" />
          Scan Attendance
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={membersCount} icon={Users} />
        <StatCard label="Services" value={servicesCount} icon={CalendarDays} />
        <StatCard
          label="Total Check-ins"
          value={attendanceCount}
          icon={TrendingUp}
        />
        <StatCard
          label="Check-ins (7 days)"
          value={weekCheckins}
          icon={TrendingUp}
          accent
        />
      </div>

      {manage ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/members/new"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <UserPlus className="size-4" />
            Add Member
          </Link>
          <Link
            href="/services/new"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <CalendarPlus className="size-4" />
            Add Service
          </Link>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent Services</CardTitle>
          {/* CardHeader is a grid, so a trailing element has to be a CardAction
              to land in the second column. `flex-row justify-between` is inert
              here and silently wraps the link under the title. */}
          <CardAction>
            <Link
              href="/services"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable
            ctx={recentCtx}
            caption="The five most recent services"
            columns={recentColumns}
            rows={recent}
            rowKey={(s) => s.id}
            framed={false}
            columnVisibility={false}
            empty={{
              title: "No services yet",
              description: manage ? (
                <Link href="/services/new" className="underline">
                  Create one
                </Link>
              ) : undefined,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
