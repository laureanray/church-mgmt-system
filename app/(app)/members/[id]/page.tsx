import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, Pencil } from "lucide-react";

import { promoteMemberToLeader } from "@/app/(app)/cell-groups/actions";
import { db } from "@/db";
import { attendance, cellGroups, members } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth-helpers";
import { GENDER_LABELS, MARITAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { generateQrDataUrl } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { DeleteMemberButton } from "@/components/members/delete-member-button";
import { MemberQr } from "@/components/members/member-qr";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{value || "—"}</dd>
    </div>
  );
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const member = await db.query.members.findFirst({
    where: eq(members.id, id),
    with: { cellGroup: true },
  });
  if (!member) notFound();

  const [qrDataUrl, history] = await Promise.all([
    generateQrDataUrl(member.qrToken),
    db.query.attendance.findMany({
      where: eq(attendance.memberId, member.id),
      with: { service: true },
      orderBy: desc(attendance.checkedInAt),
      limit: 50,
    }),
  ]);

  const manage = canManage(user.role);

  const allCells = manage
    ? await db
        .select({
          id: cellGroups.id,
          name: cellGroups.name,
          leaderId: cellGroups.leaderId,
        })
        .from(cellGroups)
        .orderBy(asc(cellGroups.name))
    : [];

  // A member leads at most one cell, so promoting an existing leader would
  // orphan their first cell. Offer the form only when they lead nothing yet.
  const ledCell = allCells.find((c) => c.leaderId === member.id) ?? null;
  const parentCells = allCells;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/members"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to members
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials(member.fullName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {member.fullName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {member.gender ? <span>{GENDER_LABELS[member.gender]}</span> : null}
              {member.maritalStatus ? (
                <Badge variant="secondary">
                  {MARITAL_STATUS_LABELS[member.maritalStatus]}
                </Badge>
              ) : null}
              <Badge variant="outline" className="gap-1">
                <CalendarCheck className="size-3" />
                {history.length} attended
              </Badge>
            </div>
          </div>
        </div>

        {manage ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/members/${member.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
            <DeleteMemberButton id={member.id} name={member.fullName} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Member Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <DetailRow
                  label="Birthdate"
                  value={formatDate(member.birthdate)}
                />
                <DetailRow
                  label="Spiritual Birthday"
                  value={formatDate(member.spiritualBirthday)}
                />
                <DetailRow
                  label="Kaanib ng IRM since"
                  value={member.memberSinceYear ?? "—"}
                />
                <DetailRow
                  label="Name of Spouse"
                  value={member.spouseName}
                />
                <DetailRow
                  label="Wedding Anniversary"
                  value={formatDate(member.weddingAnniversary)}
                />
                <DetailRow label="Father's Name" value={member.fatherName} />
                <DetailRow label="Mother's Name" value={member.motherName} />
                <DetailRow
                  label="Contact Number"
                  value={member.contactNumber}
                />
                <DetailRow label="Home Address" value={member.homeAddress} />
                <DetailRow
                  label="Educational Level"
                  value={member.educationalLevel}
                />
                <DetailRow label="Occupation" value={member.occupation} />
                <DetailRow
                  label="Cell Group"
                  value={
                    member.cellGroup ? (
                      <Link
                        href={`/cell-groups/${member.cellGroup.id}`}
                        className="hover:underline"
                      >
                        {member.cellGroup.name}
                      </Link>
                    ) : (
                      <Badge variant="outline">Not in a cell group</Badge>
                    )
                  }
                />
              </dl>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance QR Code</CardTitle>
            </CardHeader>
            <CardContent>
              <MemberQr
                dataUrl={qrDataUrl}
                name={member.fullName}
                token={member.qrToken}
              />
              <Separator className="my-4" />
              <p className="text-center text-xs text-muted-foreground">
                Scan this code at the entrance to record attendance.
              </p>
            </CardContent>
          </Card>

          {manage && ledCell ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Cell Leader</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Already leads{" "}
                  <Link
                    href={`/cell-groups/${ledCell.id}`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {ledCell.name}
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          ) : null}

          {manage && !ledCell ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Promote to Leader</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={promoteMemberToLeader} className="space-y-3">
                  <input type="hidden" name="memberId" value={member.id} />
                  <input
                    name="name"
                    required
                    placeholder="New cell group name"
                    defaultValue={`${member.fullName}'s Cell`}
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <select
                    name="parentCellGroupId"
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none"
                    defaultValue=""
                  >
                    <option value="">Upline: top level</option>
                    {parentCells.map((c) => (
                      <option key={c.id} value={c.id}>
                        Upline: {c.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="outline">
                    Create cell &amp; make leader
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Attendance History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No attendance recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Checked In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.service ? (
                        <Link
                          href={`/services/${row.service.id}`}
                          className="hover:underline"
                        >
                          {row.service.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(row.checkedInAt)}
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
