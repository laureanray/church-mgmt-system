import "server-only";

import type { z } from "zod";

import { fieldErrors } from "@/lib/validators";

/**
 * What went wrong, independent of how the caller reports it. A server action
 * turns these into form state or a redirect; the HTTP API turns them into a
 * status code. Services never know which one is listening.
 */
export type ServiceErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  /** A service this depends on is switched off or not answering. */
  | "unavailable";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  /** Per-field messages for `invalid`, keyed like `fieldErrors`. */
  readonly fields?: Record<string, string>;

  constructor(
    code: ServiceErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.fields = fields;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Parse caller input with a zod schema, throwing `invalid` with per-field
 * messages on failure. Input is `unknown` on purpose: FormData fields and JSON
 * bodies both arrive here, and the schema is the only thing that trusts them.
 */
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError(
      "invalid",
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }
  return parsed.data;
}
