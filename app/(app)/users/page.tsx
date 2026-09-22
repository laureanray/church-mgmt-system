import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { Pencil, UserCog } from "lucide-react";

import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
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
import { createUser } from "./actions";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import { DataTable } from "@/components/patterns/data-table";
import type { DataTableColumn } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type StaffRow = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  mustChangePassword: boolean;
};

const SORT_COLUMNS = {
  name: users.name,
  email: users.email,
  role: roles.name,
  status: users.mustChangePassword,
} as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const currentUser = await requirePermission("users.view");
  const roleOptions = await db
    .select({ value: roles.id, label: roles.name })
    .from(roles)
    .orderBy(asc(roles.name));

  const ctx = tableContext("/users", await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    filterKeys: ["role"],
    defaultSort: "name",
  });
  const { state } = ctx;

  const selectedRoles = allowedValues(
    state.filters.role,
    roleOptions.map(({ value }) => value),
  );
  const where = and(
    state.query
      ? or(
          ilike(users.name, `%${state.query}%`),
          ilike(users.email, `%${state.query}%`),
        )
      : undefined,
    selectedRoles.length ? inArray(users.roleId, selectedRoles) : undefined,
  );

  const sortColumn = SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS];
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        roleName: roles.name,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
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
        <Badge variant={u.roleId === "admin" ? "default" : "secondary"}>
          {u.roleName}
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
          {hasPermission(currentUser, "users.update") ? (
            <Link
              href={`/users/${u.id}/edit`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
              aria-label={`Edit ${u.name}`}
            >
              <Pencil className="size-4" />
            </Link>
          ) : null}
          {hasPermission(currentUser, "users.reset_password") ? (
            <ResetPasswordButton id={u.id} name={u.name} />
          ) : null}
          {u.id !== currentUser.id && hasPermission(currentUser, "users.delete") ? (
            <DeleteUserButton
              id={u.id}
              name={u.name}
              currentUserId={currentUser.id}
            />
          ) : null}
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
        {hasPermission(currentUser, "users.create") ? (
          <CreateUserDialog roles={roleOptions} action={createUser} />
        ) : null}
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
            options: roleOptions,
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
