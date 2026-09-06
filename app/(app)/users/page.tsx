import Link from "next/link";
import { asc } from "drizzle-orm";
import { Pencil } from "lucide-react";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { USER_ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import { PageHeader } from "@/components/patterns/page-header";
import { TableCard } from "@/components/patterns/table-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function UsersPage() {
  const currentUser = await requireRole(["admin"]);

  const staff = await db.select().from(users).orderBy(asc(users.name));

  return (
    <>
      <PageHeader
        title="Staff Users"
        description="People who can log in to manage members and record attendance."
      >
        <CreateUserDialog />
      </PageHeader>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((u) => {
              const isSelf = u.id === currentUser.id;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          {u.name}
                          {isSelf ? (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          ) : null}
                        </div>
                        {/* Stands in for the Email column, which is hidden on
                            small screens. */}
                        <div className="text-xs text-muted-foreground sm:hidden">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={u.role === "admin" ? "default" : "secondary"}
                    >
                      {USER_ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.mustChangePassword ? (
                      <Badge variant="warning">Must reset password</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Link
                        href={`/users/${u.id}/edit`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon-sm" }),
                        )}
                        aria-label={`Edit ${u.name}`}
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <ResetPasswordButton id={u.id} name={u.name} />
                      {isSelf ? null : (
                        <DeleteUserButton
                          id={u.id}
                          name={u.name}
                          currentUserId={currentUser.id}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}
