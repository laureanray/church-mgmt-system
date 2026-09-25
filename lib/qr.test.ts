import { describe, expect, it } from "bun:test";

import { extractToken, generateQrDataUrl } from "./qr";

describe("extractToken", () => {
  it("returns a raw token trimmed", () => {
    expect(extractToken("  ana-token \n")).toBe("ana-token");
  });

  it("reads the token from a URL that carries it", () => {
    expect(extractToken("https://example.test/scan?token=ana-token ")).toBe("ana-token");
  });

  it("keeps a URL without a token as it was scanned", () => {
    expect(extractToken("https://example.test/about")).toBe("https://example.test/about");
  });
});

describe("generateQrDataUrl", () => {
  it("draws the token as a PNG data URL", async () => {
    const url = await generateQrDataUrl("ana-token");
    expect(url).toStartWith("data:image/png;base64,");
    expect(url.length).toBeGreaterThan(1000);
  });

  it("draws different tokens differently", async () => {
    expect(await generateQrDataUrl("a")).not.toBe(await generateQrDataUrl("b"));
  });
});
