import { describe, expect, it } from "bun:test";

import { generateTempPassword } from "./password";

describe("generateTempPassword", () => {
  it("is ten characters from an alphabet without look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, generateTempPassword));
    expect(seen.size).toBe(500);
  });
});
