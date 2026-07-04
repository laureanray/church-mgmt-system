import { asc } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { USER_ROLE_LABELS } from "@/lib/constants";
import { formatDate, initials } from "@/lib/format";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

  const staff = await db
    .select()
    .from(users)
    .orderBy(asc(users.name));

  return (
    <>
      <PageHeader
        title="Staff Users"
        description="People who can log in to manage members and record attendance."
      >
        <CreateUserDialog />
      </PageHeader>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Added</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    {u.name}
                    {u.id === currentUser.id ? (
                      <Badge variant="outline" className="text-xs">
                        You
                      </Badge>
                    ) : null}
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
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {formatDate(u.createdAt.toISOString().slice(0, 10))}
                </TableCell>
                <TableCell className="text-right">
                  {u.id === currentUser.id ? null : (
                    <DeleteUserButton
                      id={u.id}
                      name={u.name}
                      currentUserId={currentUser.id}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
