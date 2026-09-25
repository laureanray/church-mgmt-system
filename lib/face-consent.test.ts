import { describe, expect, it } from "bun:test";

import {
  DEFAULT_FACE_CONSENT_NOTICE,
  FACE_PURGE_CONFIRMATION,
  consentGiven,
  effectiveConsentNotice,
  faceConsentNoticeSchema,
  isPurgeConfirmed,
} from "./face-consent";

describe("effectiveConsentNotice", () => {
  it("uses the church's wording once it has one", () => {
    expect(effectiveConsentNotice("Our own notice.")).toBe("Our own notice.");
  });

  it("falls back to the built-in notice", () => {
    expect(effectiveConsentNotice(null)).toBe(DEFAULT_FACE_CONSENT_NOTICE);
    expect(effectiveConsentNotice("   ")).toBe(DEFAULT_FACE_CONSENT_NOTICE);
  });

  it("names what a member needs to decide", () => {
    for (const phrase of ["optional", "Tencent", "never kept", "Data Privacy Act", "withdraw"]) {
      expect(DEFAULT_FACE_CONSENT_NOTICE).toContain(phrase);
    }
  });
});

describe("faceConsentNoticeSchema", () => {
  it("accepts the built-in notice and trims", () => {
    expect(faceConsentNoticeSchema.parse(`  ${DEFAULT_FACE_CONSENT_NOTICE}  `)).toBe(
      DEFAULT_FACE_CONSENT_NOTICE,
    );
  });

  it("refuses a notice too short to inform anyone, or too long", () => {
    expect(faceConsentNoticeSchema.safeParse("OK?").success).toBe(false);
    expect(faceConsentNoticeSchema.safeParse("x".repeat(4001)).success).toBe(false);
  });
});

describe("consent and confirmation", () => {
  it("counts only a ticked box as consent", () => {
    expect(consentGiven("yes")).toBe(true);
    expect(consentGiven("on")).toBe(true);
    expect(consentGiven(null)).toBe(false);
    expect(consentGiven("")).toBe(false);
    expect(consentGiven("no")).toBe(false);
  });

  it("purges only on the exact phrase, forgiving case and spaces", () => {
    expect(isPurgeConfirmed(FACE_PURGE_CONFIRMATION)).toBe(true);
    expect(isPurgeConfirmed("  Delete All Face Data ")).toBe(true);
    expect(isPurgeConfirmed("delete")).toBe(false);
    expect(isPurgeConfirmed(undefined)).toBe(false);
  });
});
