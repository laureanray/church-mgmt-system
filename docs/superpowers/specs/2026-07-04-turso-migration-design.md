# Design: Postgres → Turso/libSQL migration + durable migration workflow

- **Date:** 2026-07-04
- **Status:** Approved (brainstorming complete, pending implementation plan)
- **Author:** laureanray + Claude

## Goal

Move the church management system off PostgreSQL onto **Turso** (hosted
libSQL / SQLite) for production, with a **local SQLite file** for development,
and establish a **versioned migration workflow** that applies migrations
**automatically on every production deploy** via the Vercel build. There is no
production data yet, so this is a clean cutover.

## Why this is low-risk

The schema uses no Postgres-only features that are hard to port — no `jsonb`,
arrays, `numeric`, extensions, or raw SQL. The port is a mechanical rewrite of
`db/schema.ts` plus a fresh migration generation. No production data exists, so
the old migrations are discarded and regenerated for the SQLite dialect.

## 1. Stack change

| Layer | Before | After |
|---|---|---|
| DB engine | PostgreSQL 17 (Docker, port 5433) | Turso / libSQL (prod), `file:./local.db` (dev) |
| Driver | `postgres` (postgres-js) | `@libsql/client` |
| Drizzle import | `drizzle-orm/postgres-js`, `drizzle-orm/pg-core` | `drizzle-orm/libsql`, `drizzle-orm/sqlite-core` |
| Drizzle-kit dialect | `postgresql` | `turso` |
| Local infra | `docker-compose.yml` Postgres | none (a gitignored `local.db` file) |

Relations, inferred types, and query code are unchanged except one
`ilike`→`like` (see §2).

## 2. Schema type mapping (`db/schema.ts`)

`pgTable` → `sqliteTable`, and every column type maps as follows:

| Today (pg-core) | Becomes (sqlite-core) | Notes |
|---|---|---|
| `uuid("id").primaryKey().defaultRandom()` | `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` | Same UUID strings, generated app-side (Node 24 `crypto.randomUUID`). |
| `pgEnum(name, [...])` + `enumCol("x")` | `text("x", { enum: [...] })` | Type-safe in TS. No DB-level CHECK for now; validation stays in `lib/validators.ts` (zod). The 4 `pgEnum` exports are removed. |
| `timestamp(..., { withTimezone: true }).defaultNow()` | `integer(..., { mode: "timestamp" }).default(sql\`(unixepoch())\`)` | Stored as UTC epoch **seconds**; Drizzle reads back a JS `Date`. Timezone metadata is dropped (app already works in UTC/`Date`). |
| `date("birthdate")` | `text("birthdate")` | Stores `"YYYY-MM-DD"` — the same string shape the app receives today. |
| `boolean(...).notNull().default(false)` | `integer(..., { mode: "boolean" }).notNull().default(false)` | |
| `unique("name").on(a, b)` | unchanged | SQLite supports composite unique constraints. |
| `.references(() => t.id, { onDelete })` | unchanged | SQLite supports FKs + `cascade`/`set null` (see FK note below). |

Affected tables: `users`, `members`, `service_schedules`, `services`,
`attendance`. Enums affected: `user_role`, `gender`, `marital_status`,
`service_type`.

### Foreign key enforcement

SQLite does not enforce foreign keys unless enabled. We must ensure foreign key
enforcement is active for the libSQL client, and **verify during testing** that
`onDelete: cascade` (attendance → members/services) and `onDelete: set null`
(services → schedules, attendance → users) actually behave as specified —
rather than assuming.

### `ilike` → `like`

`app/(app)/members/page.tsx` uses `ilike(members.fullName, "%q%")`. SQLite has
no `ILIKE`; its `LIKE` is already case-insensitive for ASCII. Switch to
`like()`. (Non-ASCII case-folding — e.g. accented Filipino names — is not
case-insensitive in SQLite `LIKE`; acceptable for now, noted as a known limit.)

## 3. Client & config

### `db/index.ts`

```ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const globalForDb = globalThis as unknown as {
  libsqlClient?: ReturnType<typeof createClient>;
};

const client =
  globalForDb.libsqlClient ??
  createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

if (process.env.NODE_ENV !== "production") globalForDb.libsqlClient = client;

export const db = drizzle(client, { schema });
export { schema };
```

The dev singleton is retained for hot-reload. (libSQL is HTTP-based remotely,
so TCP pool exhaustion is not a concern the way it was with postgres-js.)

### `drizzle.config.ts`

