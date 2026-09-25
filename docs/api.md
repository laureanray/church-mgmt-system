# Services and the HTTP API

Business rules live in one place, `server/`, and every client reaches them
through an adapter. The web app is one client; a native app is another. Neither
owns the rules, so adding the second one does not mean copying them.

```
        browser                           native app
           │                                   │
  pages · server actions             app/api/v1/**/route.ts
  (session cookie, FormData,         (Bearer token, JSON,
   redirect, revalidatePath)          status codes)
           │                                   │
           └──────────────┬────────────────────┘
                          ▼
                 server/<module>.ts          ← authorize, validate, rules
                          │
                     Drizzle → Postgres
```

## Why the web app does not call its own API

The obvious version of "the web app consumes the API" is the web app `fetch`ing
`/api/v1/...`. It is the wrong one here, and Next's own guide says so
(`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`,
*Caveats*): a Server Component fetching a Route Handler pays an extra HTTP round
trip to itself. Every page here is dynamic and already issues several queries
in sequence from `sin1` to Singapore; adding a self-request per page for no
change in behaviour is pure cost. It would also cost the things the rest of the
codebase is built around — `DataTable` rendering server JSX from rows that
never reach the browser, and server actions with `useActionState`.

So both clients sit on the **same layer below HTTP**. The web app imports
`server/members.ts` directly; the API route imports the same file. That is the
"layer in between": the API is not the source of truth, the service is, and the
API is a thin translation of it.

## The three pieces

**Services — `server/<module>.ts`.** Plain async functions that take an
`Actor` (who is asking) and plain input, and return plain data or throw a
`ServiceError`. They:

- call `authorize(actor, "module.action")` first — this is the enforcement
  point for every client;
- parse their input with the zod schema from `lib/validators.ts`, via
  `parseInput`, so FormData-shaped objects and JSON bodies are both untrusted
  until the schema says otherwise;
- hold the rules (the default directory view, "only a lapsed member can be
  reactivated", tie-breaking `ORDER BY`);
- know nothing about cookies, `Request`, `FormData`, `redirect` or
  `revalidatePath`. If a caller needs to know what changed so it can refresh —
  the previous cell group of a moved member — the service returns it.

`ServiceError` codes are `unauthenticated`, `forbidden`, `not_found`,
`invalid` (with per-field `fields`) and `conflict`.

**Web adapter — pages and `actions.ts`.** A page calls
`requirePermission(...)` (for the redirect to `/no-access`), then the service.
An action does the same, turns `FormData` into an object, and translates the
result: `invalid` becomes form state, success becomes `revalidatePath` +
`redirect`. `app/(app)/members/actions.ts` is the reference.

**HTTP adapter — `server/http.ts` + `app/api/v1/**/route.ts`.** `apiRoute`
authenticates the bearer token, rejects a user who still has a temporary
password (the web app holds them on `/change-password`), runs the handler, and
maps `ServiceError` codes to status codes:

| Code | Status |
| --- | --- |
| `unauthenticated` | 401 |
| `forbidden`, `password_change_required` | 403 |
| `not_found` | 404 |
| `conflict` | 409 |
| `invalid` | 422, with `fields` |
| `unavailable` | 503 — an outside service (face recognition) is off or not answering |
| anything else | 500, logged, body carries no detail |

Errors are always `{ "error": { "code", "message", "fields"? } }`.

## Authentication for API clients

A native app signs in with Supabase directly (`supabase-js`,
`signInWithPassword`), keeps and refreshes the session itself, and sends the
access token on every call:

```
Authorization: Bearer <supabase access token>
```

`userFromAuthorizationHeader` in `lib/session-user.ts` verifies it with the same
JWKS check `verifiedUserId` uses for cookies, then loads the same profile, role
and permissions, including what the linked member's ministries grant — so a
staff member has identical access through either door.
`proxy.ts` excludes `/api/` from its matcher: it redirects to `/login`, which is
right for a browser and wrong for an API client that needs a 401.

The API deliberately does **not** accept the session cookie. Cookie auth on a
JSON endpoint would need CSRF protection; a bearer token is not sent
automatically by the browser, so it does not.

## Members API (v1)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/members` | `members.view` | `search`, `gender`, `marital`, `status`, `sort`, `direction`, `page`, `perPage` |
| POST | `/api/v1/members` | `members.create` | 201 + `Location` |
| GET | `/api/v1/members/:id` | `members.view` | |
| PUT | `/api/v1/members/:id` | `members.update` | Full replacement: an omitted optional field becomes null |
| DELETE | `/api/v1/members/:id` | `members.delete` | 204 |
| POST | `/api/v1/members/:id/reactivate` | `members.update` | 409 if the member is not lapsed |

List filters take repeated or comma-separated values
(`?status=active,visitor`). `status` omitted means the directory's default view
(active and visitors), the same as `/members`; `status=all` means everyone. The
list response is `{ rows, matching, total, page, perPage }`.

## Adding a module to this shape

1. Write `server/<module>.ts`: `authorize` first, `parseInput` with the
   existing schema, return data, throw `ServiceError`.
2. Point the pages and `actions.ts` at it. Keep `requirePermission` in the
   action for the redirect; keep `revalidatePath`/`redirect` there too.
3. Add `app/api/v1/<module>/route.ts` handlers with `apiRoute`. They should be
   a few lines each — anything longer is a rule that belongs in the service.
4. Test the service through the route in `tests/integration/` (see
   `members-api.test.ts`, which stubs only the token signature check).

Only members is migrated so far. The other modules still query Drizzle from
their pages and actions; move each one when it next needs to be reachable from
the API, rather than all at once.

Versioning: `/api/v1` is the contract a shipped app binds to. A breaking change
to a response shape goes to `/v2` beside it; the service underneath stays one.
