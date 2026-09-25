import "server-only";

import { userFromAuthorizationHeader } from "@/lib/session-user";

import type { Actor } from "./actor";
import { isServiceError, ServiceError, type ServiceErrorCode } from "./errors";

/**
 * The HTTP adapter: what every route under app/api/v1 is built from. It does
 * for a JSON client what the server actions do for the web app — identify the
 * caller, hand the service plain input, and translate the outcome — and holds
 * no business rules of its own.
 */

const STATUS: Record<ServiceErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 422,
  conflict: 409,
};

export type ApiErrorBody = {
  error: {
    code: ServiceErrorCode | "password_change_required" | "internal";
    message: string;
    fields?: Record<string, string>;
  };
};

export function apiError(
  status: number,
  body: ApiErrorBody["error"],
): Response {
  return Response.json({ error: body } satisfies ApiErrorBody, { status });
}

/**
 * Wraps a route handler: authenticates the bearer token, runs the handler
 * with the caller as an Actor, and maps a ServiceError to its status code.
 * An unexpected error is logged and becomes a bare 500, so no stack trace or
 * query text reaches the client.
 */
export function apiRoute<Context>(
  handler: (actor: Actor, request: Request, context: Context) => Promise<Response>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    // Authentication sits inside the try as well: a JWKS fetch or the profile
    // query failing is still a 500 in the documented shape, not a raw throw.
    try {
      const user = await userFromAuthorizationHeader(
        request.headers.get("authorization"),
      );
      if (!user) {
        return apiError(401, {
          code: "unauthenticated",
          message: "Send a valid Supabase access token as a Bearer token.",
        });
      }
      // The web app holds these users on /change-password; a temporary
      // password an admin issued must not unlock the API either.
      if (user.mustChangePassword) {
        return apiError(403, {
          code: "password_change_required",
          message: "Change your temporary password before using the API.",
        });
      }

      return await handler(user, request, context);
    } catch (error) {
      if (isServiceError(error)) {
        return apiError(STATUS[error.code], {
          code: error.code,
          message: error.message,
          fields: error.fields,
        });
      }
      console.error("Unhandled API error", error);
      return apiError(500, {
        code: "internal",
        message: "Something went wrong.",
      });
    }
  };
}

/** The JSON body of a request; anything but a JSON object is `invalid`. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // Fall through to the same error as a non-object body.
  }
  throw new ServiceError("invalid", "The request body must be a JSON object.");
}

/**
 * Multi-value query params, accepted both repeated (`?gender=male&gender=female`)
 * and comma-separated (`?gender=male,female`), matching the web app's URLs.
 * `all` means "every value", which the services spell as an empty list.
 * Absent means undefined, so the service applies its own default.
 */
export function listParam(
  params: URLSearchParams,
  name: string,
): string[] | undefined {
  if (!params.has(name)) return undefined;
  const values = params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return values.includes("all") ? [] : values;
}