```ts
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  verbose: true,
  strict: true,
});
```

`process.loadEnvFile(".env")` is retained.

### Environment variables

| Var | Local | Production (Vercel) |
|---|---|---|
| `DATABASE_URL` | `file:./local.db` | `libsql://<db>.turso.io` |
| `DATABASE_AUTH_TOKEN` | *(unset)* | Turso auth token |
| `AUTH_SECRET` | dev value | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` | `true` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | production domain |

`.env.example` is updated to reflect the Turso vars. `local.db` is gitignored.

> Turso is provisioned via the Turso CLI/dashboard (not assumed to be a Vercel
> Marketplace integration); the two DB vars are added to Vercel manually (via
> `vercel env` or the dashboard). This avoids depending on unverified
> integration behavior.

## 4. Migration reset

Because there is no production data:

1. Delete `db/migrations/*.sql` (0000–0003) and `db/migrations/meta/`.
2. `pnpm db:generate` → emits fresh SQLite DDL as `0000_*.sql`.
3. Commit the regenerated migration.

## 5. Auto-apply on deploy (Vercel build)

Add a `vercel-build` script (Vercel runs it in preference to `build`):

```js
// scripts/vercel-build.mjs
import { execSync } from "node:child_process";
const run = (c) => execSync(c, { stdio: "inherit" });
if (process.env.VERCEL_ENV === "production") run("pnpm drizzle-kit migrate");
run("pnpm next build");
```

`package.json`: `"vercel-build": "node scripts/vercel-build.mjs"`.

- Production deploy → migrate Turso → build. A failed migration fails the
  deploy; the previously live deployment keeps serving (safe).
- Preview deploys **skip** migration for now. Per-preview Turso DB branching is
  a future enhancement (YAGNI now).
- `drizzle-kit` is a devDependency; Vercel installs devDependencies at build
  time, and `DATABASE_URL` + `DATABASE_AUTH_TOKEN` are available to the build.

## 6. The durable migration workflow (hard reference)

**Every schema change, from now on:**

1. Edit `db/schema.ts`.
2. `pnpm db:generate` → creates a new versioned `.sql` in `db/migrations/`.
3. **Review** the generated SQL. Commit `schema.ts` and the new migration file(s)
   **together** in one commit.
4. `pnpm db:migrate` locally → test against `local.db`.
5. Merge to `main` → the Vercel **production** build runs `drizzle-kit migrate`
   automatically against Turso, then builds.

**Rules:**
- Never edit a migration that has already been applied/committed — always add a
  new one.
- Schema changes must be **backward-compatible (expand/contract)**: the
  migration runs *before* the new code is live, so the currently-running code
  must tolerate the new schema. Add columns/tables before removing; split
  destructive changes across deploys.
- **Never** run `db:push` against production. `push` is for throwaway local
  experiments only.

## 7. Files touched

- `db/schema.ts` — full column-type rewrite (§2)
- `db/index.ts` — libSQL client (§3)
- `drizzle.config.ts` — `turso` dialect (§3)
- `db/seed.ts` — verify it runs unchanged against libSQL
- `app/(app)/members/page.tsx` — `ilike` → `like`
- `db/migrations/*` — deleted and regenerated (§4)
- `.env` / `.env.example` — Turso vars (§3)
- `docker-compose.yml` — deleted (Postgres no longer used)
- `package.json` — remove `postgres`, add `@libsql/client`; add `vercel-build`
- `.gitignore` — add `local.db`
- Memory — write the §6 workflow as a hard reference

Also: audit for any imports of the removed `pgEnum` exports (`userRoleEnum`,
`genderEnum`, `maritalStatusEnum`, `serviceTypeEnum`) across the app and update
them to use the inferred types / `lib/constants.ts` as appropriate.

## 8. Verification before done

1. `rm -f local.db`
2. `pnpm db:generate` → `pnpm db:migrate` → `pnpm db:seed` all succeed.
3. `pnpm dev`, then drive the app end-to-end:
   - Log in as `admin@church.local`.
   - Load the members list (exercises `like` search).
   - Record a QR check-in (exercises FK relations, timestamp default, boolean,
     and the unique attendance constraint).
   - Delete a member and confirm attendance rows cascade (FK enforcement check).
4. Only after the above passes: link Vercel, set env vars, deploy.

## Out of scope (future)

- Per-preview Turso database branching.
- DB-level CHECK constraints for enum columns.
- Turso embedded replicas.
- GitHub Actions CI (migration runs in the Vercel build instead).
