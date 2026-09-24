import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import type { PermissionKey } from "@/lib/permissions";
import { verifyAccessToken } from "@/lib/supabase/verify";

/*
 * Who a caller is, however they proved it. The web app arrives with a session
 * cookie (requireUser in auth-helpers.ts); the HTTP API with a bearer token
 * (userFromAuthorizationHeader below). Both end at loadSessionUser, so a staff
 * member has the same role and permissions through either door.
 */

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
 * The staff member a bearer token belongs to, or null — for the HTTP API,
 * whose callers carry an `Authorization` header rather than a session cookie.
 * Unlike requireUser this never redirects: an API caller is told 401, not sent
 * to a sign-in page it cannot render.
 */
export async function userFromAuthorizationHeader(
  header: string | null,
): Promise<SessionUser | null> {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;

  const userId = await verifyAccessToken(token);
  return userId ? loadSessionUser(userId) : null;
}

/**
 * Supabase identity joined to our profile, role and permissions. Null when the
 * profile row is missing, however the caller authenticated.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
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

  if (!profile) return null;

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
}

