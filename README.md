# IRM Ministries

Church management for IRM Ministries — manage members and record attendance
with per-member QR codes. Each
member gets a unique QR code; scan it at the entrance (phone/tablet camera or a
USB scanner) to instantly record attendance against a service.

## Features

- **Members** — full directory with all pastoral details (birthdate, spiritual
  birthday, year joined IRM, marital status, spouse, family, contact, address,
  education, occupation). Each member has a unique, printable **QR code**.
- **Services** — define worship services, prayer meetings, Bible studies, etc.
  Attendance is recorded per service.
- **QR attendance scanning** — a camera-based scan page (with a manual / USB
  scanner fallback), live check-in feed, and automatic duplicate prevention.
- **Roles** — `admin`, `leader`, and `usher`:
  - **Admin** — everything, including managing staff users.
  - **Leader** — manage members and services, scan attendance.
  - **Usher** — scan attendance and view records.
- **Dashboard** — members, services, and attendance stats at a glance.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + **React 19**
- **Tailwind CSS 4** + **shadcn/ui** (Base UI variant)
- **Drizzle ORM** + **PostgreSQL** (Supabase — local CLI stack in dev, hosted in production)
- **Supabase Auth** — email + password, with roles held in the app's `users` table
- **@yudiel/react-qr-scanner** (scanning) + **qrcode** (generation)

## Getting started

### Prerequisites

- [Bun](https://bun.sh) 1.4+ (package manager, task runner and test runner)
- Docker Desktop (the local Supabase stack runs in Docker)
- [Supabase CLI](https://supabase.com/docs/guides/local-development) 2+

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Copy the example env and adjust if needed (the defaults match the local
Supabase stack):

```bash
cp .env.example .env
```

Then fill in the Supabase Auth keys, which `bun run db:up` prints (and
`supabase status` repeats):

```bash
supabase status   # copy API_URL, ANON_KEY and SERVICE_ROLE_KEY
```

### 3. Start the database

```bash
bun run db:up        # supabase start — Postgres on 54422, Studio on 54423
bun run db:migrate   # applies the Drizzle migrations
bun run db:seed      # creates an admin user + sample members/services
```

> This project uses the `544xx` port block rather than Supabase's `543xx`
> default, so it can run alongside other local Supabase projects.

Only Postgres and Studio are enabled — the app talks to Postgres directly
through Drizzle, so Storage and Realtime stay switched off in
`supabase/config.toml`. The API gateway and Auth are on, because Supabase Auth
is the identity provider.

### 4. Run the app

```bash
bun run dev
```

Open http://localhost:3000 and sign in with the seeded admin:

- **Email:** `admin@church.local`
- **Password:** `admin123`

> Change this password (or create your own admin) before using in production.

## How to use it

1. **Add a member** (Members → Add Member). A unique QR code is generated on
   their detail page — **Print** or **Download** it and give it to the member.
2. **Create a service** (Services → Add Service).
3. **Scan attendance** (Scan Attendance): pick the service, then point the
   camera at a member's QR code. Each scan records their attendance; scanning
   the same member twice for one service is safely ignored.

## Google Sheets export

Attendance can be pushed to a Google Sheet you control — no Google Cloud account
needed. In the app go to **Settings** (admin), then:

1. Open your Google Sheet → **Extensions ▸ Apps Script** and paste the script
   shown on the Settings page (it already contains your secret).
2. **Deploy ▸ New deployment ▸ Web app** (Execute as: Me, Access: Anyone), and
   copy the Web app URL.
3. Paste the URL into Settings, **Save**, then **Test connection**.

Then use **Sync all attendance** (Settings) or **Sync to Sheets** (on any
service). Rows are de-duplicated by attendance ID, so re-syncing never creates
duplicates. Columns: `ID · Timestamp · Service · Service Date · Member · Recorded By`.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the dev server (Next runs on the Bun runtime) |
| `bun run build` / `bun run start` | Production build / serve (Node, as on Vercel) |
| `bun run db:up` / `bun run db:down` | Start / stop the local Supabase stack |
| `bun run db:reset` | Drop, re-migrate and re-seed the local database |
| `bun run db:generate` | Generate a migration from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed admin + sample data |
| `bun run db:studio` | Open Drizzle Studio |

## Testing

See [the testing guide](docs/testing.md) for the assessment, unit/integration/E2E
setup, database isolation, CI, and coverage priorities. Start with `bun test lib`;
for all suites, run `bun run test:db:up`, install Chromium with
`bunx playwright install chromium`, then run `bun run test:all`.

## Deployment (Vercel + Supabase)

1. Connect the **Supabase integration** to the Vercel project (Storage ▸ your
   Supabase store ▸ Connect Project). It injects `POSTGRES_URL` (transaction
   pooler, 6543) and `POSTGRES_URL_NON_POOLING` (session pooler, 5432), which
   the app and drizzle-kit pick up automatically — nothing to copy by hand, and
   the values keep working when Supabase rotates the credentials.

   Without the integration, set `DATABASE_URL` to the transaction pooler and
   `DIRECT_URL` to the session pooler / direct connection yourself. Migrations
   run DDL, which the transaction pooler does not support, so the two cannot be
   the same URL.
2. Set the remaining env vars on Vercel: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
   `NEXT_PUBLIC_APP_URL`. The Supabase integration injects the first two under
   its own names, so they may already be present as `SUPABASE_URL` /
   `SUPABASE_ANON_KEY` — the `NEXT_PUBLIC_` copies are what the browser needs.
   The service-role key must **not** be `NEXT_PUBLIC_`.
3. Deploy. `scripts/vercel-build.mjs` applies migrations automatically on
   **production** deploys (previews skip them). Camera scanning requires
   HTTPS — Vercel provides this automatically.

## Project structure

```
app/(app)/         Authenticated app (dashboard, members, services, scan, users)
app/login/         Sign-in page
lib/supabase/      Supabase clients (server / browser / service-role admin)
proxy.ts           Route protection (Next.js middleware/proxy)
db/schema.ts       Drizzle schema (members, services, attendance, users)
db/migrations/     Versioned SQL migrations (drizzle-kit)
supabase/          Local Supabase stack config (Postgres + Studio only)
components/         UI + feature components (shadcn/ui in components/ui)
lib/               Validators, formatting, QR + auth helpers
```
