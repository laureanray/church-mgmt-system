import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Pencil, QrCode, Users } from "lucide-react";

import { db } from "@/db";
import { attendance, services } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth-helpers";
import { SERVICE_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatTime, initials } from "@/lib/format";
import { getSheetsConfig } from "@/lib/sheets";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/patterns/back-link";
import { EmptyState } from "@/components/patterns/empty-state";
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
  const sheetsOn = manage ? Boolean(await getSheetsConfig()) : false;

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/services" label="Back to services" />

      <PageHeader title={service.name}>
        <Link
          href={`/scan?service=${service.id}`}
          className={cn(buttonVariants())}
        >
          <QrCode className="size-4" />
          Scan attendance
        </Link>
        {sheetsOn ? <SyncServiceButton serviceId={service.id} /> : null}
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
          value={attendees.length}
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
          {attendees.length === 0 ? (
            <EmptyState
              variant="inline"
              title="No one scanned in yet."
              action={
                <Link
                  href={`/scan?service=${service.id}`}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <QrCode className="size-4" />
                  Start scanning
                </Link>
              }
            />
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
