// Consent for face check-in (#21): the notice a member agrees to before a
// photo of their face is enrolled, and the confirmation that guards purging
// every face. Pure, so the unit suite covers it (lib/face-consent.test.ts).
//
// Not legal advice: the church should have whoever handles its data-privacy
// compliance confirm the wording, which it can change in Settings.

import { z } from "zod";

/** Used until the church writes its own in Settings. */
export const DEFAULT_FACE_CONSENT_NOTICE = `IRM Ministries would like to keep a photo of your face so that you can check in to services by looking at the camera at the door. This is optional: you can always check in by name instead.

What we keep: this one photo, and a record that you agreed and who recorded it. Pictures taken by the camera at the door are never kept.

Who handles it: Tencent Cloud's face recognition service (Singapore region) compares faces on our behalf. It keeps your face until we delete it, may keep a photo in its error logs for a few days, and its terms allow sharing with Tencent Cloud Computing (Beijing).

Your rights: under the Data Privacy Act of 2012 your face is sensitive personal information, and we use it only with your consent. You may withdraw it at any time — ask any usher or staff member, and we will delete your face from our records and from Tencent.`;

export const FACE_CONSENT_NOTICE_MAX_LENGTH = 4000;

export const faceConsentNoticeSchema = z
  .string()
  .trim()
  .min(40, "Write out the notice in full — at least a few sentences.")
  .max(
    FACE_CONSENT_NOTICE_MAX_LENGTH,
    `Keep the notice under ${FACE_CONSENT_NOTICE_MAX_LENGTH} characters.`,
  );

/** The notice in force: the church's own, or the built-in one. */
export function effectiveConsentNotice(saved: string | null | undefined): string {
  return saved?.trim() ? saved : DEFAULT_FACE_CONSENT_NOTICE;
}

/**
 * What the admin types to purge every face. A phrase rather than a checkbox,
 * because this cannot be undone and every member would need photographing
 * again.
 */
export const FACE_PURGE_CONFIRMATION = "delete all face data";

export function isPurgeConfirmed(typed: unknown): boolean {
  return (
    typeof typed === "string" &&
    typed.trim().toLowerCase() === FACE_PURGE_CONFIRMATION
  );
}

/** A consent checkbox's FormData value: ticked, or anything else. */
export function consentGiven(value: unknown): boolean {
  return value === "yes" || value === "on" || value === true;
}
