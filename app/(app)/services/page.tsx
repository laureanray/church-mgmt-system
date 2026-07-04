import Link from "next/link";
import { and, asc, count, desc, eq, gte } from "drizzle-orm";
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
import { canManage, requireUser } from "@/lib/auth-helpers";
import { DAYS_OF_WEEK, SERVICE_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatTimeOfDay } from "@/lib/format";
import { topUpAllSchedules } from "@/lib/occurrences";
import { cn } from "@/lib/utils";
import { DeleteScheduleButton } from "@/components/services/delete-schedule-button";
import { ScheduleActiveToggle } from "@/components/services/schedule-active-toggle";
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

export default async function ServicesPage() {
  const user = await requireUser();
  const manage = canManage(user.role);

  // Keep upcoming occurrences populated for all active schedules.
  try {
    await topUpAllSchedules();
  } catch {
    // non-fatal: page still renders existing data
  }

  const now = new Date();

  const [schedules, occurrences] = await Promise.all([
    db
      .select({
        id: serviceSchedules.id,
        name: serviceSchedules.name,
        type: serviceSchedules.type,
        dayOfWeek: serviceSchedules.dayOfWeek,
        timeOfDay: serviceSchedules.timeOfDay,
        location: serviceSchedules.location,
        active: serviceSchedules.active,
        upcoming: count(services.id),
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
        attendeeCount: count(attendance.id),
      })
      .from(services)
      .leftJoin(attendance, eq(attendance.serviceId, services.id))
      .groupBy(services.id)
      .orderBy(desc(services.scheduledAt)),
  ]);

  return (
    <>
      <PageHeader
        title="Services"
        description="Recurring schedules and individual services you track attendance for."
      >
        {manage ? (
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
      {schedules.length > 0 || manage ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="size-4 text-muted-foreground" />
              Recurring Schedules
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No recurring schedules yet.
                </p>
                {manage ? (
                  <Link
                    href="/services/schedules/new"
                    className={cn(buttonVariants({ size: "sm" }), "mt-3")}
                  >
                    <CalendarPlus className="size-4" />
                    Create a weekly service
                  </Link>
                ) : null}
              </div>
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
                      {s.upcoming} upcoming
                    </span>

                    {manage ? (
                      <div className="flex items-center gap-1">
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
                        <DeleteScheduleButton id={s.id} name={s.name} />
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
          {occurrences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                <CalendarDays className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">No services yet</h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Create a schedule or a one-off service, then scan members in.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/services/${s.id}`}
                        className="flex items-center gap-1.5 hover:underline"
                      >
                        {s.scheduleId ? (
                          <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
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
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {s.location ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="size-3.5 text-muted-foreground" />
                        {s.attendeeCount}
                      </span>
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
