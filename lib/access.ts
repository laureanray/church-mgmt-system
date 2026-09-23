import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  members,
  ministries,
  ministryMembers,
  ministryPermissions,
  rolePermissions,
  roles,
  users,
} from "@/db/schema";
import type { MinistryGrant, MinistryMembership } from "@/lib/ministry-access";

export type UserAccess = {
  profile: {
    id: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
    roleId: string;
    roleName: string;
  };
  /** The member record this login belongs to, if one is linked. */
  memberId: string | null;
  rolePermissions: string[];
  /** Active ministries only — an inactive ministry grants nothing. */
  ministries: MinistryMembership[];
  ministryGrants: MinistryGrant[];
};

/**
 * Everything authorization needs to know about one staff user.
 *
 * Every query is keyed by the user id alone, so all of them go out together:
 * one round trip, where reading the profile first and the role's permissions
 * second used to take two. Returns null when there is no profile row.
 */
export async function loadUserAccess(userId: string): Promise<UserAccess | null> {
  const activeMembership = and(
    eq(members.userId, userId),
    eq(ministries.active, true),
  );

  const [[profile], roleGrants, linked, memberships, ministryGrants] =
    await Promise.all([
      db
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
        .limit(1),
      db
        .select({ key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .innerJoin(users, eq(users.roleId, rolePermissions.roleId))
        .where(eq(users.id, userId)),
      db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.userId, userId))
        .limit(1),
      db
        .select({
          id: ministries.id,
          name: ministries.name,
          position: ministryMembers.position,
        })
        .from(ministryMembers)
        .innerJoin(members, eq(members.id, ministryMembers.memberId))
        .innerJoin(ministries, eq(ministries.id, ministryMembers.ministryId))
        .where(activeMembership)
        .orderBy(asc(ministries.name)),
      db
        .select({
          ministryId: ministryPermissions.ministryId,
          permissionKey: ministryPermissions.permissionKey,
        })
        .from(ministryPermissions)
        .innerJoin(
          ministryMembers,
          eq(ministryMembers.ministryId, ministryPermissions.ministryId),
        )
        .innerJoin(members, eq(members.id, ministryMembers.memberId))
        .innerJoin(ministries, eq(ministries.id, ministryPermissions.ministryId))
        .where(activeMembership),
    ]);

  if (!profile) return null;

  return {
    profile,
    memberId: linked[0]?.id ?? null,
    rolePermissions: roleGrants.map(({ key }) => key),
    ministries: memberships,
    ministryGrants,
  };
}
