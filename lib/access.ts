import "server-only";

import { and, eq, sql } from "drizzle-orm";

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
 * Everything authorization needs to know about one staff user, in a single
 * statement. This runs before every page and every action, and five parallel
 * queries would take five pooled connections per request where one will do.
 * The role permissions, linked member, memberships and grants ride along as
 * subqueries. Returns null when there is no profile row.
 */
export async function loadUserAccess(userId: string): Promise<UserAccess | null> {
  // The linked member's memberships, in active ministries only.
  const servesIn = sql`
    join ${members} on ${members.id} = ${ministryMembers.memberId}
    join ${ministries} on ${ministries.id} = ${ministryMembers.ministryId}
    where ${members.userId} = ${users.id} and ${ministries.active}`;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      roleId: roles.id,
      roleName: roles.name,
      rolePermissions: sql<string[]>`coalesce(
        (select array_agg(${rolePermissions.permissionKey}) from ${rolePermissions}
          where ${rolePermissions.roleId} = ${roles.id}),
        '{}'
      )`,
      memberId: sql<string | null>`(
        select ${members.id} from ${members}
          where ${members.userId} = ${users.id} limit 1
      )`,
      ministries: sql<MinistryMembership[]>`coalesce(
        (select json_agg(json_build_object(
            'id', ${ministries.id},
            'name', ${ministries.name},
            'position', ${ministryMembers.position}
          ) order by ${ministries.name}, ${ministries.id})
          from ${ministryMembers} ${servesIn}),
        '[]'
      )`,
      ministryGrants: sql<MinistryGrant[]>`coalesce(
        (select json_agg(json_build_object(
            'ministryId', ${ministryPermissions.ministryId},
            'permissionKey', ${ministryPermissions.permissionKey}
          ))
          from ${ministryPermissions}
          join ${ministryMembers}
            on ${ministryMembers.ministryId} = ${ministryPermissions.ministryId}
          ${servesIn}),
        '[]'
      )`,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  const { memberId, ministryGrants, ...profile } = row;
  return {
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      mustChangePassword: profile.mustChangePassword,
      roleId: profile.roleId,
      roleName: profile.roleName,
    },
    memberId,
    rolePermissions: row.rolePermissions,
    ministries: row.ministries,
    ministryGrants,
  };
}

/**
 * What an account would hold with this role and this linked member: the same
 * two sources loadUserAccess reads, for an account that does not exist yet or
 * is about to change. Kept apart so a refusal can name the field responsible.
 * The two queries run side by side.
 */
export async function prospectiveAccess(
  roleId: string,
  memberId: string | null,
): Promise<{ rolePermissions: string[]; ministryGrants: MinistryGrant[] }> {
  const [granted, ministryGrants] = await Promise.all([
    db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId)),
    memberId
      ? db
          .select({
            ministryId: ministryPermissions.ministryId,
            permissionKey: ministryPermissions.permissionKey,
          })
          .from(ministryPermissions)
          .innerJoin(
            ministryMembers,
            eq(ministryMembers.ministryId, ministryPermissions.ministryId),
          )
          .innerJoin(ministries, eq(ministries.id, ministryPermissions.ministryId))
          .where(and(eq(ministryMembers.memberId, memberId), eq(ministries.active, true)))
      : Promise.resolve([]),
  ]);
  return { rolePermissions: granted.map(({ key }) => key), ministryGrants };
}
