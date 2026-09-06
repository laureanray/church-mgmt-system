<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

> Everything below is project-specific. Keep it outside the marked block above,
> which the `next` package may rewrite on upgrade.

# IRM Ministries — church management

A members directory where every member carries a QR code; scanning that code
records attendance against a service. Staff sign in with a **username** (roles:
`admin`, `leader`, `usher`). Filipino church context — expect Taglish domain
terms in the schema and `en-PH` formatting throughout.

Stack: Next.js 16 App Router (route protection lives in `proxy.ts`, the
successor to `middleware.ts`) · React 19 · Drizzle ORM on Supabase Postgres ·
Auth.js v5 credentials · Tailwind 4 · shadcn/ui **Base UI** variant · zod v4 ·
vitest.

## shadcn here is the Base UI variant

`components.json` sets `"style": "base-nova"`, so `components/ui/*` wraps
`@base-ui/react`, not Radix. Three differences bite:

- Composition uses **`render`**, not `asChild` —
  `<SidebarMenuButton render={<Link href="/x" />}>`.
- `Select` takes `name` (so its value lands in `FormData`) and `items` (so the
  trigger can render a label instead of the raw value). `FormSelect` in
  `components/form/form-select.tsx` wires this up; use it for selects in forms.
- There is no shadcn `form.tsx`, so no `<Form>` / `<FormField>` primitives.

## Forms are server actions over FormData

`react-hook-form` and `@hookform/resolvers` are listed in `package.json` but
nothing imports them. Every form follows one shape — `service-form.tsx` plus
`app/(app)/services/actions.ts` is the reference pair:

1. A `"use server"` action in the route's `actions.ts`, typed
   `(prev: XFormState, formData: FormData) => Promise<XFormState>`.
2. The action calls `requireRole([...])` first, then parses `FormData` with a
   zod schema from `lib/validators.ts`, returning
   `{ errors: fieldErrors(parsed.error), message }` when parsing fails.
3. On success: mutate, `revalidatePath()` each affected route, then `redirect()`.
4. The client component drives it with `useActionState(action, undefined)` and
   wraps each input in `<Field label htmlFor error>` from `components/form/field.tsx`.

Validators normalise empty strings to `null` (`emptyToNull`), so optional
columns stay nullable rather than filling with `""`.

## Auth

- `lib/auth-helpers.ts` exports `requireUser()` and `requireRole([...])`, both
  of which redirect. Call one at the top of **every** page and **every** server
  action: `proxy.ts` only checks that a session exists, so role enforcement is
  per-route.
- `auth.config.ts` is edge-safe — no db or bcrypt imports — because `proxy.ts`
  instantiates NextAuth from it. The Credentials provider and bcrypt stay in
  `auth.ts`.
- `canManage(role)` covers admin + leader (members, services, cell groups);
  `canManageUsers(role)` is admin only.

## Data

Postgres on Supabase, reached only through Drizzle. Supabase is a database
host here and nothing more: PostgREST, Supabase Auth, Storage and Realtime are
all switched off in `supabase/config.toml`, and sessions belong to Auth.js.

Two connection strings, because they are not interchangeable:

- `DATABASE_URL` — the app. In production this is the **transaction pooler**
  (port 6543), which cannot hold prepared statements, so `db/index.ts` turns
  them off when it sees that port.
- `DIRECT_URL` — drizzle-kit only. Migrations run DDL, which the transaction
  pooler does not support, so this must be a direct or session-pooler
  connection (port 5432).

Column types worth knowing before you query:

- Date-only fields (`birthdate`, `weddingAnniversary`, `spiritualBirthday`) are
  `date`, which Drizzle hands back as a `"YYYY-MM-DD"` **string**, not a `Date`.
  Render them with `formatDate`, which parses at local noon to dodge timezone
  rollover.
- Timestamps are `timestamp({ withTimezone: true })` and surface as `Date`.
- Enums are text columns constrained only in TypeScript — there are no
  Postgres `ENUM` types. Adding a value means editing `db/schema.ts`,
  `lib/constants.ts` and `lib/validators.ts` together.

Migrations are versioned and committed: `pnpm db:generate`, then
`pnpm db:migrate`. `scripts/vercel-build.mjs` applies them on Vercel
**production** deploys only (previews skip). Supabase's own migration runner is
disabled so that `db/migrations` stays the single schema history; `db:push`
would desync it, so reach for generate + migrate instead.

## Invariants to preserve

- Attendance is unique per `(memberId, serviceId)`. `recordAttendance` detects
  a duplicate scan by an empty `returning()` after `onConflictDoNothing()`.
- Generated services are unique per `(scheduleId, scheduledAt)` — that
  constraint is what makes `generateForSchedule` idempotent.
- `topUpAllSchedules()` is called from the `/services` and `/scan` page loads.
  There is no cron; occurrences appear because someone opened a page.
- Editing or pausing a schedule rebuilds only *future, un-attended*
  occurrences. Past and already-scanned services survive.
- QR codes encode the bare `qrToken` (nanoid), never a URL, so scanning works
  offline and independent of the deployed host. `extractToken` additionally
  accepts a `?token=` URL for forward compatibility.
- `app_settings` is a single row keyed `"singleton"`; write it with
  `onConflictDoUpdate`.

## Working here

- `pnpm test` runs vitest over `lib/**/*.test.ts` only, in a `node`
  environment. Put pure logic in `lib/` so it is testable there —
  `lib/cell-graph.ts` with `lib/cell-graph.test.ts` is the model.
- Modules reaching the database or secrets import `"server-only"`.
- `pnpm db:up` starts the local stack; `pnpm db:reset` rebuilds and reseeds it.
  It binds the `544xx` port block (Postgres `54422`, Studio `54423`) rather
  than Supabase's `543xx` default, so it coexists with other local Supabase
  projects.
- Seeded admin: username `admin`, password `admin123`.
- Commits follow `type(scope): summary`, e.g. `feat(cell-groups): …`.
