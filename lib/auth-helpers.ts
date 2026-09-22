import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import type { PermissionKey } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { verifiedUserId } from "@/lib/supabase/verify";

/** The signed-in staff member: Supabase identity joined to their profile row. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: { id: string; name: string };
  permissions: PermissionKey[];
  mustChangePassword: boolean;
};

/**
 * Returns the signed-in user, or redirects to /login if there is none.
 *
 * Identity comes from Supabase Auth; the role lives in our own `users` table,
 * so this reads both. The token is verified, not merely decoded — see
 * lib/supabase/verify.ts.
 *
 * Memoised with React `cache()` for the duration of a request. The layout and
 * the page each call this, as does every server action, and without memoising
 * a single navigation paid for the identity check and the profile query twice
 * over — a cost that used to be two extra network round trips deep.
 */
export const requireUser = cache(async function requireUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const userId = await verifiedUserId(supabase);

  if (!userId) {
    redirect("/login");
  }

  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .limit(1);

  // Authenticated in Supabase but with no profile row — an account created
  // outside the admin screens. Refuse rather than guess a role, since role is
  // what every access check downstream depends on.
  //
  // Not /login: proxy.ts bounces authenticated users off that route to
  // /dashboard, which calls this again and loops. /no-access is a terminal page
  // that never calls requireUser and offers a client-side sign-out.
  if (!profile) {
    redirect("/no-access");
  }

  const assignedPermissions = await db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, profile.roleId));

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: { id: profile.roleId, name: profile.roleName },
    permissions: assignedPermissions.map(({ key }) => key as PermissionKey),
    mustChangePassword: profile.mustChangePassword,
  };
});

/**
 * Ensures the signed-in user has the requested permission. Every page and
 * action performs its own check; hiding a UI control is not authorization.
 */
export async function requirePermission(
  permission: PermissionKey,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) {
    redirect("/no-access");
  }
  return user;
}

export function hasPermission(
  user: Pick<SessionUser, "permissions">,
  permission: PermissionKey,
) {
  return user.permissions.includes(permission);
}

export function hasAnyPermission(
  user: Pick<SessionUser, "permissions">,
  permissions: readonly PermissionKey[],
) {
  return permissions.some((permission) => hasPermission(user, permission));
}
