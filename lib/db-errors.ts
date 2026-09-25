/**
 * Postgres error classification, for actions that let a constraint make an
 * atomic decision instead of checking first and racing.
 *
 * Drizzle wraps the driver's error, so the SQLSTATE may sit on the error
 * itself or on its `cause`.
 */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current === "object" && "code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string") return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return sqlState(error) === "23503";
}
