import { describe, expect, it } from "bun:test";

import { tc3Authorization } from "./tc3-signature";

// Vectors produced by Tencent's own Node SDK for the same inputs, so a match
// here means Tencent's servers compute the same signature.
const base = {
  secretId: "AKIDEXAMPLE",
  secretKey: "example-secret-key",
  service: "iai",
  host: "iai.ap-singapore.tencentcloudapi.com",
};

describe("tc3Authorization", () => {
  it("matches the SDK for a request with parameters", () => {
    expect(
      tc3Authorization({
        ...base,
        body: JSON.stringify({ GroupId: "irm-test", Limit: 10 }),
        timestamp: 1790000000,
      }),
    ).toBe(
      "TC3-HMAC-SHA256 Credential=AKIDEXAMPLE/2026-09-21/iai/tc3_request, SignedHeaders=content-type;host, Signature=e9a741d82479fdf49bef12dcbba1431d097e9feb195b6fb05a00c7102fb48163",
    );
  });

  it("scopes the credential to the UTC date, one second before midnight", () => {
    // 23:59:59 UTC on 31 December — already 1 January in Manila, so a local
    // date here would sign for the wrong day.
    expect(
      tc3Authorization({ ...base, body: "{}", timestamp: 1767225599 }),
    ).toBe(
      "TC3-HMAC-SHA256 Credential=AKIDEXAMPLE/2025-12-31/iai/tc3_request, SignedHeaders=content-type;host, Signature=29d8a2870c502e9ca62086ce550dcec7ebfacda2a153b062edd0f1095e032ea9",
    );
  });

  it("signs the body's exact bytes", () => {
    const a = tc3Authorization({ ...base, body: '{"Limit":10}', timestamp: 1790000000 });
    const b = tc3Authorization({ ...base, body: '{"Limit": 10}', timestamp: 1790000000 });
    expect(a).not.toBe(b);
  });
});
