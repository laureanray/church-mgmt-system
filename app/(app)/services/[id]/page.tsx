import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Pencil,
  QrCode,
  Users,
} from "lucide-react";

import { db } from "@/db";
import { attendance, services } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth-helpers";
import { SERVICE_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeleteServiceButton } from "@/components/services/delete-service-button";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const service = await db.query.services.findFirst({
    where: eq(services.id, id),
  });
  if (!service) notFound();

  const attendees = await db.query.attendance.findMany({
    where: eq(attendance.serviceId, service.id),
    with: { member: true },
    orderBy: desc(attendance.checkedInAt),
  });

  const manage = canManage(user.role);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/services"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to services
      </Link>

      <PageHeader title={service.name}>
        <Link
          href={`/scan?service=${service.id}`}
          className={cn(buttonVariants())}
        >
          <QrCode className="size-4" />
          Scan attendance
        </Link>
        {manage ? (
          <>
            <Link
              href={`/services/${service.id}/edit`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
            <DeleteServiceButton id={service.id} name={service.name} />
          </>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-muted">
              <CalendarDays className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">When</p>
              <p className="text-sm font-medium">
                {formatDateTime(service.scheduledAt)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-muted">
              <MapPin className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-medium">{service.location ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
              <Users className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Attendance</p>
              <p className="text-sm font-medium tabular-nums">
                {attendees.length}
              </p>
            </div>
          </CardContent>
        </Card>
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
          {attendees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No one scanned in yet.
              </p>
              <Link
                href={`/scan?service=${service.id}`}
                className={cn(buttonVariants({ size: "sm" }), "mt-3")}
              >
                <QrCode className="size-4" />
                Start scanning
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Checked In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendees.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/members/${row.memberId}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <Avatar className="size-7">
                          <AvatarFallback className="text-xs">
                            {initials(row.member?.fullName ?? "?")}
                          </AvatarFallback>
                        </Avatar>
                        {row.member?.fullName ?? "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatTime(row.checkedInAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
