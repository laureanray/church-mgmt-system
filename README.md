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
- **Drizzle ORM** + **PostgreSQL** (local via Docker, Neon in production)
- **Auth.js (NextAuth v5)** — credentials + role-based access
- **@yudiel/react-qr-scanner** (scanning) + **qrcode** (generation)

## Getting started

### Prerequisites

- Node.js 20+ (24 recommended)
- pnpm 10+
- Docker Desktop (for local Postgres)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example env and adjust if needed (defaults work with the bundled
Docker Postgres):

```bash
cp .env.example .env
```

Generate a fresh `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### 3. Start the database

```bash
pnpm db:up        # starts Postgres in Docker on port 5433
pnpm db:migrate   # applies the schema
pnpm db:seed      # creates an admin user + sample members/services
```

### 4. Run the app

```bash
pnpm dev
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
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm db:up` / `pnpm db:down` | Start / stop local Postgres (Docker) |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed admin + sample data |
| `pnpm db:studio` | Open Drizzle Studio |

## Deployment (Vercel + Neon)

1. Create a **Neon Postgres** database (Vercel Marketplace) and copy its
   pooled connection string.
2. Set project env vars on Vercel: `DATABASE_URL`, `AUTH_SECRET`,
   `AUTH_TRUST_HOST=true`, and `NEXT_PUBLIC_APP_URL`.
3. Run migrations against the production database (`DATABASE_URL=… pnpm db:migrate`).
4. Deploy. Camera scanning requires HTTPS — Vercel provides this automatically.

## Project structure

```
app/(app)/         Authenticated app (dashboard, members, services, scan, users)
app/login/         Sign-in page
auth.ts            NextAuth setup (credentials + roles)
proxy.ts           Route protection (Next.js middleware/proxy)
db/schema.ts       Drizzle schema (members, services, attendance, users)
components/         UI + feature components (shadcn/ui in components/ui)
lib/               Validators, formatting, QR + auth helpers
```
