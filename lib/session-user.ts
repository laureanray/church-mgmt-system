import "server-only";

import { loadUserAccess } from "@/lib/access";
import {
  effectivePermissions,
  type MinistryMembership,
} from "@/lib/ministry-access";
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
  /** The role's permissions plus every active ministry's grants. */
  permissions: PermissionKey[];
  /** The member record this login is linked to, if any. */
  memberId: string | null;
  ministries: MinistryMembership[];
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
 * Supabase identity joined to our profile, role and permissions — including
 * what the linked member's active ministries grant, so a ministry's access is
 * the same through the web app and the API. Null when the profile row is
 * missing, however the caller authenticated. One round trip; see
 * lib/access.ts.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const access = await loadUserAccess(userId);
  if (!access) return null;

  const { profile } = access;
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: { id: profile.roleId, name: profile.roleName },
    permissions: effectivePermissions(access.rolePermissions, access.ministryGrants),
    memberId: access.memberId,
    ministries: access.ministries,
    mustChangePassword: profile.mustChangePassword,
  };
}
