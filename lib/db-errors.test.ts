import { describe, expect, test } from "bun:test";

import { isForeignKeyViolation } from "./db-errors";

describe("isForeignKeyViolation", () => {
  test("reads the SQLSTATE from the error or its wrapped cause", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
    expect(isForeignKeyViolation(new Error("wrapped", { cause: { code: "23503" } }))).toBe(true);
  });

  test("rejects other failures", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
    expect(isForeignKeyViolation(new Error("boom"))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});
