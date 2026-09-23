import type { MinistryPosition } from "./constants";
import {
  PERMISSION_KEYS,
  isMinistryGrantable,
  isPermissionKey,
  type PermissionKey,
} from "./permissions";

/**
 * How ministries combine with roles. Pure, so it is unit-tested in lib/ rather
 * than only through the database; lib/access.ts feeds it rows.
 *
 * A signed-in user's permissions are their role's permissions plus the grants
 * of every active ministry whose roster includes their linked member record.
 * Ministries only ever add. A grant from a role-only module (see
 * ROLE_ONLY_MODULES) is ignored even if a row for it exists, so a hand-edited
 * database cannot turn a roster into a route to administration.
 */

export type MinistryMembership = {
  id: string;
  name: string;
  position: MinistryPosition;
};

export type MinistryGrant = { ministryId: string; permissionKey: string };

/** Role and ministry grants merged, deduplicated, in catalog order. */
export function effectivePermissions(
  rolePermissions: readonly string[],
  ministryGrants: readonly MinistryGrant[],
): PermissionKey[] {
  const granted = new Set<string>(rolePermissions.filter(isPermissionKey));
  for (const grant of ministryGrants) {
    if (isMinistryGrantable(grant.permissionKey)) granted.add(grant.permissionKey);
  }
  return PERMISSION_KEYS.filter((key) => granted.has(key));
}

export type PermissionSource =
  | { kind: "role"; name: string }
  | { kind: "ministry"; id: string; name: string };

/**
 * Where each of a user's permissions comes from, in catalog order — what the
 * staff edit page shows, so "why can this person open Scan?" has an answer.
 */
export function permissionSources(
  role: { name: string; permissions: readonly string[] },
  ministries: readonly Pick<MinistryMembership, "id" | "name">[],
  ministryGrants: readonly MinistryGrant[],
): { permission: PermissionKey; sources: PermissionSource[] }[] {
  const sources = new Map<string, PermissionSource[]>();
  const add = (key: string, source: PermissionSource) => {
    sources.set(key, [...(sources.get(key) ?? []), source]);
  };

  for (const key of role.permissions) {
    if (isPermissionKey(key)) add(key, { kind: "role", name: role.name });
  }
  const names = new Map(ministries.map((m) => [m.id, m.name]));
  for (const grant of ministryGrants) {
    const name = names.get(grant.ministryId);
    if (name && isMinistryGrantable(grant.permissionKey)) {
      add(grant.permissionKey, { kind: "ministry", id: grant.ministryId, name });
    }
  }

  return PERMISSION_KEYS.filter((key) => sources.has(key)).map((permission) => ({
    permission,
    sources: sources.get(permission)!,
  }));
}

type AccessSubject = {
  permissions: readonly PermissionKey[];
  ministries: readonly MinistryMembership[];
};

export function isMinistryHead(user: AccessSubject, ministryId: string) {
  return user.ministries.some(
    (m) => m.id === ministryId && m.position === "head",
  );
}

/** Staff with `ministries.view` see every ministry; anyone rostered sees theirs. */
export function canViewMinistry(user: AccessSubject, ministryId: string) {
  return (
    user.permissions.includes("ministries.view") ||
    user.ministries.some((m) => m.id === ministryId)
  );
}

/**
 * Adding and removing roster members. A head may do it for their own ministry
 * without any module permission — that is the point of being head. Appointing
 * heads is deliberately not included; see canAppointHeads.
 */
export function canManageRoster(user: AccessSubject, ministryId: string) {
  return (
    user.permissions.includes("ministries.update") ||
    isMinistryHead(user, ministryId)
  );
}

/**
 * Only `ministries.update` appoints heads. Heads are chosen by church
 * leadership; if a head could appoint heads, control of the roster — and so of
 * who receives the ministry's grants — could spread without anyone holding
 * `ministries.update` ever seeing it.
 */
export function canAppointHeads(user: AccessSubject) {
  return user.permissions.includes("ministries.update");
}
