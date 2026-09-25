import { PERMISSION_KEYS, PERMISSIONS, type PermissionKey } from "./permissions";

/**
 * Delegation limits: nobody hands out access they do not hold themselves.
 *
 * Every `users.*`, `roles.*` and `ministries.*` action can change what some
 * login is able to do, and each is grantable on its own. Without a ceiling,
 * holding any one of them is holding all of them: assign yourself (or an
 * account you created) the Admin role, add a permission to your own role or
 * ministry, or reset an administrator's password and sign in as them. So an
 * actor may only grant, remove, or take over access that is a subset of their
 * own effective permissions. Pure, so the rule is unit-tested here; the
 * actions in app/(app)/{users,roles,ministries} apply it.
 */

/** The keys in `wanted` that `held` lacks, in catalog order. */
export function permissionsBeyond(
  held: readonly string[],
  wanted: readonly string[],
): PermissionKey[] {
  const heldKeys = new Set(held);
  const beyond = new Set(wanted.filter((key) => !heldKeys.has(key)));
  return PERMISSION_KEYS.filter((key) => beyond.has(key));
}

/**
 * Whether `actor` may act on an account — edit it, reset its password, delete
 * it — that holds `target`. Only when the actor holds everything the account
 * does: resetting a password or changing a login email hands over the account.
 */
export function canManageAccount(
  actor: readonly string[],
  target: readonly string[],
): boolean {
  return permissionsBeyond(actor, target).length === 0;
}

/**
 * The permission set to save when an actor edits a role's or a ministry's
 * grants from `before` to `submitted`.
 *
 * Keys the actor holds follow the submission. Keys they do not hold keep their
 * previous state, whatever was submitted: the matrix renders those checkboxes
 * disabled, and a disabled checkbox is never submitted, so reading its absence
 * as "remove" would silently strip a grant the actor could not even see
 * changing. `refused` lists keys the submission tried to add without holding
 * them — a crafted request, since the form cannot send one — so the caller can
 * reject the edit outright rather than save something other than what was asked.
 */
export function delegatedEdit({
  held,
  before,
  submitted,
}: {
  held: readonly string[];
  before: readonly string[];
  submitted: readonly string[];
}): { permissions: PermissionKey[]; refused: PermissionKey[] } {
  const heldKeys = new Set(held);
  const beforeKeys = new Set(before);
  const next = new Set<string>();

  for (const key of submitted) {
    if (heldKeys.has(key)) next.add(key);
  }
  for (const key of before) {
    if (!heldKeys.has(key)) next.add(key);
  }

  const refused = permissionsBeyond(
    held,
    submitted.filter((key) => !beforeKeys.has(key)),
  );
  return {
    permissions: PERMISSION_KEYS.filter((key) => next.has(key)),
    refused,
  };
}

/** Whether two grant lists hold the same keys, ignoring order and duplicates. */
export function sameGrants(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((key) => right.has(key));
}

const LABELS = new Map<string, string>(PERMISSIONS.map((item) => [item.key, item.label]));

/** "Delete staff users and Update settings" — how a refusal names what is missing. */
export function describePermissions(keys: readonly PermissionKey[]): string {
  const labels = keys.map((key) => LABELS.get(key) ?? key);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** The message for an edit refused by delegatedEdit. */
export function grantRefusal(refused: readonly PermissionKey[]): string {
  return `You can only grant permissions you hold yourself. You do not hold: ${describePermissions(refused)}.`;
}

/** Shown above a permission matrix when some of its boxes are locked. */
export const LOCKED_PERMISSIONS_NOTE =
  "Permissions you do not hold yourself are locked: you can neither grant nor remove them.";

/**
 * The permissions a matrix should let this editor change, or undefined when
 * they hold everything in `scope` and nothing needs locking.
 */
export function grantableFor(
  held: readonly PermissionKey[],
  scope: readonly PermissionKey[] = PERMISSION_KEYS,
): PermissionKey[] | undefined {
  return permissionsBeyond(held, scope).length ? [...held] : undefined;
}
