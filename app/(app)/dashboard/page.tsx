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
import { canManage, requireUser } from "@/lib/auth-helpers";
import { SERVICE_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-lg",
            accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
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

  const manage = canManage(user.role);

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
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Services</CardTitle>
          <Link
            href="/services"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No services yet.{" "}
              {manage ? (
                <Link href="/services/new" className="underline">
                  Create one
                </Link>
              ) : null}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/services/${s.id}`}
                        className="hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">
                        {SERVICE_TYPE_LABELS[s.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(s.scheduledAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.attendeeCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
