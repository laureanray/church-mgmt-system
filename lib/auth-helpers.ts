import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { UserRole } from "@/lib/constants";

/** Returns the signed-in user, or redirects to /login if there is none. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Ensures the signed-in user has one of the allowed roles.
 * Redirects to /dashboard (which everyone can see) if not authorized.
 */
export async function requireRole(roles: UserRole[]) {
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

/** True if the given role is permitted to manage staff users. */
export function canManageUsers(role: UserRole) {
  return role === "admin";
}
