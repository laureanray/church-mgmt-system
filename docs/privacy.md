# Face data: consent, retention and deletion

How face check-in handles a member's face. Settings → Face check-in links here.

This describes what the software does. It is **not legal advice**. Under the
Data Privacy Act of 2012 (Republic Act 10173), a face used to identify someone
is sensitive personal information. The church should have whoever handles its
data-privacy compliance confirm the consent notice and this policy.

## What is kept, where, and for how long

| Data | Where | Kept until |
| --- | --- | --- |
| The enrolment photo (one JPEG, at most 800 px) | `member_faces.photo`, in the church's Supabase Postgres (Singapore) | The face is removed, the member is deleted, or all face data is purged |
| The face itself (Tencent's template of the photo) | The deployment's face group in Tencent Cloud Face Recognition (`ap-singapore`) | The same |
| The consent record: when, who recorded it, and the notice as worded then | `member_faces` | The same, since consent goes with the face |
| Who enrolled, replaced or removed a face, and when | `audit_log` (never the photo) | 24 months (`bun run audit:prune`) |
| **Pictures taken by the camera at the door** | **Nowhere.** Each frame is sent to Tencent to search and then discarded. | — |

Nothing but the photo reaches Tencent. The member is a "person" whose id and
name are both the member's database id, so Tencent never receives a name,
birthday or contact detail.

Tencent's own terms, which the consent notice has to reflect:
- It keeps a face until we delete it.
- Its error logs may keep a request's input, which can include a photo, for a
  few days.
- It may share data with Tencent Cloud Computing (Beijing).
- It does not document where data is stored beyond the region we call.

## Consent

- A member's face can only be enrolled with their consent. The notice and the
  consent box appear wherever a face can be added: the member page, the
  new-member form, and **Add a visitor** at the door. The photo buttons stay
  disabled until staff tick "…has read this notice, or had it read to them, and
  agrees". The server checks it again, so bypassing the form does not skip it
  (`server/faces.ts`).
- Consent is recorded per member, not per photo. A replaced photo keeps the
  consent already on record, and removing the face removes the consent with it,
  so enrolling again asks again.
- The church writes the notice in **Settings → Face check-in**. Until it does,
  the built-in wording in `lib/face-consent.ts` is shown. Rewording it does not
  change what earlier members agreed to: each consent record stores the notice
  as it was worded then.
- Face check-in is optional. A member who does not consent checks in by name.

## Deleting face data

Each path removes the face from Tencent **first**, then the photo and the
consent record here. Every step accepts that it may already have happened, so
retrying a half-finished removal completes it.

- **One member withdraws consent:** Remove on their page (`members.update`).
- **A member is deleted:** their face is removed from Tencent before the member
  row is deleted. If Tencent cannot be reached, the deletion is refused and says
  so, rather than leaving a face behind that could never be removed from the app.
  The photo and consent go with the member row.
- **The church stops using face check-in:** Settings → Face check-in → Purge
  all face data (`settings.update`, Admin only by default). The admin types
  "delete all face data" to confirm. It deletes the deployment's whole Tencent
  face group and every photo and consent record here.

Only one path skips Tencent: deleting a member while face recognition is
switched off (its keys removed). There is then no Tencent to reach, so the local
data goes and the server logs that a face may remain. **Purge before removing
the keys.**
