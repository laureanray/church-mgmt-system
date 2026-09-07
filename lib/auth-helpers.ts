import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { verifiedUserId } from "@/lib/supabase/verify";

/** The signed-in staff member: Supabase identity joined to their profile row. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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

  const profile = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

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

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    mustChangePassword: profile.mustChangePassword,
  };
});

/**
 * Ensures the signed-in user has one of the allowed roles.
 * Redirects to /dashboard (which everyone can see) if not authorized.
 */
export async function requireRole(roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}

/** True if the given role is permitted to manage members/services. */
export function canManage(role: UserRole) {
  return role === "admin" || role === "leader";
}
