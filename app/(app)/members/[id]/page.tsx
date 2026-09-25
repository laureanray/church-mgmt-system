import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { CalendarCheck, Pencil } from "lucide-react";

import { promoteMemberToLeader } from "@/app/(app)/cell-groups/actions";
import { db } from "@/db";
import {
  attendance,
  auditLog,
  cellGroups,
  members,
  ministries,
  ministryMembers,
  services,
  users,
} from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { GENDER_LABELS, MARITAL_STATUS_LABELS } from "@/lib/constants";
import {
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { generateQrDataUrl } from "@/lib/qr";
import { cn } from "@/lib/utils";
import {
  AUDIT_SORT_KEYS,
  AuditLogTable,
  toAuditRow,
} from "@/components/audit/audit-log-table";
import { BackLink } from "@/components/patterns/back-link";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { DetailList, DetailRow } from "@/components/patterns/detail-list";
import { LinkTabs } from "@/components/patterns/link-tabs";
import { PageContainer } from "@/components/patterns/page-container";
import { FormSelect } from "@/components/form/form-select";
import { Input } from "@/components/ui/input";
import { DeleteMemberButton } from "@/components/members/delete-member-button";
import { MemberMinistries } from "@/components/ministries/member-ministries";
import { canViewMinistry } from "@/lib/ministry-access";
import { MemberQr } from "@/components/members/member-qr";
import { MemberStatusBadge } from "@/components/members/member-status-badge";
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

type HistoryRow = {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  checkedInAt: Date;
};

const HISTORY_SORT_COLUMNS = {
  service: services.name,
  date: attendance.checkedInAt,
} as const;

const AUDIT_SORT_COLUMNS = {
  at: auditLog.at,
  action: auditLog.action,
} as const satisfies Record<(typeof AUDIT_SORT_KEYS)[number], unknown>;

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("members.view");
  const { id } = await params;

  const member = await db.query.members.findFirst({
    where: eq(members.id, id),
    with: { cellGroup: true },
  });
  if (!member) notFound();

  const query = await searchParams;
  // The audit history is a second tab, offered only to those who may read the
  // log. `?tab=history` selects it; anything else is the attendance tab.
  const canViewAudit = hasPermission(user, "audit.view");
  const showAudit = canViewAudit && query.tab === "history";

  // The page carries two independent lists, so this table namespaces its state
  // and a sort here cannot collide with anything else on the route.
  const historyCtx = tableContext(`/members/${member.id}`, query, {
    prefix: "att",
    sortKeys: Object.keys(HISTORY_SORT_COLUMNS),
    defaultSort: "date",
    defaultDirection: "desc",
    defaultPerPage: 10,
  });
  const historyState = historyCtx.state;
  const attended = eq(attendance.memberId, member.id);
  const historyDirection = historyState.direction === "asc" ? asc : desc;

  const auditCtx = tableContext(`/members/${member.id}`, query, {
    prefix: "log",
    sortKeys: [...AUDIT_SORT_KEYS],
    defaultSort: "at",
    defaultDirection: "desc",
    defaultPerPage: 10,
  });
  const auditState = auditCtx.state;
  const aboutMember = and(
    eq(auditLog.entity, "member"),
    eq(auditLog.entityId, member.id),
  );
  const auditDirection = auditState.direction === "asc" ? asc : desc;
  // One batch: the audit count feeds the History tab's badge even while the
  // attendance tab is showing, and only the visible panel's rows are fetched.
  const canViewStaff = hasPermission(user, "users.view");
  const [
    qrDataUrl,
    history,
    attendedCount,
    auditRows,
    auditCount,
    memberMinistries,
    login,
  ] =
    await Promise.all([
      generateQrDataUrl(member.qrToken),
      showAudit
        ? []
        : db
            .select({
              id: attendance.id,
              serviceId: services.id,
              serviceName: services.name,
              checkedInAt: attendance.checkedInAt,
            })
            .from(attendance)
            .leftJoin(services, eq(services.id, attendance.serviceId))
            .where(attended)
            .orderBy(
              historyDirection(
                HISTORY_SORT_COLUMNS[
                  historyState.sort as keyof typeof HISTORY_SORT_COLUMNS
                ],
              ),
              asc(attendance.id),
            )
            .limit(historyState.perPage)
            .offset(tableOffset(historyState)),
      db.$count(attendance, attended),
      showAudit
        ? db
            .select({
              id: auditLog.id,
              at: auditLog.at,
              actorName: users.name,
              action: auditLog.action,
              entity: auditLog.entity,
              summary: auditLog.summary,
              before: auditLog.before,
              after: auditLog.after,
            })
            .from(auditLog)
            .leftJoin(users, eq(users.id, auditLog.actorId))
            .where(aboutMember)
            .orderBy(
              auditDirection(
                AUDIT_SORT_COLUMNS[
                  auditState.sort as keyof typeof AUDIT_SORT_COLUMNS
                ],
              ),
              desc(auditLog.at),
              asc(auditLog.id),
            )
            .limit(auditState.perPage)
            .offset(tableOffset(auditState))
        : [],
      canViewAudit ? db.$count(auditLog, aboutMember) : 0,
      db
        .select({
          id: ministries.id,
          name: ministries.name,
          position: ministryMembers.position,
          active: ministries.active,
        })
        .from(ministryMembers)
        .innerJoin(ministries, eq(ministries.id, ministryMembers.ministryId))
        .where(eq(ministryMembers.memberId, member.id))
        .orderBy(asc(ministries.name)),
      canViewStaff && member.userId
        ? db.query.users.findFirst({
            where: eq(users.id, member.userId),
            columns: { id: true, email: true },
          })
        : Promise.resolve(undefined),
    ]);

  const clampedHistoryPage = overRunPage(historyState, attendedCount);
  if (!showAudit && clampedHistoryPage !== null) {
    redirect(tableHref(historyCtx, { page: clampedHistoryPage }));
  }

  const clampedAuditPage = showAudit ? overRunPage(auditState, auditCount) : null;
  if (clampedAuditPage !== null) {
    redirect(tableHref(auditCtx, { page: clampedAuditPage }));
  }

  const historyColumns: DataTableColumn<HistoryRow>[] = [
    {
      id: "service",
      header: "Service",
      sortKey: "service",
      hideable: false,
      cellClassName: "font-medium",
      cell: (row) =>
        row.serviceId ? (
          <Link href={`/services/${row.serviceId}`} className="hover:underline">
            {row.serviceName}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "date",
      header: "Checked In",
      label: "Checked in",
      sortKey: "date",
      sortDirection: "desc",
      cellClassName: "text-muted-foreground",
      cell: (row) => formatDateTime(row.checkedInAt),
    },
  ];

  const canUpdate = hasPermission(user, "members.update");
  const canDelete = hasPermission(user, "members.delete");
  const canCreateCellGroup = hasPermission(user, "cell_groups.create");

  const allCells = canUpdate || canCreateCellGroup
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
    <PageContainer>
      <BackLink href="/members" label="Back to members" />

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
              <MemberStatusBadge status={member.status} />
              {member.gender ? <span>{GENDER_LABELS[member.gender]}</span> : null}
              {member.maritalStatus ? (
                <Badge variant="secondary">
                  {MARITAL_STATUS_LABELS[member.maritalStatus]}
                </Badge>
              ) : null}
              <Badge variant="outline" className="gap-1">
                <CalendarCheck className="size-3" />
                {attendedCount} attended
              </Badge>
            </div>
          </div>
        </div>

        {canUpdate || canDelete ? (
          <div className="flex items-center gap-2">
            {canUpdate ? (
              <Link
                href={`/members/${member.id}/edit`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Pencil className="size-4" />
                Edit
              </Link>
            ) : null}
            {canDelete ? (
              <DeleteMemberButton id={member.id} name={member.fullName} />
            ) : null}
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
              <DetailList>
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
              </DetailList>
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

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Ministries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MemberMinistries
                ministries={memberMinistries}
                linkableIds={memberMinistries
                  .filter((m) => canViewMinistry(user, m.id))
                  .map((m) => m.id)}
              />
              {login ? (
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  Signs in as{" "}
                  {hasPermission(user, "users.update") ? (
                    <Link
                      href={`/users/${login.id}/edit`}
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      {login.email}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{login.email}</span>
                  )}
                  , so these ministries add to their role&apos;s access.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {canCreateCellGroup && ledCell ? (
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

          {canCreateCellGroup && !ledCell ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Promote to Leader</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={promoteMemberToLeader} className="space-y-3">
                  <input type="hidden" name="memberId" value={member.id} />
                  <Input
                    name="name"
                    required
                    aria-label="New cell group name"
                    placeholder="New cell group name"
                    defaultValue={`${member.fullName}'s Cell`}
                  />
                  <FormSelect
                    name="parentCellGroupId"
                    clearLabel="Upline: top level"
                    options={parentCells.map((c) => ({
                      value: c.id,
                      label: `Upline: ${c.name}`,
                    }))}
                  />
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
          {canViewAudit ? (
            <LinkTabs
              label="Member activity"
              tabs={[
                {
                  href: `/members/${member.id}`,
                  label: "Attendance",
                  count: attendedCount,
                  active: !showAudit,
                },
                {
                  href: `/members/${member.id}?tab=history`,
                  label: "History",
                  count: auditCount,
                  active: showAudit,
                },
              ]}
            />
          ) : (
            <CardTitle className="text-base">Attendance History</CardTitle>
          )}
        </CardHeader>
        <CardContent>
          {showAudit ? (
            <AuditLogTable
              ctx={auditCtx}
              rows={auditRows.map(toAuditRow)}
              total={auditCount}
              variant="record"
            />
          ) : (
            <DataTable
              ctx={historyCtx}
              caption="Services this member has attended"
              columns={historyColumns}
              rows={history}
              rowKey={(row) => row.id}
              total={attendedCount}
              framed={false}
              columnVisibility={false}
              empty={{ title: "No attendance recorded yet." }}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
