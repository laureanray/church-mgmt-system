import "server-only";

import { eq, sql } from "drizzle-orm";

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
  // One round trip, not two. The permissions ride along as an array rather
  // than being fetched once the role is known, because this runs before every
  // page, every action and every API call: a second sequential query here was
  // a second sequential query everywhere.
  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      roleId: roles.id,
      roleName: roles.name,
      // The FILTER keeps a role with no permissions at `{}`; a bare array_agg
      // over the left join's lone NULL row would return `{NULL}`.
      permissions: sql<string[]>`coalesce(
        array_agg(${rolePermissions.permissionKey})
          filter (where ${rolePermissions.permissionKey} is not null),
        '{}'
      )`,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(users.id, userId))
    .groupBy(users.id, roles.id)
    .limit(1);

  if (!profile) return null;

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: { id: profile.roleId, name: profile.roleName },
    permissions: profile.permissions as PermissionKey[],
    mustChangePassword: profile.mustChangePassword,
  };
}
