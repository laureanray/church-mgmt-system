import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { firstAccessibleHref } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/permissions";
import { loadSessionUser, type SessionUser } from "@/lib/session-user";
import { createClient } from "@/lib/supabase/server";
import { verifiedUserId } from "@/lib/supabase/verify";

export type { SessionUser };

/**
 * Returns the signed-in user, or redirects to /login if there is none.
 *
 * Identity comes from Supabase Auth; the role lives in our own `users` table,
 * and ministry grants arrive through the linked member record, so this reads
 * all three — in one round trip, see lib/access.ts. The token is verified, not
 * merely decoded — see lib/supabase/verify.ts.
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

  const user = await loadSessionUser(userId);

  // Authenticated in Supabase but with no profile row — an account created
  // outside the admin screens. Refuse rather than guess a role, since role is
  // what every access check downstream depends on.
  //
  // Not /login: proxy.ts bounces authenticated users off that route to
  // /dashboard, which calls this again and loops. /no-access is a terminal page
  // that never calls requireUser and offers a client-side sign-out.
  if (!user) {
    redirect("/no-access");
  }

  return user;
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

/**
 * Where to send someone who signed in. proxy.ts always sends them to
 * /dashboard, but a role can omit `dashboard.view` — a LAM volunteer whose
 * access comes only from their ministry, say — and a redirect loop or a
 * "no access" page is the wrong welcome for someone who does have access.
 */
export function homeFor(user: Pick<SessionUser, "permissions" | "ministries">) {
  return (
    firstAccessibleHref({
      permissions: user.permissions,
      ministryCount: user.ministries.length,
    }) ?? "/no-access"
  );
}
