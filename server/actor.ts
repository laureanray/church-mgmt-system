import "server-only";

import type { SessionUser } from "@/lib/session-user";
import type { PermissionKey } from "@/lib/permissions";

import { ServiceError } from "./errors";

/**
 * Who is calling a service. Services take it as an argument rather than
 * reading the session themselves, because the web app and the HTTP API
 * identify callers differently — a session cookie for one, a bearer token for
 * the other — and the service must not care which.
 */
export type Actor = Pick<SessionUser, "id" | "permissions">;

/**
 * The enforcement point. Callers may check the same permission earlier to
 * redirect or hide a button, but this is the check that cannot be skipped,
 * because every client reaches the data through it.
 */
export function authorize(actor: Actor, permission: PermissionKey): void {
  // Not hasPermission from auth-helpers: that module drags in cookies and the
  // Supabase clients, and a service must stay importable without a request.
  if (!actor.permissions.includes(permission)) {
    throw new ServiceError(
      "forbidden",
      "You do not have permission to do that.",
    );
  }
}
