# Turso/libSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the church management system over from PostgreSQL (postgres-js) to Turso/libSQL, with a local SQLite file for development and versioned migrations auto-applied on production deploys via the Vercel build.

**Architecture:** Swap the Drizzle driver from `drizzle-orm/postgres-js` to `drizzle-orm/libsql` and rewrite `db/schema.ts` from `pg-core` to `sqlite-core` column types (text UUIDs, integer timestamps/booleans, text enums). Regenerate migrations for the SQLite dialect (no production data exists, so this is a clean reset). Add a `vercel-build` script that runs `drizzle-kit migrate` before `next build` on production deploys only.

**Tech Stack:** Next.js 16, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, `@libsql/client`, Turso, pnpm, Node 24.

## Global Constraints

- **No production data exists** — old Postgres migrations are deleted and regenerated, not preserved.
- **drizzle-kit dialect is `turso`** with `dbCredentials: { url, authToken? }` (verified against installed 0.31.10). `authToken` is omitted locally.
- **`drizzle-orm` stays at 0.45.2** — its `drizzle-orm/libsql` driver is already present; do NOT upgrade it.
- **Enum values must stay in sync** with `lib/constants.ts` (`USER_ROLES`, `GENDERS`, `MARITAL_STATUSES`, `SERVICE_TYPES`). No app file imports the old `pgEnum` exports (verified), so removing them is safe.
- **Timestamps are stored as UTC epoch seconds** (`mode: "timestamp"` + `default(sql\`(unixepoch())\`)`), read back as JS `Date`.
- **This project has no unit-test runner** (no vitest/jest in `package.json`). "Verification" = `tsc --noEmit`, `drizzle-kit` commands, and driving the running app. Do not invent a test framework.
- **Migration workflow rules** (enforced in Task 7's reference): never edit an applied migration; schema changes must be backward-compatible (expand/contract); never `db:push` against prod.

---

### Task 1: Swap driver, schema, and config to libSQL

The atomic "make it compile on libSQL" unit — dependencies, schema, client, and drizzle-kit config change together so the codebase typechecks again at the end.

**Files:**
- Modify: `package.json` (dependencies + scripts)
- Modify: `db/schema.ts` (full rewrite of column types)
- Modify: `db/index.ts` (libSQL client)
- Modify: `drizzle.config.ts` (turso dialect)

**Interfaces:**
- Produces: `db` (Drizzle libSQL instance) and `schema` from `@/db`; unchanged inferred types `User`, `NewUser`, `Member`, `NewMember`, `Service`, `NewService`, `ServiceSchedule`, `NewServiceSchedule`, `Attendance`, `NewAttendance` from `@/db/schema` (same field names as today).

- [ ] **Step 1: Install libSQL client, remove postgres**

Run:
```bash
pnpm remove postgres && pnpm add @libsql/client
```
Expected: `@libsql/client` appears under `dependencies` in `package.json`; `postgres` is gone. If pnpm prints a build-scripts warning for a native dependency, run `pnpm approve-builds` and approve `@libsql/client`/`libsql`.

- [ ] **Step 2: Rewrite `db/schema.ts`**

Replace the entire file with:
```ts
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Enums are modeled as text columns with a TS-level enum constraint. DB-level
// enforcement is intentionally omitted; validation lives in lib/validators.ts
// (zod). Keep these arrays in sync with lib/constants.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Users — staff who log in (admin / leader / usher)
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  // Login handle.
  username: text("username").notNull().unique(),
  // Optional — provisioned for future email features. Not used for login today.
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "leader", "usher"] })
    .notNull()
    .default("usher"),
  // True when an admin has issued a temporary password; forces a reset at login.
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Members — the church congregation. Each has a unique QR token.
// ---------------------------------------------------------------------------

export const members = sqliteTable("members", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Unique token encoded into the member's QR code.
  qrToken: text("qr_token").notNull().unique(),

  fullName: text("full_name").notNull(),
  birthdate: text("birthdate"),
  spiritualBirthday: text("spiritual_birthday"),
  // "Taon na naging Kaanib ng IRM" — year the member joined IRM.
  memberSinceYear: integer("member_since_year"),
  gender: text("gender", { enum: ["male", "female"] }),
  maritalStatus: text("marital_status", {
    enum: ["single", "married", "widowed", "separated", "divorced"],
  }),
  spouseName: text("spouse_name"),
  weddingAnniversary: text("wedding_anniversary"),
  contactNumber: text("contact_number"),
  homeAddress: text("home_address"),
  motherName: text("mother_name"),
  fatherName: text("father_name"),
  educationalLevel: text("educational_level"),
  occupation: text("occupation"),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Service schedules — recurring templates that auto-generate dated occurrences.
// ---------------------------------------------------------------------------

export const serviceSchedules = sqliteTable("service_schedules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["sunday_service", "midweek_service", "special_event"],
  })
    .notNull()
    .default("sunday_service"),
  // Day of week, 0 = Sunday .. 6 = Saturday (matches JS Date.getDay()).
  dayOfWeek: integer("day_of_week").notNull(),
  // Time of day in 24h "HH:mm".
  timeOfDay: text("time_of_day").notNull(),
  location: text("location"),
  notes: text("notes"),
  // When false, no new occurrences are generated.
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Services / events — attendance is recorded against one of these.
// ---------------------------------------------------------------------------

export const services = sqliteTable(
  "services",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["sunday_service", "midweek_service", "special_event"],
    })
      .notNull()
      .default("sunday_service"),
    // Date + time the service is held.
    scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
    location: text("location"),
    notes: text("notes"),
    // The recurring schedule this occurrence came from, if any.
    scheduleId: text("schedule_id").references(() => serviceSchedules.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  // Prevents generating the same occurrence twice for a schedule.
  (t) => [
    unique("services_schedule_occurrence_unique").on(
      t.scheduleId,
      t.scheduledAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Attendance — one row per member per service (deduped by unique constraint).
// ---------------------------------------------------------------------------

export const attendance = sqliteTable(
  "attendance",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    checkedInAt: integer("checked_in_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    // Which staff user scanned them in (nullable — user may be deleted later).
    recordedBy: text("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("attendance_member_service_unique").on(t.memberId, t.serviceId),
  ],
);

// ---------------------------------------------------------------------------
// Relations (unchanged from the Postgres schema)
// ---------------------------------------------------------------------------

export const membersRelations = relations(members, ({ many }) => ({
  attendance: many(attendance),
}));

export const serviceSchedulesRelations = relations(
  serviceSchedules,
  ({ many }) => ({
    services: many(services),
  }),
);

export const servicesRelations = relations(services, ({ one, many }) => ({
  attendance: many(attendance),
  schedule: one(serviceSchedules, {
    fields: [services.scheduleId],
    references: [serviceSchedules.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  member: one(members, {
    fields: [attendance.memberId],
    references: [members.id],
  }),
  service: one(services, {
    fields: [attendance.serviceId],
    references: [services.id],
  }),
  recordedByUser: one(users, {
    fields: [attendance.recordedBy],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ServiceSchedule = typeof serviceSchedules.$inferSelect;
export type NewServiceSchedule = typeof serviceSchedules.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
```

- [ ] **Step 3: Rewrite `db/index.ts`**

Replace the entire file with:
```ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the libSQL client across hot reloads in dev and warm serverless
// invocations (Fluid Compute) to avoid re-creating connections.
const globalForDb = globalThis as unknown as {
  libsqlClient?: ReturnType<typeof createClient>;
};

const client =
  globalForDb.libsqlClient ??
  createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

if (process.env.NODE_ENV !== "production") {
  globalForDb.libsqlClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
```

- [ ] **Step 4: Update `drizzle.config.ts`**

Replace the `defineConfig({...})` call's `dialect`/`dbCredentials` so the file reads:
```ts
import { defineConfig } from "drizzle-kit";

// Load .env for the drizzle-kit CLI (Node 20.6+ / 24).
try {
  process.loadEnvFile(".env");
} catch {
  // .env may be absent in CI where DATABASE_URL is already set.
}

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

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: exits 0, no errors. (Inferred type field names are unchanged, so app code — `db/seed.ts`, server actions, pages — still typechecks. `db/seed.ts` will be exercised at runtime in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml db/schema.ts db/index.ts drizzle.config.ts
git commit -m "feat(db): switch Drizzle driver and schema to libSQL/Turso"
```

---

### Task 2: Local dev env + remove Docker

**Files:**
- Modify: `.env` (gitignored — local only)
- Modify: `.gitignore`
- Delete: `docker-compose.yml`
- Modify: `package.json` (remove `db:up`/`db:down` scripts)

- [ ] **Step 1: Point local `.env` at a SQLite file**

In `.env`, replace the Postgres block:
```
# Local development environment (gitignored).
# Local Postgres runs via `docker compose up -d` on port 5433.
DATABASE_URL=postgresql://church:church@localhost:5433/church
```
with:
```
# Local development environment (gitignored).
# Local dev uses an on-disk SQLite file via libSQL — no server needed.
DATABASE_URL=file:./local.db
# DATABASE_AUTH_TOKEN is only set in production (Turso). Leave unset locally.
```
Leave `AUTH_SECRET`, `AUTH_TRUST_HOST`, and `NEXT_PUBLIC_APP_URL` as-is.

- [ ] **Step 2: Gitignore the local database files**

Append to `.gitignore` (libSQL creates `-wal`/`-shm` sidecar files):
```
# local libSQL database
/local.db
/local.db-*
```

- [ ] **Step 3: Remove Docker Postgres**

Run: `git rm docker-compose.yml`
Expected: `docker-compose.yml` staged for deletion.

- [ ] **Step 4: Remove the docker scripts from `package.json`**

Delete these two lines from `"scripts"`:
```json
    "db:up": "docker compose up -d",
    "db:down": "docker compose down"
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json docker-compose.yml
git commit -m "chore(db): use local SQLite file for dev, drop Docker Postgres"
```
(`docker-compose.yml`'s deletion was staged by `git rm` in Step 3; `.env` itself is gitignored and is not committed.)

---

### Task 3: Regenerate migrations and verify migrate + seed

**Files:**
- Delete: `db/migrations/*.sql`, `db/migrations/meta/`
- Create: `db/migrations/0000_*.sql` + fresh `db/migrations/meta/` (generated)

**Interfaces:**
- Consumes: the libSQL `db` and `schema` from Task 1; `DATABASE_URL=file:./local.db` from Task 2.

- [ ] **Step 1: Delete the Postgres migrations**

Run:
```bash
rm -rf db/migrations && mkdir db/migrations
```
Expected: `db/migrations/` is empty. (The 4 Postgres SQL files, `meta/_journal.json`, and snapshots are gone.)

- [ ] **Step 2: Generate fresh SQLite migrations**

Run: `pnpm db:generate`
Expected: creates `db/migrations/0000_<name>.sql` containing `CREATE TABLE` statements with `integer`/`text` columns and `PRAGMA`/foreign-key clauses, plus `db/migrations/meta/_journal.json` and `0000_snapshot.json`.

- [ ] **Step 3: Inspect the generated SQL**

Run: `cat db/migrations/0000_*.sql`
Expected: tables `users`, `members`, `service_schedules`, `services`, `attendance`; UUID PKs are `text ... PRIMARY KEY`; timestamps are `integer ... DEFAULT (unixepoch())`; booleans are `integer`; foreign keys present with `ON DELETE cascade`/`set null`. No `gen_random_uuid()`, no `timestamp with time zone`.

- [ ] **Step 4: Apply migrations to a clean local DB**

Run:
```bash
rm -f local.db local.db-* && pnpm db:migrate
```
Expected: drizzle-kit reports applying `0000_*` with no errors; `local.db` is created.

- [ ] **Step 5: Seed the database**

Run: `pnpm db:seed`
Expected output includes:
```
Seeding database...
  ✓ Admin user ready:  admin / admin123
  ✓ 3 sample members created
  ✓ 2 sample services created
Done.
```
(This proves inserts with text enums, integer-timestamp `scheduledAt` from a JS `Date`, date-as-text `birthdate`, `$count`, and `onConflictDoNothing` all work on libSQL.)

- [ ] **Step 6: Commit**

```bash
git add db/migrations
git commit -m "feat(db): regenerate migrations for SQLite dialect"
```

---

### Task 4: Fix `ilike` → `like` in members search

SQLite has no `ILIKE`; its `LIKE` is already case-insensitive for ASCII.

**Files:**
- Modify: `app/(app)/members/page.tsx` (import on line 2; usage on line 36)

- [ ] **Step 1: Update the import**

Change:
```ts
import { asc, count, ilike } from "drizzle-orm";
```
to:
```ts
import { asc, count, like } from "drizzle-orm";
```

- [ ] **Step 2: Update the query**

Change:
```ts
  const where = query ? ilike(members.fullName, `%${query}%`) : undefined;
```
to:
```ts
  const where = query ? like(members.fullName, `%${query}%`) : undefined;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/members/page.tsx"
git commit -m "fix(members): use LIKE for search (SQLite has no ILIKE)"
```

---

### Task 5: Auto-apply migrations on production deploys (Vercel build)

**Files:**
- Create: `scripts/vercel-build.mjs`
- Modify: `package.json` (add `vercel-build` script)
- Modify: `.env.example` (Turso vars)

- [ ] **Step 1: Create the build script**

Create `scripts/vercel-build.mjs`:
```js
// Vercel runs `vercel-build` in preference to `build`.
// Apply DB migrations ONLY on production deploys, then build.
// Preview deploys skip migration (they point at a separate/no Turso DB).
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  console.log("[vercel-build] production — applying migrations");
  run("pnpm drizzle-kit migrate");
} else {
  console.log(`[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV} — skipping migrations`);
}

run("pnpm next build");
```

- [ ] **Step 2: Wire up the `vercel-build` script**

Add to `package.json` `"scripts"` (next to `"build"`):
```json
    "vercel-build": "node scripts/vercel-build.mjs",
```

- [ ] **Step 3: Update `.env.example`**

Replace the whole file with:
```
# Copy to .env and fill in.

# libSQL / Turso connection.
# Local (dev): file:./local.db
# Production (Turso): libsql://<db-name>-<org>.turso.io
DATABASE_URL=file:./local.db

# Turso auth token. Unset locally; required in production.
# Create with: turso db tokens create <db-name>
DATABASE_AUTH_TOKEN=

# Auth.js secret. Generate with: openssl rand -base64 32
AUTH_SECRET=replace-me
AUTH_TRUST_HOST=true

# Public base URL of the deployed app.
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Local sanity check of the build script (skips migration)**

Run: `VERCEL_ENV=preview node scripts/vercel-build.mjs`
Expected: prints `[vercel-build] VERCEL_ENV=preview — skipping migrations`, then runs `next build` to completion with exit 0. (Confirms the gate works and the app builds. This does not touch the database.)

- [ ] **Step 5: Commit**

```bash
git add scripts/vercel-build.mjs package.json .env.example
git commit -m "feat(deploy): apply migrations on production Vercel builds"
```

---

### Task 6: End-to-end verification

Prove the running app works on libSQL, including the paths most sensitive to the type changes (FK cascade, timestamps, boolean, LIKE search). No code changes — this is a gate.

**Files:** none (verification only).

- [ ] **Step 1: Start from a clean, seeded DB**

Run:
```bash
rm -f local.db local.db-* && pnpm db:migrate && pnpm db:seed
```
Expected: seed output as in Task 3 Step 5.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: Next.js starts on `http://localhost:3000` with no runtime errors in the console.

- [ ] **Step 3: Log in**

In a browser (or via the `run`/playwright tooling), go to `http://localhost:3000`, log in with the seeded admin (`admin` / `admin123`).
Expected: login succeeds, dashboard renders (exercises the `users` table read + timestamp columns).

- [ ] **Step 4: Members search (LIKE)**

Open the Members page and search `maria` (lowercase).
Expected: "Maria Santos" appears — confirms case-insensitive `like()` works.

- [ ] **Step 5: Record attendance via QR (FK + timestamp + unique)**

Open a service, scan/enter a seeded member's QR token to check them in.
Expected: attendance row is created; scanning the same member again is a no-op/deduped (unique constraint), and `checked_in_at` is populated.

- [ ] **Step 6: Verify FK cascade enforcement**

This is the one behavior the spec flagged to verify rather than assume. With the dev server stopped, run against the local DB:
```bash
pnpm exec tsx -e "import('./db/index').then(async ({db,schema})=>{const {sql}=await import('drizzle-orm');const m=await db.select().from(schema.members).limit(1);const id=m[0].id;await db.delete(schema.members).where(sql\`id = \${id}\`);const left=await db.select().from(schema.attendance).where(sql\`member_id = \${id}\`);console.log('attendance rows for deleted member:',left.length);process.exit(left.length===0?0:1);})"
```
Expected: `attendance rows for deleted member: 0` and exit 0 — cascade is enforced.
**If it prints a non-zero count:** foreign keys are not being enforced. Remediation: enable enforcement on the libSQL client. In `db/index.ts` change the client creation to `createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN, intMode: "number" })` is NOT the fix — instead execute the pragma once after creating the client: `client.execute("PRAGMA foreign_keys = ON")` (add `await`-free fire at module load) and re-run this step. Commit the fix under Task 1's file if triggered.

- [ ] **Step 7: Re-seed to a clean state (optional)**

Run: `rm -f local.db local.db-* && pnpm db:migrate && pnpm db:seed`
Expected: clean seeded DB restored for continued development.

---

### Task 7: Save the durable migration workflow to memory

The user explicitly asked for this as a hard reference. Performed by Claude against the auto-memory store.

**Files:**
- Create: `/Users/lr/.claude/projects/-Users-lr-personal-church-mgmt-system/memory/db-migration-workflow.md`
- Modify: `/Users/lr/.claude/projects/-Users-lr-personal-church-mgmt-system/memory/MEMORY.md` (add one pointer line)
- Modify: `/Users/lr/.claude/projects/-Users-lr-personal-church-mgmt-system/memory/local-dev-setup.md` (update: Postgres/Docker → libSQL file)

- [ ] **Step 1: Write the workflow memory** with frontmatter (`type: project`) containing the numbered workflow and rules from the spec §6:
  1. Edit `db/schema.ts`
  2. `pnpm db:generate` → new versioned `.sql`
  3. Review SQL; commit schema + migration together
  4. `pnpm db:migrate` locally; test against `local.db`
  5. Merge to `main` → Vercel production build (`scripts/vercel-build.mjs`, gated on `VERCEL_ENV=production`) applies it to Turso, then builds
  - Rules: never edit an applied migration; expand/contract only (migration runs before new code is live); never `db:push` against prod.
  Link `[[local-dev-setup]]`.

- [ ] **Step 2: Update `local-dev-setup.md`** — replace the Docker-Postgres-on-5433 facts with: dev uses `DATABASE_URL=file:./local.db` (libSQL), no Docker; `pnpm db:migrate` + `pnpm db:seed`; admin login unchanged (`admin` / `admin123`).

- [ ] **Step 3: Add the pointer line to `MEMORY.md`:**
  `- [DB migration workflow](db-migration-workflow.md) — versioned Drizzle migrations, auto-applied on prod Vercel build`

---

### Task 8: Deploy handoff (interactive — requires the user's Turso + Vercel accounts)

Not code; documents the remaining steps done together with the user when they're ready. Do NOT attempt to run these unattended — they need the user's credentials.

- [ ] **Step 1: Provision Turso** — `turso db create church-mgmt`; capture the URL (`turso db show --url church-mgmt`) and a token (`turso db tokens create church-mgmt`). Apply the local migration to it once: `DATABASE_URL=<url> DATABASE_AUTH_TOKEN=<token> pnpm db:migrate`, then optionally `... pnpm db:seed`.
- [ ] **Step 2: Link Vercel** — `vercel link` (or connect the GitHub repo in the dashboard for auto-deploys).
- [ ] **Step 3: Set production env vars** in Vercel (`vercel env add` or dashboard): `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `AUTH_SECRET` (fresh `openssl rand -base64 32`), `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_APP_URL=<prod domain>`.
- [ ] **Step 4: Deploy** — push the branch / `vercel --prod`. The production build runs `drizzle-kit migrate` against Turso, then `next build`.
- [ ] **Step 5: Smoke-test production** — log in as admin, load members, record a check-in.

---

## Self-Review

**Spec coverage:**
- §1 stack change → Task 1. §2 schema mapping → Task 1 Step 2 + Task 4 (`ilike`→`like`). §3 client/config/env → Tasks 1 & 2 & 5. §4 migration reset → Task 3. §5 Vercel build → Task 5. §6 workflow reference → Task 7. §7 files touched → all covered (docker delete Task 2, `.gitignore` Task 2, memory Task 7). §8 verification → Task 6. Deploy (original goal) → Task 8. ✅ No gaps.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full content; commands have expected output. ✅

**Type consistency:** Inferred type names (`User`, `Member`, …) and column field names are unchanged from the current schema, so app code and `db/seed.ts` compile unchanged. `db`/`schema` exports from `@/db` keep the same names. Enum string arrays match `lib/constants.ts` verbatim. `like` replaces `ilike` at both its import and its single call site. ✅

**Known-open item (not a gap):** FK-enforcement mechanism on libSQL is verified in Task 6 Step 6 with an explicit remediation branch, matching the spec's "verify, don't assume."
