import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, ilike, inArray, or } from "drizzle-orm";
import { Pencil, UserCog } from "lucide-react";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { USER_ROLES, USER_ROLE_LABELS } from "@/lib/constants";
import {
  allowedValues,
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type StaffRow = typeof users.$inferSelect;

const SORT_COLUMNS = {
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.mustChangePassword,
} as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const currentUser = await requireRole(["admin"]);

  const ctx = tableContext("/users", await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    filterKeys: ["role"],
    defaultSort: "name",
  });
  const { state } = ctx;

  const roles = allowedValues(state.filters.role, USER_ROLES);
  const where = and(
    state.query
      ? or(
          ilike(users.name, `%${state.query}%`),
          ilike(users.email, `%${state.query}%`),
        )
      : undefined,
    roles.length ? inArray(users.role, roles) : undefined,
  );

  const sortColumn = SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS];
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(direction(sortColumn), asc(users.id))
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(users).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const columns: DataTableColumn<StaffRow>[] = [
    {
      id: "name",
      header: "Name",
      sortKey: "name",
      hideable: false,
      cell: (u) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {initials(u.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              {u.name}
              {u.id === currentUser.id ? (
                <Badge variant="outline" className="text-xs">
                  You
                </Badge>
              ) : null}
            </div>
            {/* Stands in for the Email column, which is hidden on small screens. */}
            <div className="text-xs text-muted-foreground sm:hidden">
              {u.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortKey: "email",
      hideBelow: "sm",
      cellClassName: "text-muted-foreground",
      cell: (u) => u.email,
    },
    {
      id: "role",
      header: "Role",
      sortKey: "role",
      cell: (u) => (
        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
          {USER_ROLE_LABELS[u.role]}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortKey: "status",
      hideBelow: "md",
      cell: (u) =>
        u.mustChangePassword ? (
          <Badge variant="warning">Must reset password</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Active</span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      hideable: false,
      align: "end",
      width: "w-28",
      cell: (u) => (
        <div className="flex items-center justify-end gap-0.5">
          <Link
            href={`/users/${u.id}/edit`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label={`Edit ${u.name}`}
          >
            <Pencil className="size-4" />
          </Link>
          <ResetPasswordButton id={u.id} name={u.name} />
          {u.id === currentUser.id ? null : (
            <DeleteUserButton
              id={u.id}
              name={u.name}
              currentUserId={currentUser.id}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Staff Users"
        description="People who can log in to manage members and record attendance."
      >
        <CreateUserDialog />
      </PageHeader>

      <DataTable
        ctx={ctx}
        caption="Staff users"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        total={matching}
        search={{
          placeholder: "Search name or email…",
          label: "Search staff by name or email",
        }}
        facets={[
          {
            id: "role",
            label: "Role",
            options: USER_ROLES.map((value) => ({
              value,
              label: USER_ROLE_LABELS[value],
            })),
          },
        ]}
        empty={{
          icon: UserCog,
          title: "No staff users yet",
          description: "Invite someone who should be able to sign in.",
        }}
        emptyFiltered={{
          icon: UserCog,
          title: "No staff match your search",
        }}
      />
    </>
  );
}
