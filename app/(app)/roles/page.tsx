import Link from "next/link";
import { redirect } from "next/navigation";
import {
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";
import { Pencil, Plus, ShieldCheck } from "lucide-react";

import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import { DataTable, type DataTableColumn } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { DeleteRoleButton } from "@/components/roles/delete-role-button";
import { deleteRole } from "./actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import {
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
};

const SORT_COLUMNS = {
  name: roles.name,
  permissions: countDistinct(rolePermissions.permissionKey),
  users: countDistinct(users.id),
} as const;

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const currentUser = await requirePermission("roles.view");
  const ctx = tableContext("/roles", await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    defaultSort: "name",
  });
  const { state } = ctx;
  const where = state.query
    ? or(
        ilike(roles.name, `%${state.query}%`),
        ilike(roles.description, `%${state.query}%`),
      )
    : undefined;
  const sortColumn = SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS];
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        permissionCount: countDistinct(rolePermissions.permissionKey),
        userCount: countDistinct(users.id),
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(users, eq(users.roleId, roles.id))
      .where(where)
      .groupBy(roles.id)
      .orderBy(direction(sortColumn), asc(roles.id))
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(roles).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const columns: DataTableColumn<RoleRow>[] = [
    {
      id: "name",
      header: "Role",
      sortKey: "name",
      hideable: false,
      cell: (role) => (
        <div>
          <div className="flex items-center gap-2 font-medium">
            {role.name}
            {role.isSystem ? <Badge variant="outline">Built in</Badge> : null}
          </div>
          {role.description ? (
            <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
              {role.description}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "permissions",
      header: "Permissions",
      sortKey: "permissions",
      numeric: true,
      cell: (role) => role.permissionCount,
    },
    {
      id: "users",
      header: "Staff",
      sortKey: "users",
      numeric: true,
      cell: (role) => role.userCount,
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      hideable: false,
      align: "end",
      width: "w-20",
      cell: (role) => (
        <div className="flex items-center justify-end gap-0.5">
          {hasPermission(currentUser, "roles.update") ? (
            <Link
              href={`/roles/${role.id}/edit`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
              aria-label={`${role.id === "admin" ? "View" : "Edit"} ${role.name}`}
            >
              <Pencil className="size-4" />
            </Link>
          ) : null}
          {!role.isSystem &&
          role.userCount === 0 &&
          hasPermission(currentUser, "roles.delete") ? (
            <DeleteRoleButton
              name={role.name}
              action={deleteRole.bind(null, role.id)}
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Define module access once, then assign a role to each staff user."
      >
        {hasPermission(currentUser, "roles.create") ? (
          <Link href="/roles/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            Create role
          </Link>
        ) : null}
      </PageHeader>
      <DataTable
        ctx={ctx}
        caption="Staff roles"
        columns={columns}
        rows={rows}
        rowKey={(role) => role.id}
        total={matching}
        search={{ placeholder: "Search roles…", label: "Search roles" }}
        empty={{
          icon: ShieldCheck,
          title: "No roles yet",
          description: "Create a role to grant staff access.",
        }}
        emptyFiltered={{ icon: ShieldCheck, title: "No roles match your search" }}
      />
    </>
  );
}
