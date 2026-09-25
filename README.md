# IRM Ministries — church management

Members directory, service attendance and staff access for IRM Ministries.
`AGENTS.md` covers the stack, the conventions and how to run everything;
`docs/` holds the longer write-ups.

## Audit log

Every change to members, cell groups (and who is in them), deleted services,
staff accounts, roles and settings is written to `audit_log`, in the same
transaction as the change itself. Admins read it at **Settings → Audit log**
(`/settings/audit`), and a member's own entries appear on the **History** tab
of their page. Both need the `audit.view` permission, which only the Admin
role holds by default.

An update stores only the fields that changed. Secrets, passwords and tokens
are redacted before they are stored; the log records that the webhook secret
changed, never its value.

Entries are kept for 24 months (`AUDIT_RETENTION_MONTHS` in
`lib/constants.ts`). Nothing prunes them automatically — there is no cron — so
run this every few months:

```bash
bun run audit:prune --dry-run   # how many entries have expired
bun run audit:prune             # delete them
```

Against production, run it with that project's `DATABASE_URL` in the
environment.

## Face check-in

Members can check in at `/scan` by looking at the camera. Recognition is
**Tencent Cloud Face Recognition** (the "IAI" API, Singapore region), called
from the server only; the browser never talks to Tencent and never sees the key.

It is off until configured. Without the variables below, `/scan` scans QR codes
exactly as before and the member page says face check-in is not set up.

A face is biometric data, and sensitive personal information under the Data
Privacy Act, so **enrolment requires the member's consent** to a notice the
church controls. `docs/privacy.md` covers consent, retention and every deletion
path. Have whoever handles the church's data privacy confirm the notice text
(Settings → Face check-in) before turning this on in production.

### Setting it up

1. In the Tencent Cloud console, create a **CAM sub-user** with programmatic
   access only, and attach a custom policy limited to face recognition:

   ```json
   {
     "version": "2.0",
     "statement": [
       { "effect": "allow", "action": ["iai:*"], "resource": ["*"] }
     ]
   }
   ```

   Never use the root account's key. With this policy, a leaked key can reach
   face recognition and nothing else on the account.
2. Put its key in the environment (`.env` locally, the Vercel project's
   settings in production): `TENCENTCLOUD_SECRET_ID`,
   `TENCENTCLOUD_SECRET_KEY`, `TENCENTCLOUD_REGION=ap-singapore`, and
   `FACE_GROUP_ID` — a group name for this deployment alone (`irm-dev` for
   development, something else for production).
3. Run `bun run face:setup`. It checks the key and creates the group, and is
   safe to re-run; it reports how many people the group holds.

### How it works

- **Enrolment** — staff with `members.update` record the member's consent to
  the notice, then take a photo with the device camera or upload one. This
  can happen in three places:
  - on an existing member's page;
  - on **Members → New**, as the member is created;
  - at the door on `/scan`, where **Add a visitor** (`members.create`) creates
    a first-time visitor, checks them in, and can photograph them in the same
    step. Tencent must accept it (it rejects a
  dark, blurred or half-hidden face); only then is the photo kept in
  `member_faces` and an audit entry written. The member is a "person" in the
  group whose id and name are both the member's id — no name or other detail
  is sent to Tencent. Replace and Remove are on the same card; deleting a
  member removes their face too.
- **Check-in** — `/scan` watches the camera for movement and, while someone is
  moving in front of it, sends a small frame at most every 1.2 seconds, one at
  a time. A match scoring 90 or more is checked in and welcomed on screen; 80
  to 90 asks the usher "Is this …?" first; anything lower is "not recognised",
  with the name search below. Frames are never stored.
- The thresholds, the motion check and the error messages are in
  `lib/face-policy.ts`.

### Cost

About **USD 0.0008** per search, enrolment or photo (Tencent's first tier, up
to 3 million calls a month), billed monthly after use; there is no free tier.
The motion check keeps the cost per person rather than per minute: an empty
doorway sends nothing, and a person typically costs one to three searches.
Liveness detection is USD 0.40 a call and is deliberately not used.

### Privacy

Tencent keeps enrolled faces until they are deleted; its error logs keep a
request's input for a few days; and its terms share data with Tencent Cloud
Computing (Beijing). Where the data is stored is not documented. The built-in
consent notice says all of this. `docs/privacy.md` has the full account of what
is kept and how each kind of deletion works, including **Purge all face data**
in Settings for a church that stops using the feature.
